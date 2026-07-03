# Known Issues

## v1 Scope Limitations

### No HTTPS / TLS
The panel v1 ships without HTTPS. The admin password crosses the network in cleartext. This is acceptable for a single-user learning panel behind a firewall, but **not suitable for production use** without a reverse proxy.

**Recommended:** Put Caddy or Nginx in front of port 3000 with Let's Encrypt.

### No Multi-User Support
Only one admin account exists. There is no user management, permission system, or per-user scoping.

### No Docker Isolation
Unlike Pterodactyl (which runs each server in a Docker container with strict resource limits), v1 runs Bedrock directly on the host. The `bedrock-panel` system user limits the blast radius, but Docker would provide stronger isolation.

### No Scheduled / Automatic Backups
Backups are manual only. There is no cron schedule or retention policy for `worlds.bak-*` folders. Clean them up periodically via SSH.

### No Resource Graphs
CPU/RAM graphs over time are not included. The Dashboard shows point-in-time Memory & Swap only.

### No Java Edition Support
This panel works with the Minecraft Bedrock dedicated server only. Java Edition is not supported.

---

## Implementation Trade-offs

### Sudoers Rule Breadth
The locked-down sudoers rule (`/etc/sudoers.d/bedrock-panel`) allows specific swap commands. This is broader than a pure `systemctl`-only rule. The commands are whitelisted individually and reviewed. Validate with `sudo visudo -c` after any change.

### screen Session Reliability
`screen -ls` output varies across versions. "Dead" sessions can linger and cause false positives in status checks. The `isRunning()` function in `lib/screen.js` filters out sessions containing "Dead", but edge cases exist.

### Log File Rotation
The SSE log stream detects file rotation by watching for a newer file in `BEDROCK_DIR/logs/`. If Bedrock's log rotation behavior changes across versions, the stream may need updating.

### Path-Traversal Guard
All Files and Backups endpoints rely on `lib/paths.js` (`resolveInside`). Never bypass this guard by adding direct file-reading routes. If you add a new endpoint that touches the filesystem, always go through `resolveInside`.

### Atomic Writes
`server.properties` and file content edits use atomic writes (write to `.tmp` then `fs.rename`). This prevents half-written files on crash. However, the same pattern is **not** applied to swap operations or backup restores (which involve multiple steps).

---

## Getting Started / New Contributors

1. Read `plans/plan.md` from top to bottom — it explains the architecture, every decision, and the reasoning.
2. Each phase file (`plans/phases/phase-*.md`) documents exactly what was built and why.
3. The acceptance checklist in Phase 7 describes what a working deployment looks like.
