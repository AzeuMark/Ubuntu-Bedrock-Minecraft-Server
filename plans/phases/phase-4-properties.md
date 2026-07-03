# Phase 4 — Server Properties Page

## Goal
A **Server Properties** page that reads `bedrock-server/server.properties` and lets you edit it through a friendly form, then writes changes back safely.

## Background
`server.properties` is a flat `key=value` text file with one entry per line and `#` comments. Bedrock reads it at startup, so most changes require a server restart to take effect.

## Tasks

### 1. Backend (`server/src/routes/properties.js`)
- `GET /api/properties`:
  - Read `BEDROCK_DIR/server.properties`.
  - Parse into a list of `{ key, value, type, comment }` preserving order and comments.
  - Return as JSON.
  - If the file is missing → return an empty list with a friendly note (server not yet started).
- `POST /api/properties` → body `{ entries: [{ key, value }] }`.
  - Validate types per a small known-schema (e.g. `server-port` integer, `gamemode` enum `survival|creative|adventure|spectator`, `difficulty` enum, `max-players` int ≥ 0, `level-name` string, booleans true/false).
  - Reject unknown keys with a clear error (prevents typos and injection of fake keys).
  - Write back preserving comments + ordering.
  - Use atomic write: write to `server.properties.tmp` then `fs.rename` (never half-write the live file).
- Permissions: the `bedrock-panel` user must own or have write access to the file (see Phase 7 setup).

### 2. Frontend (`bedrock-server/src/pages/ServerProperties.jsx`)
- Fetch on mount → render grouped form (Game, Network, World, Players sections using known keys).
- Per field: text input / number / select / boolean toggle depending on `type`.
- "Save" button → `POST /api/properties` with changed entries.
- After a successful save, if the server is running, show a yellow banner: *"Some changes only apply after restarting the server. [Restart now]"* — clicking Restart calls the Phase 1 restart endpoint.
- "Reset" button → reload from server (discards unsaved edits).

## Validation
1. Open the page right after first server start → fields populated from `server.properties`.
2. Change `max-players` to 20 → Save → file on disk reflects it → banner appears → click "Restart now" → in-game `/list` allows the new limit after restart.
3. Type a non-numeric value into `server-port` → rejected with a clear error.
4. An unknown key in the file is shown read-only with a warning (don't let the form edit it back badly).

## Do not do in this phase
- No live greylisting of which keys need a restart (just the blanket yellow banner).
- No multi-file config editing (permissions.json, allowlist.json — future).

## Cites
- Created at Bedrock server first run (guide step 6).
