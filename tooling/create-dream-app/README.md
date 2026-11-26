# create-dream-app

Start a new app from the [Dream Starter Kit](https://github.com/vpv-group/dream-starter-kit):
a Next.js web app and an Expo mobile app on one Supabase backend.

```bash
npx create-dream-app my-app
cd my-app && pnpm dev:next
```

It clones the kit's newest release **with its git history** and keeps the kit as
the `upstream` remote, so kit updates are ordinary merges from day one. Then it
runs `pnpm dev:setup`: Docker, a local Supabase, `.env`, and a dev admin you can
sign in with right away.

| Option                        | What it does                                                |
| ----------------------------- | ----------------------------------------------------------- |
| `--name "My App"`             | Display and package name (default: from the directory)      |
| `--modules crm,client-portal` | Install these Dream catalog modules after setup             |
| `--github`                    | Create a private GitHub repository with `gh` and push to it |
| `--no-setup`                  | Skip `pnpm dev:setup` (no Docker needed)                    |
| `--tag v2.4.0`                | Start from a specific kit release                           |
| `--kit <git url>`             | Start from a fork of the kit                                |

Needs Node 22+, git and pnpm; Docker for the local stack.
