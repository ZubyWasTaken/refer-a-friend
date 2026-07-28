# Use Node.js 24 as required by discord.js
FROM node:24-slim

# Set working directory
WORKDIR /app

# Create non-root user and group (optional—some prefer to rely on environment variables)
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

# Install the exact production dependencies from package-lock.json
RUN npm ci --omit=dev

# Copy application code (no chown here)
COPY . .

# Environment
ENV NODE_ENV=production

# Remove the volume line entirely
# VOLUME ["/app/logs"]

# Copy and set entrypoint
COPY entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Default command
CMD ["node", "src/index.js"]
