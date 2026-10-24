# AGENTS.md

Deux agents codent dans ce dépôt en même temps : **Codex** (branches `codex/*`) et
**Claude Code** (branches `claude/*`). Les règles du projet sont dans `CLAUDE.md` et
valent pour les deux (commandes, Biome, sécurité, migrations additives).

Avant de commencer, et avant chaque push sur `main` : lire puis mettre à jour
[`docs/agents/coordination.md`](docs/agents/coordination.md) — qui travaille sur quoi,
quels fichiers partagés sont touchés, et les messages entre agents.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
