const mongoose = require('mongoose');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    InteractionContextType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require('discord.js');
const {
    User,
    Role,
    Invite,
    JoinTracking,
    ServerConfig
} = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');
const {
    consumePlannedInviteDeletion,
    markPlannedInviteDeletion
} = require('../utils/inviteDeletionTracker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset all bot data for this server')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;

        const logsChannelId = serverConfig.logs_channel_id;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_reset')
                .setLabel('Yes, Reset Everything')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_reset')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );
        const response = await interaction.editReply({
            content: '⚠️ **WARNING: This action cannot be undone!**\n\n' +
                'This removes this server\'s bot configuration, tracked invites, role allocations, join history, and user balances.\n\n' +
                'Are you sure you want to reset all bot data for this server?',
            components: [row]
        });
        let databaseResetCommitted = false;

        try {
            const confirmation = await response.awaitMessageComponent({
                filter: component => (
                    component.user.id === interaction.user.id
                ),
                time: 30_000
            });

            if (confirmation.customId !== 'confirm_reset') {
                return await confirmation.update({
                    content: '❌ Reset cancelled.',
                    components: []
                });
            }

            await confirmation.update({
                content: '🔄 Resetting server data...',
                components: []
            });

            const trackedInvites = await Invite.find({
                guild_id: interaction.guildId,
                active: { $ne: false }
            });
            const trackedCodes = new Set(
                trackedInvites.map(invite => invite.invite_code)
            );
            const guildInvites = await interaction.guild.invites.fetch();
            const botInvites = guildInvites.filter(invite => (
                trackedCodes.has(invite.code)
            ));

            await Promise.all(botInvites.map(async invite => {
                markPlannedInviteDeletion(
                    interaction.client,
                    interaction.guildId,
                    invite.code
                );
                try {
                    await invite.delete('Refer-a-Friend server reset');
                } catch (error) {
                    consumePlannedInviteDeletion(
                        interaction.client,
                        interaction.guildId,
                        invite.code
                    );
                    throw error;
                }
            }));

            await mongoose.connection.transaction(async session => {
                await User.deleteMany(
                    { guild_id: interaction.guildId },
                    { session }
                );
                await Role.deleteMany(
                    { guild_id: interaction.guildId },
                    { session }
                );
                await Invite.deleteMany(
                    { guild_id: interaction.guildId },
                    { session }
                );
                await JoinTracking.deleteMany(
                    { guild_id: interaction.guildId },
                    { session }
                );
                await ServerConfig.deleteOne(
                    { guild_id: interaction.guildId },
                    { session }
                );
            });
            databaseResetCommitted = true;

            interaction.client.invites.delete(interaction.guildId);
            await interaction.client.logger.logToFile(
                'Server data reset',
                'reset',
                {
                    guildId: interaction.guildId,
                    guildName: interaction.guild.name,
                    userId: interaction.user.id,
                    username: interaction.user.tag
                }
            );

            await confirmation.editReply({
                content: '✅ All bot data for this server has been reset.\n\n' +
                    'Use `/setup` to configure the bot again.',
                components: []
            });

            try {
                const logsChannel = logsChannelId
                    ? await interaction.guild.channels.fetch(logsChannelId)
                    : null;
                if (logsChannel?.isTextBased()) {
                    await logsChannel.send(
                        '🔄 **Server Reset**\n' +
                        `Reset by: <@${interaction.user.id}>\n` +
                        'All Refer-a-Friend data for this server was cleared.'
                    );
                }
            } catch (logError) {
                console.error('Could not send final reset log:', logError);
            }
        } catch (error) {
            if (error.code === 'InteractionCollectorError') {
                await interaction.editReply({
                    content: '❌ Reset cancelled — no response was received within 30 seconds.',
                    components: []
                });
                return;
            }

            console.error('Error in reset command:', error);
            await interaction.editReply({
                content: databaseResetCommitted
                    ? '✅ The reset completed, but the final confirmation could not be delivered.'
                    : '❌ The database reset was not committed. Some Discord invites may already have been removed; run `/reset` again to finish safely.',
                components: []
            });
        }
    }
};
