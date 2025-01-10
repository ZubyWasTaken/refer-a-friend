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

# Create logs directory and set permissions
RUN mkdir -p /app/logs && \
    chown -R nobody:users /app && \
    chmod 755 /app/logs

# Copy and set entrypoint script with correct permissions
COPY entrypoint.sh /usr/local/bin/
RUN chmod 755 /usr/local/bin/entrypoint.sh && \
    chown nobody:users /usr/local/bin/entrypoint.sh

# Copy application code
COPY --chown=nobody:users . .

# Switch to non-root user
USER nobody

# Define non-sensitive environment variable
ENV NODE_ENV=production

# Define logs volume
VOLUME ["/app/logs"]

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Start the bot
CMD ["node", "src/index.js"]
