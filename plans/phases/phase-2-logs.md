# Phase 2 — Logs Page

## Goal
A live, auto-scrolling log viewer on the **Logs** page that streams Bedrock's own log output to the browser.

## Background
Bedrock writes logs to files inside `~/bedrock-server/logs/`. The panel tails the newest log file and pushes new lines to the browser. (Alternative considered: `journalctl -u bedrock -f` from guide step 9 — but since the backend owns the screen session and Bedrock writes its own logs, tailing the log file is simpler and avoids needing journal rights.)

## Tasks

### 1. Backend log streaming (`server/src/routes/logs.js`)
- `GET /api/logs` → open the newest file in `BEDROCK_DIR/logs/`; return the last N lines (e.g. 200) as JSON to seed the page.
- `GET /api/logs/stream` (Server-Sent Events):
  - Hold the connection open; watch the newest log file for appended lines (Node `fs.watch` + read-from-last-offset).
  - If the log file rotates to a new file, follow it.
  - Send each new line as an SSE `data:` event.
- Path must resolve inside `BEDROCK_DIR/logs/`; reject anything outside.

### 2. Frontend (`bedrock-server/src/pages/Logs.jsx`)
- On mount: fetch seed lines, then open an `EventSource('/api/logs/stream')`.
- Render lines in a scrollable monospace `<pre>` box.
- Auto-scroll to bottom on new line, **unless** the user has scrolled up to read (respect their position).
- A "Pause / Resume" button; a "Clear screen" button (front-end only).
- Connect errors → show a banner + auto-reconnect with backoff.

## Validation
1. Open Logs page while server is stopped → shows existing seed lines (or empty if no logs).
2. Start the server → new startup lines appear live.
3. Have a player join the game → a join line appears automatically.
4. Scroll up so you're not at the bottom; new lines shouldn't yank you down. Scroll back to bottom → auto-resume.

## Do not do in this phase
- No log filtering/search (can be a later polish).
- Don't touch Bedrock's log retention/rotation config.

## Cites
- Guide step 9 (logs concept via `journalctl -u bedrock -f`); we use log-file tailing because the backend owns the screen process.
