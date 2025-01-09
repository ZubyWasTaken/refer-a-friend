const { ServerConfig } = require('../models/schemas');

async function checkRequirements(interaction) {
    // Check if server is setup
    const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
    if (!serverConfig) {
        await interaction.deleteReply();
        await interaction.followUp({
            content: '❌ Server not set up! Please use `/setup` first.',
            flags: ['Ephemeral']
        });
        return false;
    }

    // Check if command is being used in the correct channel
    if (interaction.channelId !== serverConfig.bot_channel_id) {
        const correctChannel = interaction.guild.channels.cache.get(serverConfig.bot_channel_id);
        await interaction.deleteReply();
        await interaction.followUp({
            content: `❌ This command can only be used in ${correctChannel}.\nPlease try again in the correct channel.`,
            flags: ['Ephemeral']
        });
        return false;
    }

    return serverConfig;
}

module.exports = checkRequirements; 