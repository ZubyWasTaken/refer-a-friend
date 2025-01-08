const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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