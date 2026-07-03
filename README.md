# ⛏ Bedrock Server Control Panel

A **password-protected web panel** to manage a Minecraft **Bedrock dedicated server** on Ubuntu. Click buttons instead of typing SSH commands — Start, Stop, Restart, send in-game commands, edit config files, browse files, and backup/restore your world.

Built for one user on one machine. Inspired by [Pterodactyl](https://pterodactyl.io/) but simplified: one language (JavaScript), one repo, one running process.

---

## Architecture

```
Your Browser ──HTTP/JSON + SSE──▶ Node.js Backend (port 3000)
                                       │
                                       │ owns via screen
                                       ▼
                               bedrock_server
                              (Minecraft Bedrock)
                                       │
                                       ▼
                              ~/bedrock-server/
                               ├ worlds/
                               ├ logs/
                               ├ server.properties
                               └ ...
```

- The **backend** (Express) serves the React UI as static files and exposes a REST + SSE API.
- The backend **owns the Bedrock process** inside a GNU `screen` session named `bedrock`.
- **systemd** auto-starts only the backend on boot. The game starts when you click Start in the panel.

---

## Prerequisites (Ubuntu VPS)

```bash
# 1. Install dependencies
sudo apt update
sudo apt install -y unzip curl libssl-dev screen zip pnpm

# 2. Download & extract Bedrock dedicated server
mkdir -p ~/bedrock-server && cd ~/bedrock-server
# Get the latest URL from https://www.minecraft.net/download/server/bedrock
wget -O bedrock-server.zip "https://minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-<version>.zip"
unzip bedrock-server.zip && rm bedrock-server.zip
chmod +x bedrock_server

# 3. Firewall — allow SSH FIRST
sudo ufw allow 22/tcp
sudo ufw allow 19132/udp
sudo ufw allow 19132/tcp
sudo ufw allow 3000/tcp
sudo ufw enable

# 4. Swap file (adjust size based on your RAM)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Setup

### 1. Create the dedicated system user

```bash
sudo useradd -r -m -d /var/lib/bedrock-panel -s /usr/sbin/nologin bedrock-panel
```

### 2. Grant access to the Bedrock server directory

```bash
sudo chown -R bedrock-panel:bedrock-panel ~/bedrock-server
sudo chmod -R o= ~/bedrock-server
```

### 3. Deploy the panel

```bash
# Clone the repo (or copy your local build) into /opt/bedrock-panel
sudo git clone <your-repo-url> /opt/bedrock-panel
sudo chown -R bedrock-panel:bedrock-panel /opt/bedrock-panel
```

If you're building locally and copying via SCP, copy the entire repo (both `server/` and `bedrock-server/`) to `/opt/bedrock-panel` and set ownership.

### 4. Create the `.env` file

```bash
sudo -u bedrock-panel nano /opt/bedrock-panel/server/.env
```

**Important:** The `BEDROCK_DIR` path must point to wherever you downloaded/extracted the Bedrock server (e.g. `/home/ubuntu/bedrock-server`). Update it to match your setup.

Contents:

```
SESSION_SECRET=<run: openssl rand -hex 32>
ADMIN_PASSWORD_HASH=<run: node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'yourpassword'>
PORT=3000
BEDROCK_DIR=/home/<you>/bedrock-server
SWAPFILE=/swapfile
NODE_ENV=production
```

### 5. Install dependencies & build the frontend

```bash
cd /opt/bedrock-panel/server && pnpm install
cd /opt/bedrock-panel/bedrock-server && pnpm install && pnpm build
```

### 6. Locked-down sudoers rule

Create `/etc/sudoers.d/bedrock-panel`:

```
bedrock-panel ALL=(root) NOPASSWD: /usr/sbin/swapoff /swapfile, \
    /usr/bin/fallocate -l *G /swapfile, \
    /bin/chmod 600 /swapfile, \
    /usr/sbin/mkswap /swapfile, \
    /usr/sbin/swapon /swapfile
```

Validate with:

```bash
sudo visudo -c
```

### 7. Install systemd unit

```bash
sudo cp /opt/bedrock-panel/server/deploy/bedrock-panel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bedrock-panel
sudo systemctl status bedrock-panel
```

The panel is now live at **http://<your-server-ip>:3000**.

---

## Login

Generate your bcrypt password hash:

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'yourpassword'
```

Put the output (the `$2a$...` string) as `ADMIN_PASSWORD_HASH` in `.env`.

---

## Development

Run the backend and frontend separately for hot-reload:

```bash
# Terminal 1 — backend (port 3100)
cd server
pnpm dev

# Terminal 2 — frontend (port 5173, proxies /api to 3100)
cd bedrock-server
pnpm dev
```

Open http://localhost:5173 in your browser.

---

## Pages

| Page | What it does |
|---|---|
| **Dashboard** | Start/Stop/Restart the server, view Memory & Swap, resize swap |
| **Logs** | Live streaming log viewer (SSE) with auto-scroll |
| **Console** | Send in-game commands (`/say`, `/kick`, `/op`) |
| **Server Properties** | Edit `server.properties` via a grouped form |
| **Files** | Browse, upload, download, and inline-edit server files |
| **Backups** | Download world as .zip, restore from uploaded .zip |

---

## Security Caveats

| Issue | Status |
|---|---|
| **No HTTPS** | v1 ships without TLS. Your password crosses the network in cleartext. **Recommended:** put Caddy or Nginx in front with Let's Encrypt. |
| **Single user** | Only one admin account. No permission system. |
| **No Docker isolation** | Unlike Pterodactyl, Bedrock runs directly on the host. The `bedrock-panel` user limits blast radius. |
| **Swap sudoers breadth** | The locked-down sudoers rule is broader than a pure-systemctl rule. Kept minimal and documented. |

Minimal Caddyfile for HTTPS:

```caddy
yourdomain.com {
    reverse_proxy localhost:3000
}
```

---

## Known Issues

See [docs/KNOWN-ISSUES.md](./docs/KNOWN-ISSUES.md) for the full list.

---

## License

MIT
