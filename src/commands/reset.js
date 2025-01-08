const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { User, Role, Invite, JoinTracking, ServerConfig } = require('../models/schemas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset all bot data for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // Create confirmation button
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_reset')
            .setLabel('Yes, Reset Everything')
            .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_reset')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder()
            .addComponents(confirmButton, cancelButton);

        const response = await interaction.reply({
            content: '⚠️ **WARNING: This action cannot be undone!**\n\n' +
                    'This will delete:\n' +
                    '• All invite configurations\n' +
                    '• All role settings\n' +
                    '• All invite tracking data\n' +
                    '• All user permissions\n' +
                    '• Bot configuration\n' +
                    '• **All active invite links created by the bot**\n\n' +
                    'Are you sure you want to reset all bot data for this server?',
            components: [row]
        });

        try {
            // Wait for button interaction
            const confirmation = await response.awaitMessageComponent({
                filter: i => i.user.id === interaction.user.id,
                time: 30000
            });

            if (confirmation.customId === 'confirm_reset') {
                await confirmation.update({
                    content: '🔄 Resetting server data...',
                    components: []
                });

                // Get logging channel before deleting config
                const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
                const logsChannelId = serverConfig?.logs_channel_id;

                // Get all bot invites from the database
                const botInvites = await Invite.find({ guild_id: interaction.guildId });
                
                // Delete all bot-created invites from Discord
                const guildInvites = await interaction.guild.invites.fetch();
                const deletePromises = [];

                for (const invite of guildInvites.values()) {
                    if (invite.inviterId === process.env.APPLICATION_ID) {
                        deletePromises.push(invite.delete()
                            .catch(error => console.error(`Failed to delete invite ${invite.code}:`, error)));
                    }
                }

                // Wait for all invite deletions to complete
                await Promise.all(deletePromises);

                // Delete all data for this guild from database
                await Promise.all([
                    User.deleteMany({ guild_id: interaction.guildId }),
                    Role.deleteMany({ guild_id: interaction.guildId }),
                    Invite.deleteMany({ guild_id: interaction.guildId }),
                    JoinTracking.deleteMany({ guild_id: interaction.guildId }),
                    ServerConfig.deleteOne({ guild_id: interaction.guildId })
                ]);

                // Clear the invite cache for this guild
                interaction.client.invites.delete(interaction.guildId);

                await confirmation.editReply({
                    content: '✅ All bot data for this server has been reset.\n' +
                            '• Database entries cleared\n' +
                            '• Bot-created invites deleted\n' +
                            '• Invite cache cleared\n\n' +
                            'Use `/setup` to reconfigure the bot.',
                    components: []
                });

                // Try to log to channel if it still exists
                if (logsChannelId) {
                    try {
                        const logsChannel = await interaction.guild.channels.fetch(logsChannelId);
                        if (logsChannel) {
                            await logsChannel.send(
                                '🔄 **Server Reset**\n' +
                                `Reset by: ${interaction.user.tag}\n` +
                                'All bot data for this server has been cleared.\n' +
                                'Use `/setup` to reconfigure the bot.'
                            );
                        }
                    } catch (error) {
                        console.error('Could not send final log message:', error);
                    }
                }

            } else {
                await confirmation.update({
                    content: '❌ Reset cancelled.',
                    components: []
                });
            }
        } catch (error) {
            if (error.code === 'InteractionCollectorError') {
                await interaction.editReply({
                    content: '❌ Reset cancelled - No response received within 30 seconds.',
                    components: []
                });
            } else {
                console.error('Error in reset command:', error);
                await interaction.editReply({
                    content: '❌ An error occurred while resetting the server data.',
                    components: []
                });
            }
        }
    }
}; 