#!/bin/sh

# Exit on any error
set -e

# Verify environment variables
if [ -z "$BOT_TOKEN" ] || [ -z "$MONGODB_URI" ] || [ -z "$CLIENT_ID" ] || [ -z "$APPLICATION_ID" ]; then
    echo "Error: Required environment variables are not set"
    echo "Please ensure all required environment variables are provided"
    exit 1
fi

# Switch to nobody user and start the application
exec su -s /bin/sh nobody -c "$*"
