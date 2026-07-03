#!/usr/bin/env bash
# ============================================================================
#  Bedrock Server Control Panel — one-shot Ubuntu installer
# ============================================================================
#  What it does:
#    - Installs system deps + Node.js 20 (LTS) + pnpm
#    - Downloads & extracts the Minecraft Bedrock server (to ~/.local/bedrock-server)
#    - Configures the firewall (ufw) — ALLOWS SSH FIRST, NEVER locks you out
#    - Sets up a 2 GB swap file
#    - Clones the panel repo to /opt/bedrock-panel
#    - Builds the React frontend + installs backend Node deps
#    - Creates a non-root `bedrock-panel` service user
#    - Generates bcrypt password hash + session secret, writes server/.env
#    - Installs the locked-down sudoers rule (swap commands only)
#    - Grants the panel user access to the Bedrock folder
#    - Installs + enables the systemd service (auto-start on boot)
#    - Runs a verification pass and tells you the panel URL
#
#  How to run (on a FRESH Ubuntu 20.04+ server, over SSH as your normal user):
#      sudo bash install.sh
#
#  It will interactively ask you 3 things:
#    1. Your Ubuntu username (the one you SSH in with)
#    2. The admin password you want for the panel (NOT your SSH password)
#    3. (Optional) A custom Bedrock server ZIP URL (Enter = use the default)
#
#  Re-running it is SAFE: it is idempotent (won't duplicate/overwrite config).
# ============================================================================

set -euo pipefail

# ---------- pretty logging ----------
log()  { printf "\n\033[1;34m▶ %s\033[0m\n" "$1"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[1;33m!\033[0m %s\n" "$1"; }
err()  { printf "  \033[1;31m✗\033[0m %s\n" "$1" >&2; }
die()  { err "$1"; exit 1; }

# ---------- preflight checks ----------
[ "$(id -u)" -eq 0 ] || die "Run this with: sudo bash install.sh"
[ -r /etc/os-release ] || die "This doesn't look like a Linux system."
. /etc/os-release
case "$ID" in
  ubuntu|debian) ;;
  *) warn "Only tested on Ubuntu/Debian (you're on $ID). Press Ctrl+C within 5s to cancel..."; sleep 5 ;;
esac

# ---------- constants (match the deployed code) ----------
REPO_URL="https://github.com/AzeuMark/Ubuntu-Bedrock-Minecraft-Server.git"
INSTALL_DIR="/opt/bedrock-panel"
PANEL_USER="bedrock-panel"
PANEL_HOME="/var/lib/bedrock-panel"
PANEL_PORT="3000"
SWAP_FILE="/swapfile"
SWAP_SIZE_GB="2"
DEFAULT_BEDROCK_URL="https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-1.26.14.1.zip"

banner() {
  printf "\n\033[1;36m╔════════════════════════════════════════════════════════════╗\n╗  Bedrock Server Control Panel — Ubuntu Installer           ║\n╝════════════════════════════════════════════════════════════╝\033[0m\n\n"
}
banner

cat <<'INTRO'
You will be asked 3 questions:

  1. Your Ubuntu username (the one you currently SSH in with).
     The Bedrock server files will live under THIS user's home directory.
  2. The admin password for the panel.
     Pick a NEW password (do NOT reuse your SSH/login password).
     It is hashed with bcrypt and stored in /opt/bedrock-panel/server/.env.
     You won't see it typed — that's normal.
  3. (Optional) A Bedrock server ZIP URL — press Enter to use the default
     Minecraft.net link for version 1.26.14.1.

You can re-run this script safely; it won't duplicate or break existing config.

INTRO

# ---------- interactive prompts ----------

# 1) Username
while true; do
  read -rp "1. Your Ubuntu username: " PANEL_OWNER
  PANEL_OWNER="${PANEL_OWNER// /}"
  [ -n "$PANEL_OWNER" ] || { warn "Username can't be empty."; continue; }
  id "$PANEL_OWNER" >/dev/null 2>&1 || { warn "User '$PANEL_OWNER' doesn't exist on this system."; continue; }
  [ "$PANEL_OWNER" = "root" ] && { warn "Don't use 'root' — pick your normal SSH user."; continue; }
  break
done
PANEL_OWNER_HOME=$(getent passwd "$PANEL_OWNER" | cut -d: -f6)
BEDROCK_DIR="${PANEL_OWNER_HOME}/.local/bedrock-server"
ok "Using user: $PANEL_OWNER — Bedrock files will live at: $BEDROCK_DIR"

# 2) Panel admin password
while true; do
  read -srsp "2. Panel admin password (hidden, min 6 chars): " PANEL_PASS; echo
  [ "${#PANEL_PASS}" -ge 6 ] || { warn "Password must be at least 6 characters."; continue; }
  read -srsp "   Confirm password: " PANEL_PASS2; echo
  [ "$PANEL_PASS" = "$PANEL_PASS2" ] || { warn "Passwords don't match."; continue; }
  break
done
ok "Password accepted (will be hashed with bcrypt)."

# 3) Bedrock ZIP URL
read -rp "3. Bedrock server ZIP URL (Enter = default 1.26.14.1): " BEDROCK_URL
BEDROCK_URL="${BEDROCK_URL:-$DEFAULT_BEDROCK_URL}"
ok "Bedrock download URL: $BEDROCK_URL"

printf "\n\033[1;36m──────────── starting install ────────────\033[0m\n\n"

# ---------- 1. System dependencies ----------
log "Installing system dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq unzip curl libssl-dev screen zip git ca-certificates >/dev/null
ok "System packages installed"

# ---------- 2. Node.js 20 (LTS) ----------
log "Ensuring Node.js 20+ is available"
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
else
  NODE_MAJOR=0
fi
if [ "$NODE_MAJOR" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
  ok "Node.js installed"
else
  ok "Node.js $(node --version) already present"
fi

WHOAMI_NODE="$(command -v node)"  # path used by systemd (ExecStart needs absolute path)
[ -x "$WHOAMI_NODE" ] || die "Node binary not executable at $WHOAMI_NODE"

# ---------- 3. pnpm ----------
log "Ensuring pnpm is available"
if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true
fi
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm >/dev/null 2>&1 || die "Could not install pnpm."
fi
ok "pnpm $(pnpm --version) ready"

# ---------- 4. Bedrock server ----------
log "Downloading & installing Bedrock server"
if [ -x "$BEDROCK_DIR/bedrock_server" ]; then
  ok "Bedrock server already present at $BEDROCK_DIR (skipping download)"
else
  sudo -u "$PANEL_OWNER" -H bash -lc "
    set -e
    mkdir -p -- '$BEDROCK_DIR'
    cd -- '$BEDROCK_DIR'
    if [ ! -f bedrock_server.zip ]; then
      curl -fsSL -o bedrock_server.zip '$BEDROCK_URL'
    fi
    unzip -o -q bedrock_server.zip
    rm -f bedrock_server.zip
    chmod +x bedrock_server
  " || die "Bedrock download/extract failed (check the URL?)."
  [ -x "$BEDROCK_DIR/bedrock_server" ] || die "bedrock_server binary missing after extract."
  ok "Bedrock server installed at $BEDROCK_DIR"
fi

# ---------- 5. Firewall (NEVER lock out SSH) ----------
log "Configuring firewall (ufw)"
ufw allow 22/tcp   >/dev/null 2>&1 || true   # SAFETY FIRST — always
ufw allow 19132/udp >/dev/null 2>&1 || true
ufw allow 19132/tcp >/dev/null 2>&1 || true
ufw allow $PANEL_PORT/tcp >/dev/null 2>&1 || true
yes | ufw --force enable >/dev/null 2>&1 || true
ok "Firewall enabled (22, 19132/udp, 19132/tcp, $PANEL_PORT/tcp)"
warn "SSH (22/tcp) was allowed FIRST — you should NOT be locked out."

# ---------- 6. Swap ----------
log "Setting up swap ($SWAP_SIZE_GB GB)"
if swapon --show | grep -q "$SWAP_FILE"; then
  ok "Swap already active at $SWAP_FILE (skipping)"
else
  if [ ! -f "$SWAP_FILE" ]; then
    fallocate -l ${SWAP_SIZE_GB}G "$SWAP_FILE"
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE" >/dev/null
  fi
  swapon "$SWAP_FILE" 2>/dev/null || warn "swapon reported it's already on (ok)."
  if ! grep -q "^$SWAP_FILE " /etc/fstab; then
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
  fi
  ok "Swap enabled"
fi

# ---------- 7. Clone the panel repo ----------
log "Cloning the panel repo"
if [ -d "$INSTALL_DIR/.git" ]; then
  ok "$INSTALL_DIR already cloned (pulling latest)"
  (cd "$INSTALL_DIR" && git pull --ff-only >/dev/null 2>&1) || warn "git pull failed — continuing with existing files."
else
  rm -rf "$INSTALL_DIR"
  git clone --quiet "$REPO_URL" "$INSTALL_DIR" || die "git clone failed."
  ok "Cloned to $INSTALL_DIR"
fi

# ---------- 8. Build the frontend ----------
log "Building the React panel"
cd "$INSTALL_DIR/bedrock-server"
pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install --no-frozen-lockfile >/dev/null 2>&1 || die "pnpm install (frontend) failed."
pnpm build >/dev/null 2>&1 || die "pnpm build (frontend) failed."
[ -f dist/index.html ] || die "Build finished but dist/index.html is missing."
ok "Frontend built -> $INSTALL_DIR/bedrock-server/dist"

# ---------- 9. Install backend deps ----------
log "Installing backend dependencies"
cd "$INSTALL_DIR/server"
pnpm install --frozen-lockfile --prod >/dev/null 2>&1 || pnpm install --no-frozen-lockfile --prod >/dev/null 2>&1 || die "pnpm install (backend) failed."
ok "Backend deps installed"

# ---------- 10. Secrets (.env) ----------
log "Generating secrets and writing server/.env"
if [ -f ".env" ] && grep -q ADMIN_PASSWORD_HASH ".env" && ! grep -q "replace-with-your-bcrypt-hash" ".env"; then
  warn "An .env with a real password hash already exists — NOT overwriting it."
  warn "If you want to change the password, edit /opt/bedrock-panel/server/.env by hand."
else
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  ADMIN_HASH="$(node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" "$PANEL_PASS")"
  [ -n "$ADMIN_HASH" ] && [ -n "$SESSION_SECRET" ] || die "Failed to generate secrets (bcryptjs missing?)."
  cat > .env <<EOF
SESSION_SECRET=$SESSION_SECRET
ADMIN_PASSWORD_HASH=$ADMIN_HASH
PORT=$PANEL_PORT
BEDROCK_DIR=$BEDROCK_DIR
SWAPFILE=$SWAP_FILE
NODE_ENV=production
EOF
  chmod 600 .env
  ok ".env written (chmod 600)"
fi
unset PANEL_PASS PANEL_PASS2  # don't keep secrets in memory longer than needed

# ---------- 11. Service user ----------
log "Creating dedicated service user"
if id "$PANEL_USER" >/dev/null 2>&1; then
  ok "User '$PANEL_USER' already exists"
else
  useradd --system --create-home --home-dir "$PANEL_HOME" --shell /usr/sbin/nologin "$PANEL_USER"
  ok "Created user '$PANEL_USER'"
fi

# ---------- 12. Folder permissions ----------
log "Granting panel user access to the Bedrock folder"
if getent group "$PANEL_OWNER" >/dev/null 2>&1; then
  usermod -aG "$PANEL_OWNER" "$PANEL_USER" || true
  chgrp -R "$PANEL_OWNER" "$BEDROCK_DIR" 2>/dev/null || true
  chmod -R g+rwX "$BEDROCK_DIR" 2>/dev/null || true
  find "$BEDROCK_DIR" -type d -exec chmod g+s {} \; 2>/dev/null || true
  chmod o+x "$PANEL_OWNER_HOME" 2>/dev/null || true
  ok "Group '$PANEL_OWNER' owns '$BEDROCK_DIR' (bedrock-panel is a member)"
else
  warn "Group '$PANEL_OWNER' not found — you may need to fix permissions manually (see DEPLOYMENT.md step 10)."
fi

# Make sure the panel code dir is traversable by the panel user
chmod o+rx "$INSTALL_DIR" "$INSTALL_DIR/bedrock-server" "$INSTALL_DIR/server" 2>/dev/null || true

# ---------- 13. sudoers rule ----------
log "Installing locked-down sudoers rule"
# Find absolute paths of the swap binaries (they can live in /usr/sbin or /sbin)
SWAPOFF_BIN="$(command -v swapoff   || true)"
MKSWAP_BIN="$(command -v mkswap     || true)"
SWAPON_BIN="$(command -v swapon     || true)"
FALLOC_BIN="$(command -v fallocate  || true)"
CHMOD_BIN="$(command -v chmod       || true)"
for b in SWAPOFF_BIN MKSWAP_BIN SWAPON_BIN FALLOC_BIN CHMOD_BIN; do
  v="${!b}"
  [ -n "$v" ] || die "Could not locate a required swap binary (missing: $b). Install util-linux."
done

cat > /etc/sudoers.d/bedrock-panel <<EOF
bedrock-panel ALL=(root) NOPASSWD: $SWAPOFF_BIN $SWAP_FILE, \\
    $FALLOC_BIN -l *G $SWAP_FILE, \\
    $CHMOD_BIN 600 $SWAP_FILE, \\
    $MKSWAP_BIN $SWAP_FILE, \\
    $SWAPON_BIN $SWAP_FILE
EOF
chmod 440 /etc/sudoers.d/bedrock-panel
if ! visudo -c -f /etc/sudoers.d/bedrock-panel >/dev/null 2>&1; then
  rm -f /etc/sudoers.d/bedrock-panel
  die "Sudoers file failed validation (removed to keep sudo safe). Check install.sh."
fi
ok "Sudoers rule installed (5 swap commands only) & validated"

# ---------- 14. systemd service ----------
log "Installing systemd service (auto-start on boot)"
# Patch ExecStart to use the real node path on this system (the repo's file uses /usr/bin/node)
TMP_SERVICE="$(mktemp)"
sed "s|ExecStart=/usr/bin/node .*|ExecStart=$WHOAMI_NODE $INSTALL_DIR/server/src/index.js|" \
    "$INSTALL_DIR/server/deploy/bedrock-panel.service" > "$TMP_SERVICE"
# Make sure EnvironmentFile + WorkingDirectory match this install
sed -i "s|EnvironmentFile=.*|EnvironmentFile=$INSTALL_DIR/server/.env|" "$TMP_SERVICE"
sed -i "s|WorkingDirectory=.*|WorkingDirectory=$INSTALL_DIR/server|" "$TMP_SERVICE"
install -m 0644 "$TMP_SERVICE" /etc/systemd/system/bedrock-panel.service
rm -f "$TMP_SERVICE"

systemctl daemon-reload
systemctl enable bedrock-panel >/dev/null 2>&1 || true
systemctl restart bedrock-panel
sleep 2
ok "Service installed & started"

# ---------- 15. Verification ----------
log "Verifying"
if systemctl is-active bedrock-panel --quiet; then
  ok "service: active"
else
  warn "service: NOT active — see 'journalctl -u bedrock-panel -n 50'"
fi

# Find the public IP for the final URL
PUB_IP="$(curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || true)"
[ -n "$PUB_IP" ] || PUB_IP="<YOUR_SERVER_IP>"

# Local sanity check
HEALTH="$(curl -fsS --max-time 5 http://localhost:$PANEL_PORT/api/health 2>/dev/null || true)"
if [ "$HEALTH" = '{"ok":true}' ]; then
  ok "backend: responds on :$PANEL_PORT"
else
  warn "backend: no response on :$PANEL_PORT yet — give it a few seconds, or run 'journalctl -u bedrock-panel -f'"
fi

# ---------- final banner ----------
SERVER_IP="${SERVER_IP:-$PUB_IP}"
printf "\n\033[1;32m╔══════════════════════════════════════════════════════════════╗\n"
printf "║  ✔ Setup complete                                            ║\n"
printf "╚══════════════════════════════════════════════════════════════╝\033[0m\n\n"
printf "  Open the panel in your browser:\n\n"
printf "      \033[1;36mhttp://%s:%s\033[0m\n\n" "$PUB_IP" "$PANEL_PORT"
printf "  Log in with the password you chose in step 2.\n\n"
printf "  Useful commands later:\n"
printf "    systemctl status bedrock-panel     # is the backend running?\n"
printf "    systemctl restart bedrock-panel    # restart after updating code\n"
printf "    journalctl -u bedrock-panel -f      # live backend logs\n\n"

if systemctl is-active bedrock-panel --quiet && [ "$HEALTH" = '{"ok":true}' ]; then
  printf "  \033[1;32mEverything checked out.\033[0m Visit the URL above and click Start on the Dashboard.\n\n"
else
  printf "  \033[1;33mAlmost done — see the warnings above. Fix and re-run: sudo bash install.sh\033[0m\n\n"
fi

printf "  Full reference (manual steps, troubleshooting): docs/DEPLOYMENT.md\n"
printf "  Known caveats (no HTTPS in v1, etc.):           docs/KNOWN-ISSUES.md\n\n"
