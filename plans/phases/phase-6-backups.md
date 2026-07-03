# Phase 6 — Backups Page

## Goal
A **Backups** page to download the current world as a `.zip` and to restore a world from an uploaded `.zip`. Restore is BLOCKED while the server is running (stop-first rule).

## Background
The Bedrock world lives in `BEDROCK_DIR/worlds/`. Backups = zip that folder; restore = unzip an uploaded archive into `worlds/` (with a safety check). Mirrors the Backup/Restore pages linked from the Ubuntu guide.

## Tasks

### 1. Backend (`server/src/routes/backup.js`)
- `GET /api/backup/download`:
  - Build a `.zip` of `BEDROCK_DIR/worlds/` using a backend zip lib (or shell out to `zip` — already installed in Phase 1 setup). Stream it to the browser with a timestamped filename: `bedrock-worlds-YYYYMMDD-HHMM.zip`.
  - Allowed while running (read-only snapshot is fine).
- `POST /api/backup/restore` (multipart, field `file` = uploaded .zip):
  - **Stop-first guard:** if `screen.isRunning()` → `409` with `"Please stop the server first before restoring a world."`.
  - Validate the archive: must be a zip; each entry's path must resolve inside `worlds/` (path-traversal guard again, risk #4).
  - Rename the current `worlds/` to `worlds.bak-<timestamp>/` (one-click rollback if restore is bad), then extract the upload into a fresh `worlds/`.
  - Return `{ ok, backupDir: "worlds.bak-…" }` so the panel can tell you where the previous world was saved.

### 2. Frontend (`bedrock-server/src/pages/Backups.jsx`)
- "Download current world (.zip)" button → triggers `GET /api/backup/download` (browser save dialog).
- "Restore from a .zip" → file picker; on submit calls the restore endpoint.
  - If server running → show the stop-first error with a one-click "Stop & retry" that stops via Phase 1 power endpoint, then re-submits.
- After successful restore, show the name of the `worlds.bak-…` folder so you know where the old world went.
- Confirmation dialog before both download (large file) and restore (destructive).

## Validation
1. Download → unzip → contains the `worlds/` structure you saw in Phase 5 Files page.
2. Make a small world change in-game, download a backup, then break the world on purpose, restore from the backup → world returns to the backed-up state; `worlds.bak-…` exists.
3. Try to restore while server running → blocked with stop-first error; "Stop & retry" works.
4. Upload a zip containing a `../../../etc/whatever` entry → rejected (path-traversal guard).

## Do not do in this phase
- No scheduled/automatic backups (future nicety).
- No retention or cleanup of old `worlds.bak-*` folders (operator cleans manually, or Phase 7 documents a cron option).

## Cites
- Backup/Restore pages linked from the Ubuntu Bedrock guide.
