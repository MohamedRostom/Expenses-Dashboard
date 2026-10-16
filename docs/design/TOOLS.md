# Design tools

The owner's design workflow for the web UI refresh (spec 004, research R11). Every tool is
installed at user level on the owner's machine, outside the repository; none is a project
dependency and none appears in a `package.json`. Installed 2026-10-04.

| Tool | Version | Scope and location | Reinstall |
|------|---------|--------------------|-----------|
| impeccable (skill, detector, four `impeccable-*` agents) | 4.1.0 | `~/.claude/skills/impeccable`, `~/.claude/agents/impeccable-*.md` | `npx -y impeccable@4.1.0 install --global --providers=claude -y` |
| taste skills `design-taste-frontend`, `redesign-existing-projects` | repo HEAD on 2026-10-04 | `~/.claude/skills/` | `npx -y skills@1.7.0 add https://github.com/Leonxlnx/taste-skill --global --agent claude-code --skill design-taste-frontend --skill redesign-existing-projects --copy -y` |
| awesome-design-md | repo HEAD on 2026-10-04 | a clone outside the repo (session scratchpad) | `git clone --depth 1 https://github.com/VoltAgent/awesome-design-md <dir outside the repo>` |
| skillui | 1.3.4 | global npm package | `npm install -g skillui@1.3.4` |
| ui-ux-pro-max | plugin | Claude Code plugin, already installed | via the plugin marketplace |
| Magic UI MCP | `@magicuidesign/mcp` 2.0.0 | user-scope MCP server in `~/.claude.json` | `claude mcp add --scope user magicui -- npx -y @magicuidesign/mcp@2.0.0` |

`/impeccable init` and `/impeccable document` ran with the owner on 2026-10-05. Together they
wrote the root `PRODUCT.md` (product truth), the root `DESIGN.md` (the incumbent system, "The
Ledger Desk") and `.impeccable/design.json` (its sidecar). In this monorepo, run impeccable
helper commands from `apps/web` or `apps/landing` so they resolve those root files.

## When each tool runs

| Tool | How it is invoked | Used in |
|------|-------------------|---------|
| impeccable skill | `Skill: impeccable` (`/impeccable init` once, then its critique, audit and polish modes) | T024, T027, every screen change (critique before merge), T051 |
| impeccable detector | `npx -y impeccable@4.1.0 detect` on the changed files, and on the running route with `--viewport 360x800` and `--viewport 1280x800` | T027, T031–T042, T051; zero non-advisory findings, or each justified |
| impeccable agents | `impeccable-finish-reviewer` after each screen change; `impeccable-documenter` at the end | T031–T042, T052 |
| taste skills | `Skill: design-taste-frontend`, `Skill: redesign-existing-projects` | T025, T027, every screen change (audit before refresh), T051 |
| awesome-design-md | the clone | T024 shortlist; only the three chosen files are copied to `docs/design/references/` |
| skillui | `skillui --url <reference site>` into a folder outside the repo | T024, optional |
| ui-ux-pro-max | `Skill: ui-ux-pro-max:ui-ux-pro-max` | T024, T025 |
| Magic UI MCP | its MCP tools | T025, T027; ideas only, no code copied |

Every UI change records a **Design tools** section in its commit body or PR description: what
ran, on what, the findings, and what was fixed or kept. The spec, the constitution and
`DESIGN.md` win over any tool's advice.
