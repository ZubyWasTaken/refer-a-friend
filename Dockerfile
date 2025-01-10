# Use Node.js 21 as base image
FROM node:21-slim

# Set working directory
WORKDIR /app

# Create non-root user and group
RUN if getent group users > /dev/null 2>&1; then \
      echo "Group 'users' already exists"; \
    else \
      groupadd -g 100 users; \
    fi && \
    if id -u nobody > /dev/null 2>&1; then \
      echo "User 'nobody' already exists"; \
    else \
      useradd -u 99 -g users -s /bin/sh nobody; \
    fi

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Ensure subsequent commands run as root
USER root

# Create logs directory with correct permissions
RUN mkdir -p /app/logs && \
    chmod 777 /app/logs && \
    chown 99:100 /app/logs

# Copy and set entrypoint script with correct permissions
COPY entrypoint.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/entrypoint.sh

# Copy application code with ownership set to nobody:users
COPY --chown=nobody:users . .

# Define non-sensitive environment variable
ENV NODE_ENV=production

# Define logs volume with specific permissions
VOLUME ["/app/logs"]

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Start the bot
CMD ["node", "src/index.js"]
