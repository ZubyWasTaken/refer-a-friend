const {
    ChannelType,
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require('discord.js');
const { ServerConfig } = require('../models/schemas');
const {
    findMissingChannelPermissions,
    REQUIRED_CHANNEL_PERMISSIONS
} = require('../utils/channelPermissions');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('changedefaults')
        .setDescription('Change default server settings')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('logschannel')
                .setDescription('Change where this bot\'s logs are sent')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The new logs channel')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('botchannel')
                .setDescription('Change the channel where this bot\'s commands can be used')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The new bot commands channel')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('defaultrole')
                .setDescription('Change or remove the default invite role')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The new default invite role')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('delete')
                        .setDescription('Remove the current default role?')
                        .addChoices(
                            { name: 'Yes', value: 'yes' },
                            { name: 'No', value: 'no' }
                        )
                        .setRequired(false))),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;

        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'defaultrole') {
                return await updateDefaultRole(interaction, serverConfig);
            }

            return await updateChannel(interaction, serverConfig, subcommand);
        } catch (error) {
            console.error('Error changing defaults:', error);
            await interaction.editReply({
                content: '❌ An error occurred while updating the settings.'
            });
        }
    }
};

async function updateDefaultRole(interaction, serverConfig) {
    const deleteOption = interaction.options.getString('delete');
    const newRole = interaction.options.getRole('role');

    if (deleteOption === 'yes') {
        if (!serverConfig.default_invite_role) {
            return interaction.editReply({
                content: '❌ There is no default invite role set to remove.'
            });
        }

        await ServerConfig.findOneAndUpdate(
            { guild_id: interaction.guildId },
            { $unset: { default_invite_role: 1 } },
            { runValidators: true }
        );
        await logSettingsChange(
            interaction,
            'Default invite role removed',
            'Default invite role removed'
        );
        return interaction.editReply({
            content: '✅ Default invite role has been removed.'
        });
    }

    if (!newRole) {
        return interaction.editReply({
            content: '❌ Provide a role to set, or use `delete: Yes` to remove the current default role.'
        });
    }
    if (newRole.id === serverConfig.default_invite_role) {
        return interaction.editReply({
            content: `❌ ${newRole} is already the default invite role.`
        });
    }
    if (!newRole.editable) {
        return interaction.editReply({
            content: `❌ I cannot assign ${newRole} as the default invite role.\n\n` +
                'Make sure the bot has **Manage Roles**, its highest role is above the selected role, and the role is not managed by an integration.'
        });
    }

    await ServerConfig.findOneAndUpdate(
        { guild_id: interaction.guildId },
        { $set: { default_invite_role: newRole.id } },
        { runValidators: true }
    );
    await logSettingsChange(
        interaction,
        `Default invite role updated to ${newRole}`,
        `Default invite role changed to ${newRole.name}`
    );
    return interaction.editReply({
        content: `✅ Default invite role updated to ${newRole}.`
    });
}

async function updateChannel(interaction, serverConfig, subcommand) {
    const channel = interaction.options.getChannel('channel');
    const isLogsChannel = subcommand === 'logschannel';
    const currentChannelId = isLogsChannel
        ? serverConfig.logs_channel_id
        : serverConfig.bot_channel_id;
    const settingName = isLogsChannel
        ? 'logs channel'
        : 'bot commands channel';

    if (channel.id === currentChannelId) {
        return interaction.editReply({
            content: `❌ ${channel} is already the ${settingName}.`
        });
    }

    const botMember = interaction.guild.members.me;
    if (!botMember) {
        return interaction.editReply({
            content: '❌ Cannot resolve the bot member for permission checks. Please try again.'
        });
    }

    const requirements = isLogsChannel
        ? REQUIRED_CHANNEL_PERMISSIONS.logs
        : REQUIRED_CHANNEL_PERMISSIONS.commands;
    const missingPermissions = findMissingChannelPermissions(
        channel,
        botMember,
        requirements
    );
    if (missingPermissions.length > 0) {
        return interaction.editReply({
            content: `❌ Missing permissions in ${channel}: ${missingPermissions.join(', ')}.`
        });
    }

    const update = isLogsChannel
        ? { logs_channel_id: channel.id }
        : { bot_channel_id: channel.id };
    await ServerConfig.findOneAndUpdate(
        { guild_id: interaction.guildId },
        { $set: update },
        { runValidators: true }
    );

    const successMessage = `${isLogsChannel ? 'Logs' : 'Bot commands'} channel updated to ${channel}`;
    await logSettingsChange(
        interaction,
        successMessage,
        `${settingName} changed to ${channel.name}`
    );
    return interaction.editReply({
        content: `✅ ${successMessage}.`
    });
}

async function logSettingsChange(interaction, channelMessage, fileMessage) {
    await interaction.client.logger.logToFile(
        fileMessage,
        'settings',
        {
            guildId: interaction.guildId,
            guildName: interaction.guild.name,
            userId: interaction.user.id,
            username: interaction.user.tag
        }
    );
    await interaction.client.logger.logToChannel(
        interaction.guildId,
        `⚙️ **Bot Settings Updated**\n` +
        `Admin: <@${interaction.user.id}>\n` +
        `Change: ${channelMessage}`
    );
}
