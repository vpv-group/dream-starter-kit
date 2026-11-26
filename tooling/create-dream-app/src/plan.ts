/**
 * `npx create-dream-app my-app` — what to run, as data. Pure, so every rule
 * is pinned by plan.test.ts; cli.ts executes the steps.
 *
 * The new app is a clone of the kit's newest RELEASE with its git history
 * kept, and the kit as the `upstream` remote. Kit updates are then plain
 * three-way merges from day one (docs/UPDATING.md), with no
 * `--allow-unrelated-histories`.
 */

export const KIT_URL = "https://github.com/vpv-group/dream-starter-kit.git";

export interface CreateOptions {
  dir: string;
  /** Display name; also used for the package name and a new GitHub repo. */
  name: string;
  kitUrl: string;
  /** vX.Y.Z to start from (the newest release when omitted). */
  tag: string;
  /** Module slugs to install from the Dream catalog after setup. */
  modules: string[];
  /** Create a private GitHub repo with `gh` and push to it. */
  github: boolean;
  /** Run `pnpm dev:setup` (Docker + local Supabase). */
  setup: boolean;
}

export interface Step {
  label: string;
  cmd: string;
  args: string[];
  /** Relative to where the command was run; "." = there, else the app. */
  cwd: "." | "app";
  /** A failure doesn't stop the rest (prints a hint instead). */
  optional?: boolean;
}

export type ParseResult =
  | { ok: true; options: Omit<CreateOptions, "tag"> & { tag?: string } }
  | { ok: false; error: string };

const SLUG = /^[a-z][a-z0-9-]{0,63}$/;

export const USAGE = `Usage: npx create-dream-app <directory> [options]

  --name "<App name>"     Display name (default: from the directory)
  --modules a,b           Install these Dream catalog modules after setup
  --github                Create a private GitHub repo with gh and push
  --no-setup              Skip pnpm dev:setup (Docker + local Supabase)
  --tag vX.Y.Z            Start from this kit release (default: the newest)
  --kit <git url>         Start from a fork of the kit instead
`;

/** "my-app" → "My App". */
export function titleFromDir(dir: string): string {
  const base = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
  return base
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "My App!" → "my-app" (package and repository name). */
export function packageName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "dream-app";
}

export function parseArgs(argv: string[]): ParseResult {
  const positional: string[] = [];
  let name: string | undefined;
  let tag: string | undefined;
  let kitUrl = KIT_URL;
  let modules: string[] = [];
  let github = false;
  let setup = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    try {
      if (arg === "--name") name = value();
      else if (arg === "--tag") tag = value();
      else if (arg === "--kit") kitUrl = value();
      else if (arg === "--modules") {
        modules = value()
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean);
      } else if (arg === "--github") github = true;
      else if (arg === "--no-setup") setup = false;
      else if (arg.startsWith("--")) {
        return { ok: false, error: `Unknown option ${arg}` };
      } else positional.push(arg);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
  const dir = positional[0];
  if (!dir) return { ok: false, error: "Give a directory for the new app." };
  if (positional.length > 1) {
    return { ok: false, error: `Unexpected argument ${positional[1]}` };
  }
  const bad = modules.find((m) => !SLUG.test(m));
  if (bad) return { ok: false, error: `"${bad}" isn't a module slug.` };
  if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) {
    return { ok: false, error: `--tag must look like v2.4.0, got ${tag}` };
  }
  return {
    ok: true,
    options: {
      dir,
      name: name?.trim() ? name.trim() : titleFromDir(dir),
      kitUrl,
      modules,
      github,
      setup,
      ...(tag ? { tag } : {}),
    },
  };
}

/** The newest stable vX.Y.Z from `git ls-remote --tags` output. */
export function latestRelease(lsRemote: string): string | null {
  const tags = lsRemote
    .split("\n")
    .map((line) => (line.split("\t")[1] ?? "").replace(/^refs\/tags\//, ""))
    .map((t) => t.replace(/\^\{\}$/, ""))
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  const parts = (t: string) => t.slice(1).split(".").map(Number);
  return (
    [...new Set(tags)].sort((a, b) => {
      const [x, y] = [parts(a), parts(b)];
      for (let i = 0; i < 3; i++) {
        const d = (y[i] ?? 0) - (x[i] ?? 0);
        if (d !== 0) return d;
      }
      return 0;
    })[0] ?? null
  );
}

export function planCreate(o: CreateOptions): Step[] {
  const steps: Step[] = [
    {
      label: `Download Dream Starter Kit ${o.tag}`,
      cmd: "git",
      args: ["clone", "--quiet", "--branch", o.tag, o.kitUrl, o.dir],
      cwd: ".",
    },
    {
      label: "Start your main branch",
      cmd: "git",
      args: ["checkout", "--quiet", "-b", "main"],
      cwd: "app",
    },
    {
      label: "Keep the kit as `upstream` for updates",
      cmd: "git",
      args: ["remote", "rename", "origin", "upstream"],
      cwd: "app",
    },
  ];
  if (o.github) {
    steps.push({
      label: "Create a private GitHub repository",
      cmd: "gh",
      args: [
        "repo",
        "create",
        packageName(o.name),
        "--private",
        "--source",
        ".",
        "--remote",
        "origin",
        "--push",
      ],
      cwd: "app",
      optional: true,
    });
  }
  if (o.setup) {
    steps.push({
      label: "Set up the local stack (Docker, Supabase, .env, dev admin)",
      cmd: "pnpm",
      args: ["dev:setup"],
      cwd: "app",
    });
    for (const slug of o.modules) {
      steps.push({
        label: `Install the ${slug} module`,
        cmd: "pnpm",
        args: ["mod", "add", `dream:${slug}`],
        cwd: "app",
        optional: true,
      });
    }
  } else if (o.modules.length > 0) {
    steps.push({
      label: "Install dependencies",
      cmd: "pnpm",
      args: ["install"],
      cwd: "app",
    });
    for (const slug of o.modules) {
      steps.push({
        label: `Install the ${slug} module`,
        cmd: "pnpm",
        args: ["mod", "add", `dream:${slug}`, "--no-apply"],
        cwd: "app",
        optional: true,
      });
    }
  }
  return steps;
}

/** The app's root package.json with its new name (kept otherwise). */
export function renamePackage(json: string, name: string): string {
  const pkg = JSON.parse(json) as Record<string, unknown>;
  pkg.name = packageName(name);
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
