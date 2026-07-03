# Deployment Guide — Ubuntu Server

> **Who this is for:** a beginner. Every command is copy-pasteable, and I explain *why* under each one. Follow the steps top to bottom. Total time: ~20–30 minutes the first time.
>
> This guide deploys the **Bedrock Server Control Panel** from the GitHub repo onto a fresh Ubuntu 20.04+ VPS. After this is done, you'll open a website in your browser and control your Minecraft Bedrock server with buttons — no more SSH commands for day-to-day use.

<<<<<<< HEAD
> ### ⚡ Prefer one command instead of 13 steps?
> There's an interactive installer at **`docs/install.sh`** that does this whole guide for you. It asks 3 questions (your username, your panel password, optional Bedrock URL) and then installs, builds, configures, and starts everything automatically:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/AzeuMark/Ubuntu-Bedrock-Minecraft-Server/main/docs/install.sh | sudo bash
> # OR, clone first then run locally:
> git clone https://github.com/AzeuMark/Ubuntu-Bedrock-Minecraft-Server.git
> cd Ubuntu-Bedrock-Minecraft-Server
> sudo bash docs/install.sh
> ```
> Re-running it is safe (idempotent). The step-by-step guide below is the manual reference; the script automates it.

=======
>>>>>>> 5367b57 (Added Deployment guide)
---

## ⚠️ Before you start — read this

1. **Do these steps over SSH on your Ubuntu server**, not on your Windows PC.
2. **One critical decision: who owns the Bedrock folder?**
   The panel runs as a dedicated user called `bedrock-panel`. It needs to **read/write** the Bedrock server folder. The simplest setup is:
   - You, the human, log in as a normal user (e.g. `ubuntu` or `azeu`) — **not** root.
   - The Bedrock server is installed at `~/.local/bedrock-server` (or anywhere *your* user owns).
   - We give the `bedrock-panel` user read/write access to that folder.
   We use that approach below. (Running everything as root also works but is riskier and not recommended.)
3. **Never enable the firewall without allowing SSH first**, or you'll lock yourself out. I repeat the warning at that step.
4. **No HTTPS in v1.** The panel's password crosses the network in cleartext. Fine for a single-user server behind a firewall; add a reverse proxy later if you want HTTPS. See `docs/KNOWN-ISSUES.md`.

---

## 0. Log in and switch to root for setup

Most of these commands need `sudo`. Start an interactive root shell so you don't have to type `sudo` each time:

```bash
sudo -i
```

> ⚠️ When you're done, type `exit` to leave the root shell. Never run the panel itself as root (we create a dedicated user for that in step 6).

Throughout this guide, **replace `YOURNAME` with your actual Ubuntu username** (the one you log in with over SSH — e.g. `ubuntu`, `azeu`, etc.). I'll call it `$YOU` below. Set it once:

```bash
export YOU=YOURNAME
echo "$YOU"   # double-check it's correct
```

---

## 1. Install system dependencies

```bash
apt update
apt install -y unzip curl libssl-dev screen zip git
```

What each package does:
- `unzip`, `curl` — download & extract the Bedrock server zip.
- `libssl-dev` — **critical**. The Bedrock binary needs OpenSSL libraries; without this it crashes on startup with "shared library not found".
- `screen` — the panel runs the Bedrock process inside a `screen` session named `bedrock`.
- `zip` — used by the Backups page to zip your world.
- `git` — to clone the panel repo.

### 1a. Install Node.js 20+ (LTS)

The panel backend needs Node 20 or newer. Install it from NodeSource (Ubuntu's default is often too old):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version   # should print v20.x or higher
```

### 1b. Install pnpm (the package manager the project uses)

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version   # should print a version number
```

> `corepack` ships with Node 16.10+. If `corepack` is missing, run `npm install -g pnpm` instead.

---

## 2. Download & set up the Bedrock server

Decide where the game files live. We'll use `~/.local/bedrock-server` under **your** user (not root) so ownership is clean:

```bash
# As root, drop into your user's home and create the folder
sudo -u "$YOU" -H bash -lc '
  mkdir -p ~/.local/bedrock-server
  cd ~/.local/bedrock-server
  wget -O bedrock-server.zip "https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.14.1.zip"
  unzip bedrock-server.zip
  rm bedrock-server.zip
  chmod +x bedrock_server
'
```

> ⚠️ The URL points to version **1.26.14.1**. Check the [official Minecraft Bedrock download page](https://www.minecraft.net/en-us/download/server/bedrock) for the latest version and update the URL if needed.

Verify it extracted:

```bash
ls -la /home/$YOU/.local/bedrock-server | head
# You should see: bedrock_server  server.properties  worlds/  etc.
```

---

## 3. Configure the firewall (ufw)

> ⚠️ **Allow SSH (port 22) FIRST.** If you enable `ufw` without allowing SSH, you will be **locked out of your server** and have to use the provider's recovery console.

```bash
ufw allow 22/tcp          # SSH — ALWAYS allow this first
ufw allow 19132/udp       # Bedrock game traffic (UDP — real-time packets)
ufw allow 19132/tcp       # Bedrock query/ping (so it shows in friends lists)
ufw allow 3000/tcp        # the panel's web port
ufw --force enable
ufw status numbered
```

What each port is for:
- **22** — your SSH access. Keep this.
- **19132/udp** — Minecraft Bedrock game traffic. UDP because it's faster (no handshake/retries), which matters for low-latency gameplay.
- **19132/tcp** — server query/ping; how friends-list and server browsers find your server.
- **3000** — the panel website. Remove this line if you'd rather reach the panel only via SSH tunnel (more secure, slightly less convenient).

---

## 4. Set up a swap file

Swap is overflow memory on disk; it prevents the server from crashing when RAM spikes during gameplay.

```bash
fallocate -l 2G /swapfile     # create a 2 GB swap file (adjust to your RAM)
chmod 600 /swapfile           # root-only (swap can contain memory data)
mkswap /swapfile              # format it
swapon /swapfile              # activate
echo '/swapfile none swap sw 0 0' >> /etc/fstab   # persist across reboots
free -h
```

Rule of thumb (from the Minecraft Bedrock guide):
- 1 GB RAM → 2 GB swap · 2 GB RAM → 2 GB swap · 4 GB RAM → 4 GB swap · 8 GB RAM → 4 GB swap.

> You can later **resize swap from the panel** (Dashboard → Memory & Swap card). The backend runs the same commands above as a sequence — but only while the game is stopped (it enforces the stop-first rule).

---

## 5. Clone the panel repo

```bash
mkdir -p /opt/bedrock-panel
git clone https://github.com/AzeuMark/Ubuntu-Bedrock-Minecraft-Server.git /opt/bedrock-panel
ls /opt/bedrock-panel        # should show: bedrock-server/  server/  docs/  README.md  ...
```

---

## 6. Create the dedicated panel user

The backend runs as a non-login system user named `bedrock-panel` — **never root**. This is your single biggest safety lever: if the panel is ever exploited, the attacker can only act as this limited user.

```bash
useradd --system --create-home --home-dir /var/lib/bedrock-panel --shell /usr/sbin/nologin bedrock-panel
```

- `--system` → a service account (no expiry, no home clutter).
- `--shell /usr/sbin/nologin` → no one can SSH in as this user.

---

## 7. Build the frontend and install backend dependencies

```bash
# Build the React panel into static files (./bedrock-server/dist)
cd /opt/bedrock-panel/bedrock-server
pnpm install --frozen-lockfile
pnpm build
# This prints something like:  dist/index.html  dist/assets/index-*.js  ...

# Install the backend's Node dependencies
cd /opt/bedrock-panel/server
pnpm install --frozen-lockfile --prod
```

If the build fails with a message about `react-router-dom` being missing, run `pnpm install --no-frozen-lockfile` in `bedrock-server/` instead, then `pnpm build`.

---

## 8. Configure the backend secrets (.env)

The backend reads its secrets from `server/.env`. Copy the template and fill it in:

```bash
cd /opt/bedrock-panel/server
cp .env.example .env
chmod 600 .env   # only root can read it (it holds a password hash)
```

Now generate two secrets and paste them into `.env`.

### 8a. Generate `SESSION_SECRET` (a random signing key)

```bash
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "Your SESSION_SECRET is: $SESSION_SECRET"
```

### 8b. Generate `ADMIN_PASSWORD_HASH` (a bcrypt hash of YOUR password)

Pick the password you'll use to log into the panel (not your SSH password — a separate one is safer). Replace `YourPanelPassword` below with your chosen password:

```bash
ADMIN_PASSWORD_HASH=$(node -e "process.argv[1] && console.log(require('bcryptjs').hashSync(process.argv[1], 10))" 'YourPanelPassword')
echo "Your ADMIN_PASSWORD_HASH is: $ADMIN_PASSWORD_HASH"
```

### 8c. Write them into .env

Open the file:

```bash
nano /opt/bedrock-panel/server/.env
```

Edit these four lines (leave the rest as-is):

```
SESSION_SECRET=<paste your SESSION_SECRET here>
ADMIN_PASSWORD_HASH=<paste your ADMIN_PASSWORD_HASH here>
PORT=3000
BEDROCK_DIR=/home/YOURNAME/.local/bedrock-server
SWAPFILE=/swapfile
NODE_ENV=production
```

- Replace `YOURNAME` with the actual Ubuntu username you set in step 0.
- `BEDROCK_DIR` is the path from step 2 (where the Bedrock files live).
- `SWAPFILE` must be `/swapfile` (matches step 4 and the sudoers rule in step 9).
- Save and exit (`Ctrl+O`, Enter, `Ctrl+X`).

Double-check:

```bash
grep -E '^(SESSION_SECRET|ADMIN_PASSWORD_HASH|PORT|BEDROCK_DIR|SWAPFILE|NODE_ENV)=' /opt/bedrock-panel/server/.env
```

---

## 9. Install the locked-down sudoers rule

The backend needs `sudo` **only** for the 5 swap-resize commands. Create a rule that grants exactly those, and nothing else:

```bash
cat > /etc/sudoers.d/bedrock-panel <<'EOF'
bedrock-panel ALL=(root) NOPASSWD: /usr/sbin/swapoff /swapfile, \
    /usr/sbin/fallocate -l *G /swapfile, \
    /usr/bin/chmod 600 /swapfile, \
    /usr/sbin/mkswap /swapfile, \
    /usr/sbin/swapon /swapfile
EOF
chmod 440 /etc/sudoers.d/bedrock-panel
visudo -c   # validates the file; must report "parsed OK"
```

> ⚠️ If `visudo -c` prints any error, **stop** — a broken sudoers file can block all `sudo` on the server. Re-read the `cat > ...` block above for typos (especially the backslashes and commas).

Verify the rule is active (run this — it should list exactly those 5 commands):

```bash
sudo -l -U bedrock-panel
```

> **Note on paths:** the rule uses absolute paths. If `swapoff`/`fallocate`/`mkswap`/`swapon` live elsewhere on your system, the panel's swap-resize will fail. Find them with `which swapoff fallocate mkswap swapon` and adjust the sudoers file to match. (`chmod` is usually `/usr/bin/chmod`.)

---

## 10. Grant the panel user access to the Bedrock folder

The `bedrock-panel` user must be able to read + run the Bedrock binary and read/write the world, logs, and config files. Easiest: add it to a group that owns the folder, then grant group read/write:

```bash
# Add bedrock-panel to your user's primary group
usermod -aG "$YOU" bedrock-panel

# Make the Bedrock folder group-writable and owned by your group
chgrp -R "$YOU" /home/$YOU/.local/bedrock-server
chmod -R g+rwX /home/$YOU/.local/bedrock-server
# Make sure new files created inside (by the game) keep the group
find /home/$YOU/.local/bedrock-server -type d -exec chmod g+s {} \;
```

Make sure the `bedrock-panel` user can actually read the path down to the folder (your home must be traversable):

```bash
chmod o+x /home/$YOU
ls -la /home/$YOU/.local/bedrock-server/bedrock_server   # a quick check
```

---

## 11. Test the backend manually (before wiring up auto-start)

Run it once as the `bedrock-panel` user to catch any permission/path errors early:

```bash
sudo -u bedrock-panel -H bash -lc '
  cd /opt/bedrock-panel/server
  node src/index.js
'
```

You should see:

```
[bedrock-panel] backend listening on http://localhost:3000
[bedrock-panel] bedrock dir: /home/YOURNAME/.local/bedrock-server
[bedrock-panel] node env: production
```

If it exits with errors, common causes:
- `Cannot find module 'express'` → you skipped `pnpm install` in step 7.
- swap warnings → expected on first run if the sudoers path differs; the swap UI will simply return an error.
- `EACCES` reading `bedrock_server` → step 10 permissions are wrong.

While it's running, **open a second SSH window** and probe it:

```bash
# from the second window:
curl http://localhost:3000/api/health        # -> {"ok":true}
curl http://localhost:3000/api/me           # -> {"ok":true,"loggedIn":false}
```

If sanity checks pass, stop the backend in the first window with `Ctrl + C`, then enable it as a service in step 12.

Confirmed the panel loads. Open it in your browser:

```
http://YOUR_SERVER_IP:3000
```

Log in with the password you hashed in step 8b. You should see the Dashboard. Click **Start** — the Bedrock server should come up (watch the status badge turn green within a few seconds).

---

## 12. Install the systemd service (auto-start on boot)

```bash
# Copy the service file into place
cp /opt/bedrock-panel/server/deploy/bedrock-panel.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bedrock-panel
systemctl status bedrock-panel --no-pager
```

Expected: `● bedrock-panel.service - Bedrock Server Control Panel (backend)` with `active (running)`.

Key facts about the service file (already in the repo at `server/deploy/bedrock-panel.service`):
- Runs as `User=bedrock-panel`
- `WorkingDirectory=/opt/bedrock-panel/server`
- Reads secrets from `/opt/bedrock-panel/server/.env`
- `Restart=on-failure` with a 5-second cooldown (so a crash won't restart-loop)

### Useful service commands

```bash
systemctl status bedrock-panel          # is it running?
systemctl restart bedrock-panel         # restart the backend
journalctl -u bedrock-panel -f          # live backend logs (like tail -f)
journalctl -u bedrock-panel --since today
```

---

## 13. Final verification checklist

Run each of these. All must pass for the deployment to be considered done.

1. **Panel loads in a browser.**
   Visit `http://YOUR_SERVER_IP:3000` → login page appears.
2. **Login works.**
   Enter the password from step 8b → lands on the Dashboard.
3. **Status reflects reality.**
   With the game stopped, the badge reads "Stopped". Click **Start** → after ~3 s it flips to "Running". (On the server, `screen -ls` shows a `bedrock` session.)
4. **Stop / Restart work.**
   Click Stop → badge turns "Stopped", `screen -ls` shows nothing. Restart → back to running.
5. **Swap resize blocked while running (stop-first rule).**
   With the game running, type `4` in the Memory & Swap card and Apply → you should see *"Please stop the server first before changing the swap size."*
6. **Swap resize works when stopped.**
   Stop the game, set swap to e.g. `4`, Apply → success. Run `free -h` → swap total reflects the new size.
7. **sudoers is locked down.**
   `sudo -l -U bedrock-panel` lists **only** the 5 swap commands. Nothing else.
8. **Auto-start on reboot.**
   `reboot` the server. Wait ~1 minute, then reconnect and visit `http://YOUR_SERVER_IP:3000`. The panel should be back up (systemd started it) and login still works. (The game will be stopped after a reboot — Start it from the panel.)
9. **Firewall is correct.**
   `ufw status` shows 22, 19132/udp, 19132/tcp, 3000 allowed.

If all nine pass — you're fully deployed. 🎉

---

## Updating to a new version of the panel later

When you update the code (e.g. `git pull` a new version), the routine is:

```bash
cd /opt/bedrock-panel
git pull

# Rebuild the frontend
cd bedrock-server
pnpm install --frozen-lockfile
pnpm build

# (Re)install backend deps if changed
cd ../server
pnpm install --frozen-lockfile --prod

# Restart the service to pick up changes
systemctl restart bedrock-panel
systemctl status bedrock-panel --no-pager
```

If `server/deploy/bedrock-panel.service` changed, also re-copy it and reload:

```bash
cp /opt/bedrock-panel/server/deploy/bedrock-panel.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart bedrock-panel
```

---

## Common pitfalls (and how to fix)

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser times out at `:3000` | Firewall not allowing 3000, or backend not running | `ufw status`; `systemctl status bedrock-panel`; check `journalctl -u bedrock-panel -f` |
| Login always says "Invalid password" | `ADMIN_PASSWORD_HASH` in `.env` is the placeholder, or `.env` not loaded | Repeat step 8; confirm with `grep ADMIN_PASSWORD_HASH .env` |
| `403`/permission denied reading files | `bedrock-panel` can't read `BEDROCK_DIR` | Re-do step 10 (group + `chmod`) |
| Swap "Apply" fails even when stopped | Sudoers rule paths don't match the real binary paths | `which swapoff fallocate mkswap swapon`; update `/etc/sudoers.d/bedrock-panel` to match; `visudo -c` |
| "failed to start" on Start | `bedrock_server` binary missing/not executable, or `BEDROCK_DIR` wrong in `.env` | `ls -la $BEDROCK_DIR/bedrock_server`; check `BEDROCK_DIR` in `.env` |
| Locked out of SSH after enabling ufw | You didn't allow 22 first | Use your VPS provider's recovery console; run `ufw allow 22/tcp` |
| Panel works over http but password feels insecure | No HTTPS in v1 | Add a Caddy/Nginx reverse proxy with Let's Encrypt (see `docs/KNOWN-ISSUES.md`) |

---

## Where things live (quick reference)

| Path on server | What it is |
|---|---|
| `/opt/bedrock-panel/` | The cloned repo (panel code) |
| `/opt/bedrock-panel/server/.env` | Your secrets (password hash, session secret, `BEDROCK_DIR`) |
| `/opt/bedrock-panel/bedrock-server/dist/` | Built React panel (served by the backend) |
| `/home/YOURNAME/.local/bedrock-server/` | The actual Bedrock game + `worlds/`, `logs/`, `server.properties` |
| `/etc/systemd/system/bedrock-panel.service` | The auto-start service |
| `/etc/sudoers.d/bedrock-panel` | The locked-down permissions rule (5 swap commands only) |
| `/swapfile` | The swap file |
| `/etc/fstab` | One appended line keeps swap across reboots |

---

## Cleanup / uninstall

To remove the panel (leaving the Bedrock server intact):

```bash
systemctl disable --now bedrock-panel
rm /etc/systemd/system/bedrock-panel.service
systemctl daemon-reload
rm -rf /opt/bedrock-panel
rm /etc/sudoers.d/bedrock-panel
userdel --remove bedrock-panel
```

Swap and the Bedrock server are untouched by this.
