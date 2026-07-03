# Phase 3 — Console Page

## Goal
A **Console** page where you type a line (e.g. `/say hello`, `/kick Steve`, `/op Alex`) and the backend writes it into the running screen session as if you typed it in the in-game console.

## Background
The Bedrock server reads commands from the screen session's stdin. Because our backend owns the `bedrock` screen session (Phase 1), we can send a line into it using `screen -S bedrock -X stuff "<line>\n"`. (Cite: guide step 8 — "Server Console Access", running commands inside the screen session.)

## Tasks

### 1. Backend (`server/src/routes/console.js`)
- **Gate behind `requireAuth`.**
- `POST /api/console` → body `{ command: string }`.
- **Guardrail:** if `!screen.isRunning()` → `409 Conflict` with `"The server is not running."` (don't allow sending to a dead session).
- Sanitize the command:
  - Trim; reject empty.
  - No embedded newlines or null bytes (one line only).
  - Length cap (e.g. 500 chars).
- Send via `screen -S bedrock -X stuff "<sanitized>\n"`. Use `execFile` with arg array — never build a shell string with user input.
- Append the command to the Logs stream (or a separate command audit ring) so it appears in the log view too.

### 2. Frontend (`bedrock-server/src/pages/Console.jsx`)
- Single-line input + "Send" button; Enter to submit.
- Disables input + Send when the server is not running (show a hint to start it from Dashboard).
- Show recent sent commands as a small list (ephemeral, this session only).
- Optionally show the live Logs stream beside the input so you can see the effect — can reuse the Phase 2 log viewer component.

## Validation
1. Server stopped → Console input is disabled with a hint.
2. Server running → type `/say hello from the panel` and Send → the message broadcasts in-game.
3. Sending an empty command does nothing (rejected client-side and server-side).
4. The command shows up in the Logs view too.

## Do not do in this phase
- No autocomplete / command history across sessions.
- No per-command allow-list (full admin trust; the operator is the logged-in admin).

## Cites
- Guide step 8 — sending input to the screen session ("Server Console Access").
