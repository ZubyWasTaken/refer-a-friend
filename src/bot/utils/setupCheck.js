const { ServerConfig } = require('../models/schemas');

async function isSetupComplete(guildId) {
    try {
        const config = await ServerConfig.findOne({ guild_id: guildId });
        return config?.setup_completed || false;
    } catch (error) {
        console.error('Error checking setup status:', error);
        return false;
    }
}

async function getServerConfig(guildId) {
    try {
        const config = await ServerConfig.findOne({ guild_id: guildId });
        return config || null;
    } catch (error) {
        console.error('Error getting server config:', error);
        return null;
    }
}

module.exports = { isSetupComplete, getServerConfig }; 