#!/bin/sh

# Exit on any error
set -e

# Ensure logs directory exists and has correct permissions
if [ ! -d "/app/logs" ]; then
    mkdir -p /app/logs
    chown nobody:users /app/logs
    chmod 755 /app/logs
fi

# Verify environment variables
if [ -z "$BOT_TOKEN" ] || [ -z "$MONGODB_URI" ] || [ -z "$CLIENT_ID" ] || [ -z "$APPLICATION_ID" ]; then
    echo "Error: Required environment variables are not set"
    echo "Please ensure all required environment variables are provided"
    exit 1
fi

# Start the bot
exec "$@"
