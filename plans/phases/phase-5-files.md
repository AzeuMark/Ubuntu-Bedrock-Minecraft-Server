# Phase 5 — Files Page

## Goal
A full file manager for the whole `bedrock-server/` directory: browse folders, download, upload, and inline-edit text files. **Safety rule:** editing or replacing anything under `worlds/` is BLOCKED while the server is running.

## Background
You asked for a page to "see the world files" and manage server files. We extend it to the full server folder so you can edit configs (`server.properties` already has its own page in Phase 4 — this is for everything else: `allowlist.json`, `permissions.json`, behavior/resource packs, etc.).

## Tasks

### 1. Path-safety helper (`server/src/lib/paths.js`)
- A `resolveInside(base, rel)` function: resolve `path.join(base, rel)`, then verify the result is **inside** `base` (no `..` escapes, no absolute paths). Reject otherwise with `400`.
- Used by EVERY files endpoint. This is the critical security safeguard (risk #4 in `plan.md`).
- Also a `readInside / writeInside` guard that refuses to cross outside `base`.

### 2. Backend (`server/src/routes/files.js`)
- `GET /api/files?path=<rel>` → list a directory (`{ type: dir|file, name, size, mtime }[]`), recursive listing forbidden (one level at a time for safety/UX).
- `GET /api/files/content?path=<rel>` → return text content of a file. Restrict extensions to a known-text allow-list (`.json`, `.properties`, `.txt`, `.log`, `.mcstructure` is binary → skip). Binary → 415.
- `POST /api/files/content` → body `{ path, content }`. Save text. **Stop-first guard:** if `path` starts with `worlds/` and the server is running → `409` with `"Please stop the server first before changing files in the worlds/ folder."`
- `GET /api/files/download?path=<rel>` → stream a file (or a folder as a `.zip`) for download.
- `POST /api/files/upload?path=<rel_dir>` → multipart upload; place file in the target dir. **Stop-first guard** applies if the target is under `worlds/` while server is running.
- `POST /api/files/delete` → delete file or folder. Same stop-first guard for `worlds/`.
- Permissions: `bedrock-panel` user must own or have read/write on `BEDROCK_DIR` (Phase 7).

### 3. Frontend (`bedrock-server/src/pages/Files.jsx`)
- A breadcrumb + folder/file list table. Click a folder → drill in. Click a file → preview/edit (text) or download (binary).
- Top toolbar: "Upload", "New folder", "Download" (current folder as .zip), "Delete".
- Inline text editor for text files: textarea + "Save". Shows the yellow stop-first warning prominently if the path is under `worlds/` and the server is running (also enforced server-side).
- Show server running/stopped state at the top so you know when it's safe to edit `worlds/`.

## Validation
1. Browse to `bedrock-server/` root → lists files (`bedrock_server`, `server.properties`, `worlds/`, `logs/`, …).
2. Open `allowlist.json` → editable → Save → reload → persists.
3. While server running, try to edit `worlds/Bedrock level/level.dat` → blocked with the stop-first error. Stop the server → edit succeeds.
4. Try `GET /api/files/content?path=../../etc/passwd` → 400 (path traversal blocked).
5. Upload a `pack.mcmeta` into `resource_packs/my-pack/` (a non-`worlds` folder) while server running → succeeds.
6. Download the `worlds/` folder as a .zip → valid archive that unzips cleanly.

## Do not do in this phase
- No move/rename yet (delete + upload covers most needs; add move later if desired).
- No remote mounting or symlinks.

## Cites
- Guide step 3 (server directory layout). Safety rule is a user-defined consistency rule across phases.
