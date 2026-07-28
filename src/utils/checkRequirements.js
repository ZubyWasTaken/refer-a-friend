const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { ServerConfig } = require('../models/schemas');

async function sendRequirementFailure(interaction, content) {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content });
    } else {
        await interaction.reply({
            content,
            flags: MessageFlags.Ephemeral
        });
    }
}

async function checkRequirements(
    interaction,
    { requireAdministrator = true } = {}
) {
    const memberPermissions =
        interaction.memberPermissions ??
        interaction.member?.permissions;

    if (
        requireAdministrator &&
        !memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
        await sendRequirementFailure(
            interaction,
            '❌ You need **Administrator** permission to use this command.'
        );
        return false;
    }

    // Check if server is setup
    const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
    if (!serverConfig?.setup_completed) {
        await sendRequirementFailure(
            interaction,
            '❌ Server not set up! Please use `/setup` first.'
        );
        return false;
    }

    // Check if command is being used in the correct channel
    if (interaction.channelId !== serverConfig.bot_channel_id) {
        const correctChannel =
            interaction.guild.channels.cache.get(serverConfig.bot_channel_id) ??
            `<#${serverConfig.bot_channel_id}>`;
        await sendRequirementFailure(
            interaction,
            `❌ This command can only be used in ${correctChannel}.\n` +
            'Please try again in the correct channel.'
        );
        return false;
    }

    return serverConfig;
}

module.exports = checkRequirements;
