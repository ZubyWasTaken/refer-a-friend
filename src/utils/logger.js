const { ServerConfig } = require('../models/schemas');

class Logger {
    constructor(client) {
        this.client = client;
    }

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
        }
    }
}

// Export the class itself, not an instance
module.exports = Logger;