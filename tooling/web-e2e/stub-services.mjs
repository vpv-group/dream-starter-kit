// Stub meetdream.com registry + GitHub REST API for the Updates E2E
// (updates.spec.ts). The Next.js server calls these, so Playwright's
// page.route can't intercept them: playwright.config.ts starts this as a
// second webServer and points DREAM_REGISTRY_URL / DREAM_GITHUB_API_URL here.
//
//   /registry/*   the Dream registry routes the kit uses (incl. the Stripe
//                 connector — stub-stripe.mjs, for stripe-connect.spec.ts)
//   /github/*     the GitHub REST routes the kit uses
//   POST /__scenario {connected, hold, pausedReason, prs}   set the scene
//   GET  /__log      what the app sent (settings saves, dispatches)
//
// Plain ESM JavaScript so it runs with `node` directly, no build step.
import { createServer } from "node:http";

import { stripeBroker, stripeControls } from "./stub-stripe.mjs";

export const STUB_SITE_KEY = "dsk_e2e_site_key";
const PORT = Number(process.env.STUB_SERVICES_PORT ?? 4010);

const DEFAULT_SETTINGS = {
  autoUpdate: true,
  autoMerge: true,
  paused: [],
  skipped: [],
  pausedReason: null,
};

let scenario = {
  connected: true,
  hold: null,
  settings: { ...DEFAULT_SETTINGS },
  prs: [],
};
let log = [];

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return { raw, json };
}

function registry(req, res, path, body, raw, search) {
  const key = req.headers["x-dream-license-key"];
  if (path === "/catalog") {
    return send(res, 200, {
      schema: 2,
      modules: [
        {
          slug: "crm",
          name: "CRM",
          description: "Contacts and deals.",
          latest: "1.0.0",
          access: "free",
          repo: "https://github.com/vpv-group/dream-mod-crm",
        },
        {
          slug: "projects",
          name: "Projects",
          description: "Projects, milestones and tasks.",
          latest: "0.1.0",
          access: "free",
          repo: "https://github.com/vpv-group/dream-mod-projects",
        },
        {
          slug: "projects-adapter-github",
          name: "Projects · GitHub",
          description: "Sync Projects tasks with GitHub issues.",
          latest: "0.1.0",
          access: "free",
          repo: "https://github.com/vpv-group/dream-mod-projects-adapter-github",
          requires: ["projects"],
        },
      ],
    });
  }
  if (key !== STUB_SITE_KEY) {
    return send(res, 401, { code: "invalid_key", message: "Unknown key" });
  }
  if (stripeBroker(req, res, send, path, search, raw, body)) return;
  if (path === "/entitlements") {
    return send(res, 200, { entitlements: ["crm"] });
  }
  if (path === "/sites/updates" && req.method === "GET") {
    return send(res, 200, {
      connections: {
        source: scenario.connected
          ? { provider: "github", repo: "acme/e2e-app" }
          : null,
      },
      settings: scenario.settings,
      hold: scenario.hold,
      brokerConfigured: true,
    });
  }
  if (path === "/sites/settings" && req.method === "PUT") {
    const { resume, ...owner } = body ?? {};
    scenario.settings = {
      ...owner,
      pausedReason: resume ? null : scenario.settings.pausedReason,
    };
    log.push({ type: "settings", body });
    return send(res, 200, { settings: scenario.settings });
  }
  if (path === "/sites/github-token" && req.method === "POST") {
    if (!scenario.connected) {
      return send(res, 409, {
        code: "not_connected",
        message: "Connect GitHub first",
      });
    }
    return send(res, 200, {
      token: "ghs_e2e",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      repo: "acme/e2e-app",
    });
  }
  if (path === "/connect/github/start" && req.method === "POST") {
    log.push({ type: "connect", body });
    return send(res, 200, {
      url: `http://localhost:${PORT}/github-install?state=e2e`,
    });
  }
  return send(res, 404, { code: "not_found" });
}

function github(req, res, path, body) {
  if (req.headers.authorization !== "Bearer ghs_e2e") {
    return send(res, 401, { message: "Bad credentials" });
  }
  const repo = "/repos/acme/e2e-app";
  if (path === repo) return send(res, 200, { default_branch: "main" });
  if (path === `${repo}/pulls`) return send(res, 200, scenario.prs);
  if (path === `${repo}/actions/workflows/module-ops.yml/runs`) {
    return send(res, 200, { workflow_runs: [] });
  }
  if (path === `${repo}/actions/workflows/module-ops.yml/dispatches`) {
    log.push({ type: "dispatch", body });
    return send(res, 204);
  }
  return send(res, 404, { message: "Not Found" });
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (req.method === "OPTIONS") return send(res, 204);
  const { raw, json: body } =
    req.method === "GET" ? { raw: "", json: null } : await readBody(req);
  if (url.pathname === "/health") return send(res, 200, { ok: true });
  if (await stripeControls(req, res, send, url, body)) return;
  if (url.pathname === "/__scenario" && req.method === "POST") {
    scenario = {
      connected: body?.connected ?? true,
      hold: body?.hold ?? null,
      settings: { ...DEFAULT_SETTINGS, ...(body?.settings ?? {}) },
      prs: body?.prs ?? [],
    };
    log = [];
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/__log") return send(res, 200, log);
  if (url.pathname.startsWith("/registry/")) {
    return registry(
      req,
      res,
      url.pathname.slice("/registry".length),
      body,
      raw,
      url.search,
    );
  }
  if (url.pathname.startsWith("/github/")) {
    return github(req, res, url.pathname.slice("/github".length), body);
  }
  return send(res, 404, { code: "not_found" });
}).listen(PORT, () => {
  console.log(`stub services on http://localhost:${PORT}`);
});
