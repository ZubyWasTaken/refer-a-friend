const { getDatabase } = require('../database/init');

class Logger {
    constructor(client) {
        this.client = client;
    }

    async logToChannel(guildId, content) {
        const db = getDatabase();
        const config = db.prepare('SELECT logs_channel_id FROM server_config WHERE guild_id = ?').get(guildId);
        
        if (!config) return;

        const guild = await this.client.guilds.fetch(guildId);
        const logsChannel = await guild.channels.fetch(config.logs_channel_id);
        
        if (logsChannel) {
            await logsChannel.send(content);
        }
    }
}

module.exports = { Logger }; 