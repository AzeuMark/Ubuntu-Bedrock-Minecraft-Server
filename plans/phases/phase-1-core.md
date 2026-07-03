# Phase 1 — Core Foundation

> **This is the core/foundation phase.** Everything in later phases builds on the structure, auth, screen helper, and theme system established here. After Phase 1 you have a working (if minimal) panel: log in, see status, start/stop/restart the game, and resize swap.

## Goal
A working skeleton: backend running + React panel running + login + Dashboard with status, power buttons, Memory/Swap card, and light/dark toggle. No other pages yet (just placeholders).

## Tasks

### 1. Backend scaffold (`server/`)
- `pnpm init` in `server/`; install deps: `express`, `bcryptjs`, `express-session`, `dotenv`, and dev dep `nodemon`.
- `server/src/config.js`: reads `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, `PORT=3000`, `BEDROCK_DIR` (default `~/bedrock-server`) from `.env`.
- `server/.env.example`: template (placeholder for the bcrypt hash; never commit `.env`).
- `server/src/server.js`: Express app, JSON body parser, session middleware, mounts routers under `/api/*`, serves built React files from `bedrock-server/dist` for any non-API route (single-port app).
- `server/src/index.js`: boots on `PORT`.

### 2. Auth (`server/src/routes/auth.js`)
- `POST /api/login` — body `{ password }` → `bcrypt.compare(password, ADMIN_PASSWORD_HASH)` → set `req.session.user = "admin"`.
- `POST /api/logout` — destroy session.
- `GET /api/me` — returns logged-in status (so the panel can show login vs. dashboard).
- A small `requireAuth` middleware used by all other routers (except `auth.js` and `me`).

### 3. screen helper (`server/src/lib/screen.js`)
- `SCREEN_NAME = "bedrock"`.
- `isRunning()` → `screen -ls` parse (does the session exist and is it not Dead?).
- `start()` → if exists & alive, no-op; else `screen -dmS bedrock -L` + `cd $BEDROCK_DIR && LD_LIBRARY_PATH=. ./bedrock_server`. (Cite: guide step 6 + step 8.)
- `stop()` → send `stop` to screen stdin; wait briefly; if still alive, kill. (Cite: guide step 8 `stop`.)
- `restart()` → `stop()` then `start()`.
- All shell execution uses Node's `child_process` with no shell interpolation of user input (prevent command injection).

### 4. sudoers helper (`server/src/lib/sudoers.js`)
- Thin wrapper around `child_process.execFile('sudo', [...])` for the whitelisted commands only (used in Phase 1 by `swap.js`).
- Document the `/etc/sudoers.d/bedrock-panel` rule (see Phase 7) — Phase 1 assumes the rule is present at test time.

### 5. status + power + swap routes
- `server/src/routes/status.js` → `GET /api/status` → `{ running: boolean }` (calls `screen.isRunning()`).
- `server/src/routes/power.js` → `POST /api/start|stop|restart` → calls screen helper. Returns `{ ok, running }`.
- `server/src/routes/swap.js`:
  - `GET /api/swap` → parse `free -h` output → `{ swap: "...", ram: "..." }` (Cite: guide step 9 `free -h`.)
  - `POST /api/swap` → body `{ sizeGb }`.
    - **Enforce stop-first rule:** if `screen.isRunning()` → `409 Conflict` with message `"Please stop the server first before changing the swap size."`.
    - Otherwise run the resize sequence via `sudo`: `swapoff /swapfile` → `fallocate -l <N>G /swapfile` → `chmod 600 /swapfile` → `mkswap /swapfile` → `swapon /swapfile`. (Cite: guide step 5 "Resizing Swap". `/etc/fstab` is NOT touched.)

### 6. React panel (`bedrock-server/`)
- Clean out the default Vite template in `src/App.jsx`.
- Add `react-router-dom` for the 6-page routing skeleton (other pages are placeholder "Coming soon" cards).
- `src/api.js`: small fetch wrapper; on 401 → redirect to login.
- `src/components/Sidebar.jsx`: vertical nav with 6 links (Dashboard active).
- `src/components/ProtectedRoute.jsx`: if not logged in → redirect `/login`.
- `src/components/StatusBadge.jsx`: green/red dot + label based on `running`.
- `src/components/ThemeToggle.jsx`: toggles `document.documentElement.classList` `.dark` and persists in `localStorage["bedrock-panel-theme"]`.
- `src/pages/Login.jsx`: password-only form → `POST /api/login` → redirect `/`.
- `src/pages/Dashboard.jsx`:
  - Header: "Bedrock Server" + `<ThemeToggle/>`.
  - `<StatusBadge/>` polling `GET /api/status` every ~3s.
  - Power buttons: Start / Stop / Restart → `POST /api/power/*`; optimistic + confirm via next status poll.
  - **Memory & Swap card:** shows current swap + RAM (from `GET /api/swap`); numeric input (GB) + "Apply" button → `POST /api/swap`. Displays a clear error message if backend returns 409.

### 7. Theme system (`src/index.css`)
- Define CSS custom properties under `:root` (light) and override under `.dark`. Use the Modern Grass palette from `plan.md`.
- Apply background/surface/text/primary/secondary/status variables to the layout + components.
- Ensure the `<ThemeToggle>` initializes the class from `localStorage` on app load.

## Validation (Phase 1 done when these pass)
1. `cd server && pnpm dev` runs; `cd bedrock-server && pnpm dev` runs; login page appears.
2. Enter wrong password → rejected. Correct password → redirect to Dashboard.
3. Server Running → `<StatusBadge>` shows green "Running"; click Stop → after the poll, turns red "Stopped"; `screen -ls` shows no `bedrock` session.
4. With server stopped, set swap `4` → Apply → success message; `free -h` reflects the new swap.
5. Start server, attempt swap Apply → blocked with the "Please stop the server first…" message.
6. Toggle dark/light → persists across page refresh.

## Do not do in this phase
- Don't build Logs/Console/Properties/Files/Backups pages beyond placeholders.
- Don't write the systemd unit yet (Phase 7).
- Don't harden the sudoers rule yet (Phase 7) — but assume it exists for the swap test.

## Cites
- Guide step 6 (`LD_LIBRARY_PATH=. ./bedrock_server`), step 8 (screen sessions), step 5 (swap + Resizing Swap), step 9 (`free -h`).
- Pterodactyl homepage "Security First" (bcrypt + session).
