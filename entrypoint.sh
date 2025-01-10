#!/bin/sh
set -e

# Let user override default UID and GID via env
PUID="${PUID:-99}"
PGID="${PGID:-100}"

# Change 'nobody' user/group to match PUID/PGID
groupmod -o -g "$PGID" users
usermod -o -u "$PUID" -g "$PGID" nobody

# Optionally try to fix permissions (may fail on host):
chown nobody:users /app/logs || echo "Warning: Could not chown /app/logs"

# Run the main app as nobody
exec su -s /bin/sh nobody -c "$*"
