const { getDatabase } = require('../database/init');

async function isSetupComplete(guildId, channelId) {
  const db = getDatabase();
  
  const config = db.prepare(`
    SELECT * FROM server_config 
    WHERE guild_id = ?
  `).get(guildId);

  if (!config || !config.setup_completed) {
    return { 
      completed: false, 
      message: 'This bot has not been set up yet. An administrator needs to run `/setup` first.' 
    };
  }

  if (channelId !== config.bot_channel_id) {
    return { 
      completed: false, 
      message: `Bot commands can only be used in <#${config.bot_channel_id}>.` 
    };
  }

  return { completed: true, config };
}

module.exports = { isSetupComplete }; 