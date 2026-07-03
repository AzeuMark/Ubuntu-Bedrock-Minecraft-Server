# Bedrock Server Control Panel — Master Plan

> **The single source of truth for the whole project.** Read this first. Each phase (Phase 1–7) lives in its own file under `plans/phases/` and references back here for shared decisions, architecture, theme, security, and the file tree.
>
> Audience tone: this document is written for a **beginner programmer**. Every concept is explained in plain language, decisions are justified, and commands carry a "why." Technical depth is layered — skim the headings first, then read the sections you need.

---

## 1. What we are building (in one paragraph)

A **password-protected web panel** to manage a Minecraft **Bedrock dedicated server** that runs on an Ubuntu VPS. You open a website in your browser and click buttons (Start, Stop, Restart, send commands, edit files, run backups, resize swap) instead of typing Linux commands into SSH. It is **Bedrock-only** (no Java Edition support). The design is inspired by **Pterodactyl** (the popular open-source game-server panel) but simplified onto a single machine and a single programming language (**JavaScript**) so one beginner can build, run, and understand it.

---

## 2. Audience and guiding principles

The owner is a **beginner programmer**. Throughout this project we follow these guiding principles:

1. **One language (JavaScript)** for both the frontend (React) and backend (Node.js) so there is only one mental model to learn.
2. **One repo** to manage — everything lives in `Ubunto-Minecraft-Server-2/`.
3. **One running app on one port** in production — the backend also serves the built React files (no second web server needed to start).
4. **Least risky defaults** — whenever two valid approaches exist, we choose the one with the smaller blast radius if something goes wrong.
5. **Consistent safety rules** — the same "stop-server-first" rule applies everywhere a live edit could corrupt the running world (files, backups, swap).
6. **Plain-language comments and docs** — code and docs explain *why*, not just *what*.
7. **A working panel after every phase** — you can stop at the end of any phase and the panel still runs and is useful.

---

## 3. Scope (v1): exactly what is in and out

### 3.1 In scope (we will build this)
| Area | v1 deliverable |
|---|---|
| Pages | 6 sidebar pages: **Dashboard, Logs, Console, Server Properties, Files, Backups** |
| Dashboard | Live status indicator (Running/Stopped), **Start / Stop / Restart** buttons, **Memory & Swap card** (set a custom swap size in GB from the panel) |
| Auth | Private panel, single admin login using **bcrypt** password hashing + a signed session cookie |
| Console | Type in-game commands (`/say`, `/kick`, `/op`, …) that are piped into the running server |
| Logs | Live, auto-scrolling log viewer streaming Bedrock's own log output |
| Properties | Friendly form editor for `server.properties` with type validation and atomic writes |
| Files | Browse the *whole* `bedrock-server/` folder, plus upload, download, and inline-edit text files. **Editing under `worlds/` is blocked while the server runs** (stop-first rule). |
| Backups | Download the current world as a `.zip`; restore a world from an uploaded `.zip` (also blocked while running) |
| Theming | Light + dark mode with a theme toggle (default light); theme **"Modern Grass"** (emerald + sky blue) |
| Deployment | Single systemd unit auto-starts the backend on boot; the backend owns the Bedrock process via `screen` |

### 3.2 Out of scope (explicitly NOT in v1)
These are deliberately deferred. We list them so contributors don't accidentally build them and so users set expectations.

- **Multi-user accounts / per-user permissions.** Pterodactyl's sophisticated user model is skipped; v1 is a single logged-in admin. *(Rationale: one owner, simpler auth, fewer attack surfaces.)*
- **Docker container isolation.** Pterodactyl's core security feature (each server in an isolated container with strict resource limits). v1 runs Bedrock directly because there is exactly one server, owned by the same user running the panel. *(Rationale: Docker is a big learning curve; we trade isolation for simplicity. Document the trade-off.)*
- **Java Edition support.** The panel works with the Bedrock dedicated server only.
- **HTTPS / TLS.** v1 ships *without* TLS. The password crosses the network in cleartext. This is acceptable for a single-user learning panel that sits behind a firewall and is reached only by its owner. **Open item:** add a Caddy or Nginx reverse proxy with Let's Encrypt later (documented in README). This is the most important deferred item.
- **Remote multi-node management.** Pterodactyl can manage many "Nodes" (physical machines). v1 manages one machine.
- **Live CPU/RAM resource graphs.** Out for v1; the Memory & Swap card shows point-in-time values only.
- **Scheduled / automatic backups.** Only manual download + manual restore in v1.
- **Move/rename files** in the file manager (delete + upload covers most needs; revisit later).
- **Per-command allow-list / restricted operator mode.** The logged-in user is trusted as full admin.

---

## 4. Architecture (simplified Pterodactyl)

### 4.1 How Pterodactyl works (reference)
Pterodactyl splits duties across two pieces (cite: `pterodactyl.io/project/terms.html`):
- **Panel** — the website you log into. It *does not* run game servers itself.
- **Wings** — a daemon (written in Go) that *owns and controls* each game-server process on a physical machine (a "Node"). Wings runs inside Docker to isolate each server.

The Panel talks to Wings over an authenticated API. Security-first: **bcrypt** password hashing, **AES-256-CBC** secret encryption, HTTPS out of the box (cite: Pterodactyl homepage "Security First").

### 4.2 How our panel works (the simplified version)
We collapse Panel + Wings onto **one Ubuntu machine** and write the "mini Wings" in JavaScript instead of Go. We also skip Docker (see §3.2).

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        Ubuntu VPS  (single machine)                            │
│                                                                                 │
│   ┌──────────────────────────────┐         ┌────────────────────────────┐       │
│   │  Node.js + Express backend   │ ──owns──▶ │  bedrock_server            │       │
│   │  "mini Wings"                │ screen   │  (running inside a named   │       │
│   │  port 3000                   │          │   `screen` session "bedrock")│      │
│   │                              │          └────────────────────────────┘       │
│   │  Routes: /api/auth, status,  │                 │ reads/writes                │
│   │  power, logs, console,       │                 ▼                            │
│   │  properties, files, backup,  │          ┌──────────────────────┐            │
│   │  swap                        │ ◀───────  │ ~/bedrock-server/    │            │
│   │                              │  sudo    │  ├ bedrock_server    │            │
│   │  Also serves built React     │  (only   │  ├ server.properties │            │
│   │  files as static assets      │  for swap│  ├ worlds/           │            │
│   │  (single-port app)           │  cmds)   │  ├ logs/             │            │
│   └──────────────────────────────┘          │  └ resource_packs/  │            │
│                  ▲                          └──────────────────────┘            │
│                  │ systemd auto-starts                                           │
│                  │ on boot (does NOT start the game directly)                    │
│   ┌──────────────────────────────┐                                              │
│   │ systemd unit                 │                                              │
│   │ /etc/systemd/system/         │                                              │
│   │ bedrock-panel.service         │                                              │
│   └──────────────────────────────┘                                              │
│                                                                                 │
│   /etc/sudoers.d/bedrock-panel  ← locked-down rule lets the `bedrock-panel`     │
│                                    user run ONLY the swap commands              │
└─────────────────────────────────────────────────────────────────────────────────┘
                ▲
                │ HTTP/JSON + SSE (port 3000)
                │ session cookie (signed)
                │
        ┌───────┴────────┐
        │  Your browser   │
        │  React panel    │
        │  + login screen │
        └─────────────────┘
```

### 4.3 Key architectural decisions and the reason for each

| Decision | Reason |
|---|---|
| Backend **owns** the Bedrock process via `screen` (not raw `systemctl` directly managing the game) | Let the backend pipe in-game commands to the screen session (Console page). Mirrors Pterodactyl's "Wings owns the process." Cite: guide step 8 (screen) + step 6 (run manually) |
| **systemd auto-starts only the backend** on boot (not the game directly) | One service to manage in production. The backend, once up, can choose whether to auto-start the game — or just wait for you to click Start. Cite: guide step 7 pattern, adapted. |
| **Single port (3000)**; backend serves the built React files | One service, one firewall rule, one URL. Beginner-friendly. (User's confirmed choice.) |
| **No Docker** in v1 | Simpler setup; one server owned by the panel user. Trade-off documented (§3.2). |
| **Session cookie auth** (not JWT) | Server-side session via `express-session` is the simplest correct approach; the cookie is `httpOnly` + signed. No client-side token handling. |
| **SSE** for log streaming (not WebSocket, not polling) | Server-Sent Events are one-way (server→browser) which is exactly what logs need, they auto-reconnect, and they're simpler than WebSockets |

### 4.4 Complete backend → Linux command mapping
Every backend action maps to a real Linux command. This is the whole "control surface."

| API endpoint | Method | What it does on Ubuntu | Linux command(s) | Guide cite |
|---|---|---|---|---|
| `/api/login` | POST | Verify password against bcrypt hash; set session | (none — reads `.env`) | Pterodactyl "Security First" |
| `/api/logout` | POST | Destroy session | (none) | — |
| `/api/me` | GET | Who am I? (logged in?) | (none) | — |
| `/api/status` | GET | Is the Bedrock server running? | `screen -ls` (parse for `bedrock` session, not Dead) | step 8 + step 9 |
| `/api/power/start` | POST | Start Bedrock inside a screen session | `screen -dmS bedrock -L — sh -c 'cd $BEDROCK_DIR && LD_LIBRARY_PATH=. ./bedrock_server'` | step 6 + step 8 |
| `/api/power/stop` | POST | Stop Bedrock gracefully (then force if needed) | `screen -S bedrock -X stuff "stop\n"`; wait; if alive `screen -S bedrock -X quit` | step 8 (`stop`) |
| `/api/power/restart` | POST | Restart = stop + start | combination of the above | step 9 (idea) |
| `/api/logs` | GET | Seed the log view with the last N lines | read newest file in `~/bedrock-server/logs/` | step 9 (logs) |
| `/api/logs/stream` | GET (SSE) | Stream new log lines live | `fs.watch` on newest log file; follow rotations | step 9 |
| `/api/console` | POST | Send a command line to the Bedrock console | `screen -S bedrock -X stuff "<line>\n"` | step 8 (console) |
| `/api/properties` | GET/POST | Read/write `server.properties` atomically | read file; write tmp → `fs.rename` | (file exists after first run, step 6) |
| `/api/files` | GET | List a directory (1 level) | read entries inside `BEDROCK_DIR/<rel>` | step 3 folder |
| `/api/files/content` | GET/POST | Fetch/replace text file content | read/write file, path-guarded | — |
| `/api/files/download` | GET | Download a file or a folder (as .zip) | stream file / `zip -r -` | — |
| `/api/files/upload` | POST | Accept a multipart upload | write to `BEDROCK_DIR/<rel_dir>/<name>` | — |
| `/api/files/delete` | POST | Delete a file or folder | `fs.rm` recursive, guarded | — |
| `/api/backup/download` | GET | Zip `worlds/` for download | `zip -r - worlds/` or archiver lib | Backup page (linked from guide) |
| `/api/backup/restore` | POST | Stop-check → back up old → extract upload into `worlds/` | unzip + path-guard | Restore page (linked from guide) |
| `/api/swap` | GET | Current RAM + swap | parse `free -h` | step 9 (`free -h`) |
| `/api/swap` | POST | Resize swap (stop-check enforced) | `sudo swapoff /swapfile` → `sudo fallocate -l <N>G /swapfile` → `sudo chmod 600 /swapfile` → `sudo mkswap /swapfile` → `sudo swapon /swapfile` | step 5 (Resizing Swap) |

### 4.5 End-to-end data flow (an example: clicking "Start")
1. Browser sends `POST /api/power/start` with the session cookie.
2. Express: `requireAuth` checks the session → ok.
3. `routes/power.js` calls `lib/screen.js` `start()`.
4. `screen.js` checks `isRunning()` — `screen -ls | grep bedrock`.
5. If not running: spawn (via `child_process.spawn`, no shell string) `screen -dmS bedrock -L — sh -c "cd … && LD_LIBRARY_PATH=. ./bedrock_server"`.
6. Wait briefly; re-check `isRunning()`; respond `{ ok: true, running: true }`.
7. Browser's `Dashboard.jsx` receives ok, optimistically flips the badge to "Starting", and the poll (`GET /api/status` every 3s) confirms "Running".
8. If anything fails, respond with an error status and message; the Dashboard shows the message and reverts.

This is the pattern *all* power/log/console/file actions follow: **auth → guard → safe shell action via `execFile`/`spawn` (never shell interpolation) → honest response**.

---

## 5. Repo layout (with explanations for every folder and file)

The repository has two top-level project folders (`bedrock-server/` for the frontend, `server/` for the backend), plus the `plans/` folder you're reading now. Below, **every** folder and file has a one-line explanation so a beginner always knows what each piece is for.

### 5.1 Frontend — `bedrock-server/` (the React panel you see in the browser)
```
bedrock-server/
├── src/
│   ├── pages/                      # One file per sidebar page (React Router route)
│   │   ├── Dashboard.jsx          #   Status + Start/Stop/Restart + Memory/Swap card
│   │   ├── Logs.jsx                #   Live scrolling log box (SSE from backend)
│   │   ├── Console.jsx            #   Type in-game commands (/say, /kick…)
│   │   ├── ServerProperties.jsx   #   Form to edit server.properties
│   │   ├── Files.jsx              #   Browse/upload/download/edit server files
│   │   └── Backups.jsx            #   Download/restore world .zip
│   ├── components/                 # Reusable UI pieces shared across pages
│   │   ├── Sidebar.jsx            #   Left navigation menu (6 links) — shown on all pages
│   │   ├── StatusBadge.jsx        #   Green "Running" / red "Stopped" pill (polls /api/status)
│   │   ├── ThemeToggle.jsx        #   Light/dark switch (persists in localStorage)
│   │   ├── ProtectedRoute.jsx     #   Blocks all pages until you are logged in
│   │   ├── LogStream.jsx          #   Reusable live-log viewer (used by Logs + Console pages)
│   │   └── ErrorBanner.jsx        #   Consistent red/yellow banner for errors/warnings
│   ├── api.js                     # Fetch helper: adds credentials, handles 401 → /login redirect
│   ├── App.jsx                    # Layout (Sidebar + main area) + React Router wiring
│   ├── main.jsx                   # Entry point; mounts <App/> into #root in index.html
│   └── index.css                  # Global styles + theme CSS custom properties (light/dark)
├── public/                         # Static assets served as-is by Vite (favicon, icons)
├── index.html                      # The HTML shell Vite uses to mount React
├── vite.config.js                  # Vite config: dev server (5173), build → dist/
├── package.json                    # Frontend dependencies (react, react-dom, react-router-dom)
├── pnpm-lock.yaml                  # Locked dependency versions used by pnpm
├── .oxlintrc.json                  # Linter config (already present in your project)
└── README.md                       # Frontend-specific dev notes (optional)
```

### 5.2 Backend — `server/` (Node.js API that actually controls the server)
```
server/
├── src/
│   ├── routes/                      # One file per API area (Express router)
│   │   ├── auth.js                  #   /api/login, /logout, /me — bcrypt verify + session
│   │   ├── status.js                #   GET /api/status — is the screen session alive?
│   │   ├── power.js                 #   POST /api/power/{start,stop,restart} — controls screen
│   │   ├── logs.js                  #   GET /api/logs + /api/logs/stream (SSE) — Bedrock logs
│   │   ├── console.js               #   POST /api/console — send a line to screen stdin
│   │   ├── properties.js            #   GET/POST /api/properties — read/write server.properties
│   │   ├── files.js                 #   list/content/download/upload/delete — path-guarded
│   │   ├── backup.js                #   GET /api/backup/download + POST /api/backup/restore
│   │   └── swap.js                  #   GET/POST /api/swap — show + resize the swap file
│   ├── lib/                         # Shared helpers across routes
│   │   ├── screen.js                #   isRunning(), start(), stop(), restart() — screen helper
│   │   ├── sudoers.js               #   safe wrapper for the whitelisted sudo commands (swap)
│   │   ├── paths.js                 #   resolveInside(base, rel) — the path-traversal guard
│   │   ├── session.js               #   session middleware + requireAuth + current user
│   │   └── archive.js               #   zip/unzip helper (used by files + backup)
│   ├── config.js                    # Loads and validates env vars ( Bethany: see .env)
│   ├── server.js                    # Express app definition; mounts routers; serves dist/
│   └── index.js                     # Entry point; calls server.listen(PORT)
├── deploy/
│   └── bedrock-panel.service        # systemd unit that auto-starts THIS backend on boot
├── .env                             # Secrets — NEVER committed to git; loaded by config.js
├── .env.example                     # Template copy of .env — safe to commit
├── .gitignore                       # Ensures .env and node_modules are never committed
├── package.json                     # Backend deps (express, bcryptjs, express-session, dotenv…)
└── pnpm-lock.yaml                   # Locked backend dep versions
```

### 5.3 On the Ubuntu VPS (created during setup, NOT in the repo)
| Path | What it is | Created by |
|---|---|---|
| `~/bedrock-server/` | The actual Bedrock game + `worlds/`, `logs/`, `server.properties` | Guide step 3 |
| `/opt/bedrock-panel/` (example) | Where the deployed backend code lives; runs as `bedrock-panel` | Phase 7 install step |
| `/etc/systemd/system/bedrock-panel.service` | systemd unit installed from `server/deploy/` | Phase 7 |
| `/etc/sudoers.d/bedrock-panel` | The locked-down sudoers rule (only swap commands) | Phase 7 |
| `/swapfile` | The swap file (2 GB by default) | Guide step 5 |
| `/etc/fstab` | Gets one line appended so swap survives reboot | Guide step 5 |

---

## 6. The six sidebar pages (detailed page-by-page spec)

> The full implementation steps for each page live in its phase file. Here is the shared spec — what each page shows, what its source of truth is, and which endpoints it uses. This is so anyone can implement the pages in any order with consistency.

### 6.1 Dashboard
- **Shows:** `<StatusBadge/>` (polls `GET /api/status` every 3 s), three power buttons (Start / Stop / Restart → `POST /api/power/*`), and a **Memory & Swap card**.
- **Memory & Swap card:** shows current swap + RAM from `GET /api/swap`; a numeric input for GB and an "Apply" button → `POST /api/swap { sizeGb }`. If the server is running, the backend returns `409` and the card displays the message: *"Please stop the server first before changing the swap size."*
- **Header:** "Bedrock Server" title + `<ThemeToggle/>`.
- **Source of truth:** `GET /api/status` (poll) and the optimistic UI state after a power action.

### 6.2 Logs
- **Shows:** a scrollable monospace box seeded by `GET /api/logs`, then fed by `EventSource('/api/logs/stream')`.
- **Behavior:** auto-scroll to bottom on new line **unless** the user has scrolled up to read. "Pause / Resume" and "Clear" buttons (front-end only).
- **Resilience:** on SSE error, show a banner and auto-reconnect with backoff.
- **Source of truth:** the newest file inside `~/bedrock-server/logs/`, watched by the backend.

### 6.3 Console
- **Shows:** a single-line text input + "Send" button; beside it, a `<LogStream/>` so you can see the result.
- **State:** disabled when the server isn't running (with a hint to start it from Dashboard).
- **Sends:** `POST /api/console { command }` → backend writes the line to the screen session via `screen -S bedrock -X stuff`.
- **Recent commands:** shown as a small ephemeral list for this session only.
- **Source of truth:** `screen` session stdin.

### 6.4 Server Properties
- **Shows:** a form grouped by section (Game / Network / World / Players) seeded by `GET /api/properties`.
- **Field types:** text / number / select / boolean toggle, driven by a small known schema.
- **Saves:** `POST /api/properties { entries: [...] }` — backend validates types and writes atomically.
- **Restart hint:** if the server is running after a save, a yellow banner says *"Some changes only apply after restarting the server. [Restart now]"*.
- **Source of truth:** `~/bedrock-server/server.properties`.

### 6.5 Files
- **Shows:** breadcrumb + directory/file list table; drill into a folder by clicking; click a text file to edit inline, a binary file to download.
- **Toolbar:** Upload, New folder, Download (file or folder as .zip), Delete.
- **Safety:** editing/uploading/deleting anything **under `worlds/`** while the server is running is blocked (409) with the stop-first message. `..` / absolute paths get a 400. The server state is shown at the top so you know when it's safe.
- **Source of truth:** the `~/bedrock-server/` directory tree, guarded by `lib/paths.js`.

### 6.6 Backups
- **Shows:** a "Download current world (.zip)" button and a "Restore from a .zip" uploader.
- **Download:** `GET /api/backup/download` → streams `bedrock-worlds-YYYYMMDD-HHMM.zip`.
- **Restore:** `POST /api/backup/restore` (multipart). If the server is running → 409 with a "Stop & retry" one-click that stops, then re-uploads. On success, shows the `worlds.bak-<timestamp>/` folder name where the previous world was moved for rollback.
- **Source of truth:** the `~/bedrock-server/worlds/` folder.

---

## 7. Theme — "Modern Grass"

Adopted from popular Tailwind-style dashboard palettes so the panel looks modern, not dated. Emerald keeps a Minecraft-green feel; sky blue adds the cool / refreshing tone you asked for. (You chose theme **"D. Modern Grass"** and **light + dark with a toggle**.)

### 7.1 Color tokens
| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-primary` | `#10B981` (emerald) | `#10B981` | Primary buttons, active sidebar item, Running status dot |
| `--color-secondary` | `#0EA5E9` (sky) | `#0EA5E9` | Secondary actions, links, accents |
| `--color-bg` | `#F9FAFB` | `#111827` | Page background |
| `--color-surface` | `#FFFFFF` | `#1F2937` | Cards, sidebar, input backgrounds |
| `--color-text` | `#111827` | `#F3F4F6` | Primary text |
| `--color-muted` | `#6B7280` | `#9CA3AF` | Secondary text, captions |
| `--color-border` | `#E5E7EB` | `#374151` | Dividers, input borders |
| `--color-status-running` | `#10B981` | `#10B981` | Status indicator (Running) |
| `--color-status-stopped` | `#EF4444` (red) | `#EF4444` | Status indicator (Stopped) |
| `--color-warning` | `#F59E0B` (amber) | `#FBBF24` | Yellow "restart needed" banners |
| `--color-error` | `#EF4444` | `#EF4444` | Error messages, Stop button |

### 7.2 Design-system rules (required for the implementer)
1. Define every color above as a **CSS custom property** in `:root` (light defaults).
2. Override every variable under a `html.dark { … }` selector (we toggle the class on `<html>`).
3. Use only tokens — never raw hex in components — so the panel can be re-themed by editing one file.
4. `<ThemeToggle>` toggles `document.documentElement.classList.toggle('dark')` and persists the choice in `localStorage["bedrock-panel-theme"]`.
5. On app bootstrap, `main.jsx` reads `localStorage` and applies the class **before** first paint (to avoid a flash of the wrong theme).
6. Respect `prefers-color-scheme: dark` as the default when there is no stored preference.

### 7.3 Typography and spacing notes
- Use a system font stack (e.g. `ui-sans-serif, system-ui, …`) for body; a monospace stack for logs (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`).
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 px. Keep gutters consistent; cards have 16 px internal padding.
- Sidebar width: 220 px on desktop; collapses to a top bar on narrow screens (v1 can keep it simple — show the sidebar always and let it scroll).

---

## 8. Security model (the full picture)

This is the **most important section** for the implementer. We adopt bcrypt from Pterodactyl and a dedicated-user + locked-sudoers model for process control. Seven confirmed decisions:

### 8.1 Authentication
- **Single admin login**. The password is stored in `.env` as a **bcrypt hash** (never in plaintext, never in code). Generate it once with a one-liner and put the hash in `.env`:
  ```bash
  node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" 'yourpassword'
  ```
- `POST /api/login` runs `bcrypt.compare(password, ADMIN_PASSWORD_HASH)`. On success, set `req.session.user = "admin"`.
- Sessions are managed by `express-session` with `httpOnly`, `sameSite: 'strict'`, and a strong random `SESSION_SECRET` in `.env`.
- Every router except `auth.js` and `/api/me` is wrapped in a `requireAuth` middleware that redirects/401s unauthenticated callers.
- **No "remember me" / long-lived tokens** in v1. Close the browser → session ends (or expires after a few hours of inactivity).

### 8.2 Process ownership & the dedicated user
- The backend runs as a **dedicated system user `bedrock-panel`** — **never root** (risk #1).
- Because the backend *owns* the `screen` session, most actions (start/stop/restart/console) need **no sudo at all** — the user just manages a process it started.
- Read + exec permissions on `~/bedrock-server/` are granted to `bedrock-panel` so it can read logs, read/write `server.properties`, and execute the `bedrock_server` binary. Cite: guide step 3 (`chmod +x bedrock_server`) generalized via `chown`/`chmod`.

### 8.3 The locked-down sudoers rule
Swap resize needs root. We grant **only** those specific commands in `/etc/sudoers.d/bedrock-panel` (created in Phase 7):
```
bedrock-panel ALL=(root) NOPASSWD: /usr/sbin/swapoff /swapfile, \
    /usr/bin/fallocate -l *G /swapfile, \
    /bin/chmod 600 /swapfile, \
    /usr/sbin/mkswap /swapfile, \
    /usr/sbin/swapon /swapfile
```
- **No shells, no `systemctl`, no broad root.** If the panel is exploited, the attacker can resize swap and that's it.
- **Trade-off (risk #7):** this allow-list is broader than a pure-systemctl rule. Document it and keep the list minimal and reviewed.
- Validate it with `sudo visudo -c` before saving.

### 8.4 Firewall (cite: guide step 4)
```bash
# ALWAYS allow SSH first, before enabling ufw — or you get locked out
sudo ufw allow 22/tcp
sudo ufw allow 19132/udp    # Bedrock game traffic (UDP — fast, no handshake)
sudo ufw allow 19132/tcp    # Bedrock query/ping (so the server shows in friends lists)
sudo ufw allow 3000/tcp     # the panel itself
sudo ufw enable
```
- **Why UDP for 19132 game traffic?** Real-time game packets want low latency; UDP skips TCP's handshake/retransmit overhead. (Cite: guide step 4.)
- **Why exposing 3000 in v1:** you reach the panel from your browser over the internet. If you instead SSH-tunnel only, you can skip exposing 3000 and remove that line.

### 8.5 The "stop-server-first" rule (consistent safety across pages)
Any action that **could corrupt a running world** is blocked while the server is running, with a clear, human-readable error. Applied to:
| Action | Why blocked while running |
|---|---|
| Edit / replace / delete files under `worlds/` | The running server reads + writes these files constantly; concurrent writes corrupt the world |
| Restore a backup (replaces `worlds/`) | Same reason — would overwrite the live world |
| Resize swap | `swapoff`/`swapon` can disrupt running processes; safer to do while only the panel is active |

Implementation: the backend checks `screen.isRunning()` and returns **HTTP 409** with the same message family: *"Please stop the server first before …"* The frontend surfaces this consistent wording on each page, so the whole panel teaches one habit: **about to change something risky? Stop the server first**.

### 8.6 Path-traversal guard (the critical safeguard)
Every file/backup endpoint resolves the requested path with `lib/paths.js` `resolveInside(BEDROCK_DIR, rel)`:
1. `path.join(BEDROCK_DIR, rel)`.
2. Normalize and verify the result starts with `BEDROCK_DIR + path.sep`.
3. Reject any `..`, absolute, or symlinked-escape → **400 Bad Request**.
This is the single most important safeguard in the Files and Backups pages (risk #4). Never bypass it; never add a route that reads files without going through it.

### 8.7 Shell execution safety
- **Never build shell strings with user input.** Always use `child_process.execFile` / `spawn` with an argument array. (Defense against command injection.)
- Validate, trim, and length-cap all user-provided text (commands, filenames, swap size) before it ever reaches a subprocess.
- For file uploads, also enforce extension and size limits.

### 8.8 No HTTPS in v1 (the big caveat)
- The panel v1 talks plain HTTP. The bcrypt password *hash* lives in `.env`, but the password *you type* crosses the network in cleartext.
- **Why acceptable for v1:** single-user, behind `ufw`, reached mostly by the owner. **Why not acceptable long-term:** anyone on your network path can sniff the password.
- **Documented next step:** put Caddy (recommended for beginner friendliness) or Nginx in front of port 3000 with Let's Encrypt. README will include a minimal Caddyfile snippet.

---

## 9. Phased build

The work is split into **7 phases**, each in its own file under `plans/phases/`. Phases are ordered so each builds on the previous and leaves a working panel.

| File | Phase | Deliverable | When you can stop and play |
|---|---|---|---|
| `phases/phase-1-core.md` | **1 — Core Foundation** | Repo setup; backend scaffold + bcrypt login; screen-based Start/Stop/Restart; Dashboard with status + power buttons + Memory/Swap card + light/dark theme toggle (Modern Grass). **This is the core/foundation phase.** | After Phase 1 you can log in, start/stop/restart the game, and resize swap from the panel. |
| `phases/phase-2-logs.md` | 2 — Logs Page | Live scrolling log viewer (tails Bedrock `logs/`). | …see live server output in the browser. |
| `phases/phase-3-console.md` | 3 — Console Page | Send in-game commands to screen stdin. | …run `/say`, `/kick`, etc. from the panel. |
| `phases/phase-4-properties.md` | 4 — Server Properties Page | Edit `server.properties` via a form. | …edit server settings without SSH. |
| `phases/phase-5-files.md` | 5 — Files Page | Browse/upload/download/edit files with path guard + worlds/ blocked-while-running. | …browse and edit server files safely. |
| `phases/phase-6-backups.md` | 6 — Backups Page | Download/restore world `.zip` (blocked while running). | …back up and restore your world. |
| `phases/phase-7-finalization.md` | 7 — Finalization | Dedicated user + locked sudoers + systemd install + README + known-issues doc + end-to-end acceptance test. | After Phase 7 it's a real, deployable, documented project. |

Each phase file has the same shape: **Goal → Tasks → Validation → Do-not-do-this-phase → Cites**.

---

## 10. VPS setup prerequisites (one-time, on the Ubuntu server)

Run these before any code is deployed. Each block cites the Ubuntu Bedrock guide and explains *why* beginners should care.

### 10.1 Install dependencies (cite: guide step 2)
```bash
sudo apt install -y unzip curl libssl-dev screen zip
```
- `libssl-dev` is **critical**: the Bedrock binary is dynamically linked against `libssl` / `libcrypto`; without this package the server crashes on startup with *“shared library not found”*.
- We add `screen` (guide step 8 — needed because the backend owns the process) and `zip` (used by the Backups page) beyond what the guide installs.

### 10.2 Download & extract the Bedrock server (cite: guide step 3)
```bash
mkdir -p ~/bedrock-server && cd ~/bedrock-server
wget -O bedrock-server.zip "https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.14.1.zip"
unzip bedrock-server.zip && rm bedrock-server.zip
chmod +x bedrock_server
```
- The `-O` flag names the output file explicitly. `chmod +x` marks the binary executable (Linux does not run files by default).
- ⚠️ The URL points to a specific version (1.26.14.1 in the guide). **Check the official Minecraft download page for the latest version** and update the URL accordingly.

### 10.3 Firewall — **allow SSH FIRST** (cite: guide step 4)
```bash
sudo ufw allow 22/tcp       # ← SSH. ALWAYS allow before enabling ufw.
sudo ufw allow 19132/udp    # Bedrock game traffic (UDP)
sudo ufw allow 19132/tcp    # Bedrock query/ping (TCP)
sudo ufw allow 3000/tcp     # the panel
sudo ufw enable
```
- ⚠️ Enabling `ufw` without allowing 22 **locks you out of SSH** — a classic, costly beginner mistake. Don't do it.

### 10.4 Swap file (cite: guide step 5)
```bash
sudo fallocate -l 2G /swapfile     # allocate 2 GB instantly
sudo chmod 600 /swapfile           # root-only (swap can contain memory data)
sudo mkswap /swapfile              # format as swap
sudo swapon /swapfile              # activate now
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # persist across reboots
free -h                             # verify
```
- Swap is overflow memory on disk; it prevents out-of-memory crashes during player-count spikes.
- **Rule of thumb** from the guide: 1 GB RAM → 2 GB swap; 2 GB RAM → 2 GB swap; 4 GB RAM → 4 GB swap; 8 GB RAM → 4 GB swap.
- Later you'll resize swap *from the panel*'s Memory & Swap card — the backend runs the guide's "Resizing Swap" sequence (deactivate → recreate → format → activate). **`/etc/fstab` needs no further edits** (cite: guide note unless the filename changes).

---

## 11. Key risks for the implementer (the watch-list)

These are the things most likely to bite. The implementer should read these *before* each phase.

1. **Don't run the backend as root.** Use the dedicated `bedrock-panel` user + locked sudoers. This is the single biggest safety lever. (Phase 7 sets it up; Phase 1 should assume it for swap tests.)
2. **screen robustness:** `screen -ls` semantics change across versions and "Dead" sessions linger. Always normalize the parsed output; on Start, reuse an existing alive session or create a new one.
3. **Log file path/format:** Bedrock's `logs/` layout can vary by version (single file vs. rotated). The Logs page must detect the newest log file and follow rotations; don't hardcode a filename.
4. **Path traversal:** every Files/Backups endpoint MUST go through `lib/paths.js`. Bypassing it is the easiest way to compromise the host. Add a test that asserts `..` and absolute paths get 400.
5. **No HTTPS v1:** cleartext password on the wire. Document the caveat in README and in KNOWN-ISSUES; recommend adding Caddy/Nginx + Let's Encrypt next.
6. **Binary permissions:** `bedrock-panel` needs read + exec on `bedrock_server` and read/write on the folders it edits (`server.properties`, `worlds/`, `logs/`, `allowlist.json`, `permissions.json`, `resource_packs/`, `behavior_packs/`). Get the `chown`/`chmod` right in Phase 7 (cite: guide step 3).
7. **Sudoers breadth trade-off:** swap commands broaden the allow-list past a pure-systemctl rule. Keep the list minimal, reviewed, and documented.
8. **systemd vs screen coexistence:** resolved — the **backend OWNS screen**; systemd auto-starts only the backend (user-confirmed). Never let systemd directly manage the Bedrock process or the Console page breaks.
9. **Command injection:** always use `execFile`/`spawn` argument arrays; never shell-interpolate usernames, commands, or paths.
10. **Atomic writes for configs:** write to `*.tmp` then `fs.rename` so a crash mid-write never leaves a half-truncated `server.properties`.

---

## 12. Validation plan (summary; per-phase details in each phase file)

Each phase has its own "Validation" section. Here is the consolidated checklist.

| Phase | Pass criterion |
|---|---|
| 1 | Stop in panel → `screen -ls` shows nothing; Start → session appears; refresh → status consistent; Swap card rejects resize while running, accepts after stop; login persists; theme persists across refresh. |
| 2 | A player joins the game → a line appears in Logs without manual refresh. |
| 3 | Type `/say hello from the panel` in Console → the message broadcasts in-game and appears in the Log stream. |
| 4 | Change `max-players`, save → file updated → restart → in-game `max-players` reflects the new value. Rejects non-numeric `server-port`. |
| 5 | Upload to `worlds/` while running → blocked with the stop-first error; after stop → succeeds. `GET /api/files?path=../../etc/passwd` → 400. Edit `allowlist.json` inline → persists. |
| 6 | Backup download → a valid `.zip` that unzips cleanly; restore replaces the world; `worlds.bak-<ts>` is created; restore blocked while running. |
| 7 | `systemctl status bedrock-panel` → active; `sudo -l -U bedrock-panel` → only the swap commands; all 10 acceptance steps green; README + KNOWN-ISSUES present and accurate. |

### 12.1 End-to-end acceptance (Phase 7) — 10 steps on a fresh VPS
1. Server starts via the panel (Dashboard → Start).
2. `<StatusBadge>` reflects reality within 3 s.
3. Swap change works (resize succeeds when stopped, 409 when running).
4. Logs stream live.
5. `/say hello` broadcasts in-game.
6. `server.properties` save persists and takes effect after restart.
7. Files: browse works; `worlds/` edit blocked while running; `..` rejected with 400.
8. Backup download is a valid zip; restore works; restore blocked while running.
9. Reboot the box → the panel comes back up via systemd (proves Phase 7 service install).
10. `sudo -l -U bedrock-panel` shows **only** the intended swap commands.

---

## 13. Tooling and conventions

- **Package manager:** `pnpm` (your repo already has `pnpm-lock.yaml`). All install commands use `pnpm install` and `pnpm dev`.
- **Frontend:** React 19 + Vite 8 (already in `bedrock-server/package.json`). We add `react-router-dom` for the 6 pages.
- **Backend:** Node.js + Express. Suggested deps: `express`, `bcryptjs`, `express-session`, `dotenv`, `multer` (file uploads), `archiver` (zip) and/or shell out to `zip`/`unzip` installed on the VPS. Dev: `nodemon`.
- **Linting:** your project uses `oxlint`. Keep it; run `pnpm lint` before committing.
- **Editor:** VS Code is fine. No pinned version requirements beyond React 19 / Vite 8.
- **Node version on the VPS:** LTS (Node 20+). Install via NodeSource if the distro default is older.

---

## 14. Environment variables (`.env`) reference

`server/.env` (never committed; `.env.example` is the safe template):

| Variable | Required | Description | Example |
|---|---|---|---|
| `SESSION_SECRET` | yes | Long random string used to sign session cookies | `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | yes | bcrypt hash of your admin password | `$2a$10$AbC…` |
| `PORT` | no | Port the backend listens on | `3000` |
| `BEDROCK_DIR` | yes | Absolute path to the Bedrock server folder | `/home/you/bedrock-server` |
| `SWAPFILE` | no | Swap file path (must match sudoers rule!) | `/swapfile` |
| `NODE_ENV` | no | `production` in prod; affects Express behaviors | `production` |

---

## 15. The 6 sidebar pages → endpoints → phases cross-reference

Quick lookup so anyone can find where a feature is spec'd.

| Page | Endpoints | Phase |
|---|---|---|
| Dashboard | `GET /api/status`, `POST /api/power/{start,stop,restart}`, `GET /api/swap`, `POST /api/swap` | 1 |
| Logs | `GET /api/logs`, `GET /api/logs/stream` (SSE) | 2 |
| Console | `POST /api/console` (+ log stream from Phase 2) | 3 |
| Server Properties | `GET/POST /api/properties` | 4 |
| Files | `GET /api/files`, `GET/POST /api/files/content`, `GET /api/files/download`, `POST /api/files/upload`, `POST /api/files/delete` | 5 |
| Backups | `GET /api/backup/download`, `POST /api/backup/restore` | 6 |
| (Auth) | `POST /api/login`, `POST /api/logout`, `GET /api/me` | 1 |

---

## 16. Glossary (for beginners)

- **Frontend** — the part that runs in your browser (React). It draws the UI and sends clicks to the backend.
- **Backend** — the part that runs on the Ubuntu server (Node.js + Express). It receives clicks and performs the real Linux actions.
- **API** — the set of URLs the frontend calls on the backend (e.g. `POST /api/power/start`). Think of each as a "button" the frontend presses.
- **`screen`** — a Linux tool that runs a program in a virtual terminal that survives SSH disconnects. We use it so the Bedrock server keeps running and so we can pipe in-game commands to it.
- **systemd** — Linux's service manager. We use it so the backend auto-starts when the machine boots.
- **bcrypt** — a slow, salted password-hashing algorithm. We never store the plaintext password; only its bcrypt hash.
- **SSE (Server-Sent Events)** — a way for the server to push new lines to the browser over a long-lived HTTP connection. Exactly what we need for live logs.
- **Path traversal** — an attack where `../../etc/passwd` is passed as a path to escape the allowed folder. We block it everywhere.
- **sudoers** — a configuration that decides what commands a user can run as root. We lock it down to only the swap commands.
- **Atomic write** — writing to a temp file then renaming it so the real file is never half-written if a crash happens mid-write.

---

## 17. Citations

- **Ubuntu Bedrock guide** (azeumark.github.io/Minecraft-Bedrock-Server-Guide-Ubuntu):
  - Step 2 — install deps (`unzip`, `curl`, `libssl-dev`).
  - Step 3 — download & extract the Bedrock server; `chmod +x bedrock_server`.
  - Step 4 — firewall (`ufw`), with the SSH-first warning.
  - Step 5 — swap setup AND the "Resizing Swap" sequence (used by `POST /api/swap`).
  - Step 6 — running the binary manually (`LD_LIBRARY_PATH=. ./bedrock_server`).
  - Step 7 — the systemd service file pattern (adapted: we run the *backend* under systemd, not the game directly).
  - Step 8 — `screen` for persistent console access (our backend owns the screen session).
  - Step 9 — useful commands: `systemctl status/stop/restart`, `journalctl -u bedrock -f`, `free -h`, `df -h`.
  - Backup / Restore pages linked from the guide — used by `backup.js`.
- **Pterodactyl** (pterodactyl.io):
  - `project/terms.html` — Panel/Wings terminology (we simplify both onto one machine).
  - Homepage "Security First" — bcrypt, AES-256-CBC, HTTPS. **We adopt bcrypt.** **We intentionally do not adopt AES-256-CBC secret encryption or Docker isolation in v1.**
