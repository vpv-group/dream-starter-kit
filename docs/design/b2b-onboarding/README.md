# Dream Starter Kit — B2B workspace onboarding package

Everything Claude Code needs to add B2B (workspace) sign-up and onboarding to
`vpv-group/dream-starter-kit`.

## Contents

| Path | What it is |
| --- | --- |
| `CLAUDE_CODE_PROMPT.md` | The prompt to paste into Claude Code (runs PR 1; PR 2 and 3 are follow-ups) |
| `spec/b2b-workspace-onboarding.md` | Product + data spec: account model, flows, `/welcome` routing, migration, RPCs, edge cases, build plan |
| `wireframes/index.html` | Open in a browser to browse every screen, mobile and desktop |
| `wireframes/SCREEN_MAP.md` | Each wireframe → route, PR, shadcn components |
| `wireframes/screenshots/` | PNGs of all 16 screens at 390×844 and 1440×900 |
| `wireframes/mobile/`, `wireframes/desktop/` | Clickable HTML wireframes (primary buttons link through the flows) |
| `wireframes/assets/` | Dream sample styling used by the wireframes only — not for the implementation |

## How to use

1. Unzip into the repo at `docs/design/b2b-onboarding/` and commit.
2. Open Claude Code at the repo root and paste the prompt from
   `CLAUDE_CODE_PROMPT.md` (everything below the line).
3. Review and merge PR 1, then tell Claude Code "Continue with PR 2".

The wireframes are rough: Claude Code builds the real screens with the kit's shadcn
components and theme tokens, so each founder's branding applies.
