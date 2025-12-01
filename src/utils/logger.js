const { ServerConfig } = require('../models/schemas');
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;

// Ensure the logs directory exists
const logsDir = path.join(__dirname, "..", "..", "logs");
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

class Logger {
    constructor(client) {
        this.client = client;
    }

    /**
     * Log message to Discord channel
     * @param {string} guildId - Discord guild ID
     * @param {string} message - Message to send to the channel
     */
    async logToChannel(guildId, message) {
        try {
            // Get server config from MongoDB
            const config = await ServerConfig.findOne({ guild_id: guildId });
            
            if (!config || !config.logs_channel_id) {
                console.error(`No logging channel configured for guild ${guildId}`);
                return;
            }

            const channel = await this.client.channels.fetch(config.logs_channel_id);
            if (channel) {
                await channel.send(message);
            }
        } catch (error) {
            console.error('Error logging to channel:', error);
            // Log the error to file
            this.logToFile(`Failed to log to Discord channel: ${error.message}`, 'error', {
                guildId: guildId
            });
        }
    }

    /**
     * Log message to a file
     * @param {string} message - The message to log
     * @param {string} type - Type of log ('command', 'invite', 'error', etc.)
     * @param {Object} options - Additional logging options
     * @param {string} [options.guildId] - Discord guild ID
     * @param {string} [options.guildName] - Discord guild name
     * @param {string} [options.userId] - Discord user ID
     * @param {string} [options.username] - Discord username
     * @param {string} [options.inviteCode] - Invite code (for invite-related logs)
     * @param {string} [options.roleName] - Role name (for role-related logs)
     * @param {string} [options.channelName] - Channel name (for channel-related logs)
     * @param {string} [options.maxInvites] - Maximum invites (for role settings)
     */
    async logToFile(message, type, options = {}) {
        const {
            guildId,
            guildName,
            userId,
            username,
            inviteCode,
            roleName,
            channelName,
            maxInvites
        } = options;

        // Create guild-specific or general bot log file
        const fileName = guildId && guildName
            ? `guild_${guildName.replace(/[^a-z0-9]/gi, '_')}_${guildId}.log`
            : 'bot.log';
        const filePath = path.join(logsDir, fileName);

        // Build the log message with all available information
        const timestamp = new Date().toISOString();
        const userInfo = username && userId ? `user: ${username} (${userId}) ` : "";
        const inviteInfo = inviteCode ? `invite: ${inviteCode} ` : "";
        const roleInfo = roleName ? `role: ${roleName} ` : "";

        const logMessage = `${timestamp} [${type.toUpperCase()}] - ${userInfo}${inviteInfo}${roleInfo}${message}\n`;

        try {
            // Append to log file using promises
            await fsPromises.appendFile(filePath, logMessage);
        } catch (err) {
            console.error("Error writing to log file:", err);
            // Write to fallback error log
            const errorPath = path.join(logsDir, 'error.log');
            try {
                await fsPromises.appendFile(errorPath,
                    `${timestamp} [ERROR] - Failed to write to ${fileName}: ${err.message}\n`
                );
            } catch (errorLogErr) {
                console.error("Error writing to error log:", errorLogErr);
            }
        }
    }

    /**
     * Clean old log files
     * @param {number} daysToKeep - Number of days to keep logs for
     */
    async cleanOldLogs(daysToKeep = 30) {
        const now = Date.now();
        const maxAge = daysToKeep * 24 * 60 * 60 * 1000;

        try {
            const files = await fsPromises.readdir(logsDir);

            for (const file of files) {
                const filePath = path.join(logsDir, file);
                try {
                    const stats = await fsPromises.stat(filePath);

                    if (now - stats.mtime.getTime() > maxAge) {
                        await fsPromises.unlink(filePath);
                        console.log(`Deleted old log file: ${file}`);
                    }
                } catch (err) {
                    console.error(`Error processing ${file}:`, err);
                }
            }
        } catch (err) {
            console.error("Error cleaning old logs:", err);
        }
    }
}

// Export the class itself, not an instance
module.exports = Logger;