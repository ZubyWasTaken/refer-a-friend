const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { User, Role, Invite, JoinTracking, ServerConfig } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset all bot data for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply(); 

        // Check if user has Administrator privileges
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.editReply({
            content: '❌ You need a role with **Administrator** privileges to run this command.\n\n' +
                    'Please:\n' +
                    '1. Ask a server administrator to give you a role with Administrator permissions\n' +
                    '2. Or ask them to run this command instead'
            });
        }

        // Get logging channel before deleting config
        const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });

        // After checking serverConfig but before creating confirmation buttons
        if (!serverConfig) {
            return await interaction.editReply({
                content: '❌ This server is not set up for invite management.\n' +
                        'Please contact a server administrator for assistance.',
                flags: ['Ephemeral']
            });
        }

        // Store logsChannelId for later use
        const logsChannelId = serverConfig.logs_channel_id;

        // Check if logs channel exists but don't block the reset
        let hasValidLogsChannel = false;
        if (logsChannelId) {
            try {
                const logsChannel = await interaction.guild.channels.fetch(logsChannelId);
                hasValidLogsChannel = !!logsChannel;
            } catch (error) {
                if (error.code === 10003) { // Unknown Channel error
                    console.log('Logs channel not found, continuing without logging');
                } else {
                    console.error('Error checking logs channel:', error);
                }
                hasValidLogsChannel = false;
            }
        }

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

        const response = await interaction.editReply({
            content: '⚠️ **WARNING: This action cannot be undone!**\n\n' +
                    'This will delete:\n' +
                    '• All of the server configuration settings for the bot\n' +
                    '• All active invite links created by the bot\n' +
                    '• All role invite permissions and limits\n' +
                    '• All invite tracking and join history from the database\n' +
                    '• All user invite allowances\n\n' +
                    '**This command will be as if you never used the bot before.**\n\n' +
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

                // Log the reset action
                interaction.client.logger.logToFile("Server data reset", "reset", {
                    guildId: interaction.guildId,
                    guildName: interaction.guild.name,
                    userId: interaction.user.id,
                    username: interaction.user.tag
                });

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

                // Only try to log if we have a valid channel
                if (hasValidLogsChannel && logsChannelId) {
                    try {
                        const logsChannel = await interaction.guild.channels.fetch(logsChannelId);
                        if (logsChannel) {
                            await logsChannel.send(
                                '🔄 **Server Reset**\n' +
                                `Reset by: <@${interaction.user.id}>\n` +
                                'All bot data for this server has been cleared.\n' +
                                'Use `/setup` to reconfigure the bot.'
                            );
                        }
                    } catch (error) {
                        console.error('Could not send final log message:', error);
                    }
                }

                // Log command usage
                interaction.client.logger.logToFile("Command usage", "command_usage", {
                    guildId: interaction.guildId,
                    guildName: interaction.guild.name,
                    userId: interaction.user.id,
                    username: interaction.user.tag,
                    command: 'reset'
                });

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