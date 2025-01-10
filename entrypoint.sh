#!/bin/sh
set -e

# Verify environment variables
if [ -z "$BOT_TOKEN" ] || [ -z "$MONGODB_URI" ] || [ -z "$CLIENT_ID" ] || [ -z "$APPLICATION_ID" ]; then
    echo "Error: Required environment variables are not set."
    exit 1
fi

# Start app as 'nobody'
exec su -s /bin/sh nobody -c "$*"
