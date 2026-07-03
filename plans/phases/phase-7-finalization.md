# Phase 7 — Finalization

> The phase that turns a working dev panel into a safely-deployed, documented project.

## Goal
Polish, harden, install as a real service, and write the docs so a complete beginner can reproduce the deployment and understand the risks.

## Tasks

### 1. Create the dedicated system user
```bash
sudo useradd -r -m -d /var/lib/bedrock-panel -s /usr/sbin/nologin bedrock-panel
```
- The backend runs as this user (never root).
- Grant it read+exec on `~/bedrock-server/` (and write where needed: `server.properties`, `worlds/`, `logs/`, `allowlist.json`, `permissions.json`, `resource_packs/`, `behavior_packs/`). Cite: guide step 3 `chmod +x`.

### 2. Locked-down sudoers rule
Create `/etc/sudoers.d/bedrock-panel` with `visudo -c` validation:
```
bedrock-panel ALL=(root) NOPASSWD: /usr/sbin/swapoff /swapfile, \
    /usr/bin/fallocate -l *G /swapfile, \
    /bin/chmod 600 /swapfile, \
    /usr/sbin/mkswap /swapfile, \
    /usr/sbin/swapon /swapfile
```
- Only the swap-commands needed by the panel. No `systemctl`, no shells, no broad root.
- Document the trade-off (risk #7): broader than a "systemctl only" rule, but the panel needs swap. Keep the list minimal and reviewed.

### 3. systemd unit (`server/deploy/bedrock-panel.service`)
Adapt the guide's step 7 pattern, but for the BACKEND (not the game):
```ini
[Unit]
Description=Bedrock Server Control Panel (backend)
After=network.target

[Service]
User=bedrock-panel
WorkingDirectory=/opt/bedrock-panel
EnvironmentFile=/opt/bedrock-panel/.env
ExecStart=/usr/bin/node /opt/bedrock-panel/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Install:
```bash
sudo cp bedrock-panel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bedrock-panel
sudo systemctl status bedrock-panel
```
Cite: guide step 7 structure (`[Unit]/[Service]/[Install]`, `After=network.target`, `Restart=on-failure`, `RestartSec=5`, `daemon-reload`, `enable`, `start`, `status`).

### 4. Build & serve the React panel
- `cd bedrock-server && pnpm install && pnpm build` → outputs `bedrock-server/dist/`.
- Backend already serves `dist/` as static (Phase 1). Verify single-port access: `http://<server-ip>:3000`.
- Ensure the firewall already allows 3000/tcp (set in the setup prerequisites in `plan.md`).

### 5. Add HTTPS (open item)
- Document that v1 ships WITHOUT HTTPS. The recommended next step is a Caddy or Nginx reverse proxy in front of port 3000 with Let's Encrypt. Provide a minimal Caddyfile snippet in the README (not required to implement now).

### 6. README (`README.md` at repo root)
A beginner-friendly README covering:
- What this project is (one paragraph).
- Architecture diagram reused from `plan.md`.
- VPS setup steps (lift the prerequisites block from `plan.md` — deps, download, firewall, swap).
- The 4 sudoers/systemd install steps above.
- How to run in dev (`pnpm dev` in both folders) and in prod (build + systemd unit).
- Default login + how to generate a bcrypt hash for your `ADMIN_PASSWORD_HASH` (a tiny `node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'yourpassword'` one-liner).
- **Security caveats section:** no HTTPS v1, single-user only, sudoers breadth trade-off.
- Known issues / future work (out-of-scope list from `plan.md`).

### 7. Known-issues doc (`docs/KNOWN-ISSUES.md`)
- No HTTPS v1.
- Multi-user unsupported.
- Docker isolation unsupported (Pterodactyl's core advantage).
- Binaries inside `bedrock-server/` are read via the file manager — be careful not to delete `bedrock_server`.
- Path-traversal guard relies on `lib/paths.js`; never bypass by adding direct routes.

### 8. End-to-end acceptance test
On a fresh VPS following the README:
1. Server starts via panel. 2. Status reflects reality. 3. Swap change works (with stop-first). 4. Logs stream. 5. `/say` broadcasts. 6. Properties save + take effect after restart. 7. Files browse + `worlds/` blocked while running + `..` rejected. 8. Backup download valid; restore works; restore blocked while running. 9. Rebooting the box brings the panel back up via systemd. 10. Sudoers reviewed — confirm `sudo -l -U bedrock-panel` shows only the intended commands.

## Validation (Phase 7 done when all green)
- `sudo systemctl status bedrock-panel` → active (running).
- `sudo -l -U bedrock-panel` → only the swap-commands listed above.
- Each of the 10 acceptance steps passes.
- README + KNOWN-ISSUES exist and are accurate.

## Cites
- Guide step 7 (systemd structure, daemon-reload/enable/start/status).
- Guide step 3 (file permissions for the bedrock-server folder).
- Pterodactyl "Security First" (bcrypt / TLS-out-of-box — we adopt bcrypt, defer TLS).
