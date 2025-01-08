const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ServerConfig } = require('../models/schemas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('changedefaults')
        .setDescription('Change default server settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('logschannel')
                .setDescription('Change where this bot\'s logs are sent')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The new logs channel')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('botchannel')
                .setDescription('Change the channel where this bot\'s commands can be used')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The new bot commands channel')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('defaultrole')
                .setDescription('Change the default invite role')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The new default invite role')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();
            
            // Get current server config
            const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
            if (!serverConfig) {
                return await interaction.editReply({
                    content: '❌ Server not set up! Please use `/setup` first.',
                    flags: ['Ephemeral']
                });
            }

            // Check if botchannel command is being used in the correct channel
            if (subcommand === 'botchannel' && interaction.channelId !== serverConfig.bot_channel_id) {
                const correctChannel = interaction.guild.channels.cache.get(serverConfig.bot_channel_id);
                return await interaction.editReply({
                    content: `❌ This command can only be used in ${correctChannel}.\nPlease try again in the correct channel.`,
                    flags: ['Ephemeral']
                });
            }

            // Check for same-value settings and role hierarchy
            switch(subcommand) {
                case 'botchannel': {
                    const newChannel = interaction.options.getChannel('channel');
                    if (newChannel.id === serverConfig.bot_channel_id) {
                        return await interaction.editReply({
                            content: `❌ ${newChannel} is already set as the bot commands channel.`
                        });
                    }
                    break;
                }
                case 'logschannel': {
                    const newChannel = interaction.options.getChannel('channel');
                    if (newChannel.id === serverConfig.logs_channel_id) {
                        return await interaction.editReply({
                            content: `❌ ${newChannel} is already set as the logs channel.`
                        });
                    }
                    break;
                }
                case 'defaultrole': {
                    const newRole = interaction.options.getRole('role');
                    if (newRole.id === serverConfig.default_invite_role) {
                        return await interaction.editReply({
                            content: `❌ ${newRole} is already set as the default invite role.`
                        });
                    }

                    // Check if the role is higher than the bot's role
                    const botRole = interaction.guild.members.me.roles.highest;
                    if (newRole.position >= botRole.position) {
                        return await interaction.editReply({
                            content: `❌ I cannot assign the ${newRole} role as it is positioned higher than or equal to my highest role (${botRole}).`
                        });
                    }
                    break;
                }
            }

            let updateData = {};
            let successMessage = '';

            switch (subcommand) {
                case 'logschannel':
                    const logsChannel = interaction.options.getChannel('channel');
                    updateData = { logs_channel_id: logsChannel.id };
                    successMessage = `✅ Logs channel updated to ${logsChannel}`;
                    break;

                case 'botchannel':
                    const botChannel = interaction.options.getChannel('channel');
                    updateData = { bot_channel_id: botChannel.id };
                    successMessage = `✅ Bot commands channel updated to ${botChannel}`;
                    break;

                case 'defaultrole':
                    const defaultRole = interaction.options.getRole('role');
                    updateData = { default_invite_role: defaultRole.id };
                    successMessage = `✅ Default invite role updated to ${defaultRole}`;
                    break;
            }

            // Update the server config
            await ServerConfig.findOneAndUpdate(
                { guild_id: interaction.guildId },
                updateData,
                { upsert: true }
            );

            // Log the change
            await interaction.client.logger.logToChannel(interaction.guildId,
                `⚙️ **Bot Settings Updated**\n` +
                `Admin: ${interaction.user.tag}\n` +
                `Change: ${successMessage}`
            );

            await interaction.editReply({
                content: successMessage
            });

        } catch (error) {
            console.error('Error changing defaults:', error);
            await interaction.editReply({
                content: '❌ An error occurred while updating the settings.'
            });
        }
    }
}; 