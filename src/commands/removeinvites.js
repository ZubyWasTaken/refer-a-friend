const {
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require('discord.js');
const { User } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');
const {
    calculateInviteBalance,
    removeInviteCredits
} = require('../utils/inviteBalances');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removeinvites')
        .setDescription('Remove invites from a user')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to remove invites from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of invites to remove')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;  // Exit if checks failed

        try {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            if (!Number.isInteger(amount) || amount < 1) {
                return await interaction.editReply({
                    content: '❌ The invite amount must be a positive integer.'
                });
            }

            const member = await interaction.guild.members.fetch(targetUser.id);
            if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.editReply({
                    content: `❌ Cannot remove invites from ${targetUser}; Administrators have unlimited invites.`
                });
            }

            // Get all roles with invite configurations for this user
            const userRoles = await User.find({
                user_id: targetUser.id,
                guild_id: interaction.guildId
            });

            if (!userRoles || userRoles.length === 0) {
                return await interaction.editReply({
                    content: `❌ ${targetUser} doesn't have any roles that grant invites.`
                });
            }

            // Check if user has unlimited invites
            const balance = calculateInviteBalance(userRoles);
            if (balance.unlimited) {
                return await interaction.editReply({
                    content: `❌ Cannot remove invites from ${targetUser} as they have unlimited invites.`
                });
            }

            const newTotal = await removeInviteCredits({
                userId: targetUser.id,
                guildId: interaction.guildId,
                amount
            });

            if (newTotal === null) {
                return await interaction.editReply({
                    content: `❌ ${targetUser.tag} only has ${balance.total} invites remaining. Cannot remove ${amount}.`
                });
            }
            if (newTotal === -1) {
                return await interaction.editReply({
                    content: `❌ Cannot remove invites from ${targetUser} because their balance became unlimited.`
                });
            }

            // Log the action with the correct total
            await interaction.client.logger.logToChannel(interaction.guildId,
                `🎟️ **Invites Removed**\n` +
                `Admin: <@${interaction.user.id}>\n` +
                `User: <@${targetUser.id}>\n` +
                `Amount: -${amount}\n` +
                `New Total: ${newTotal}`
            );

            // Log the invite removal to file
            interaction.client.logger.logToFile(`Removed ${amount} invites from user ${targetUser.tag}`, "invite_remove", {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag
            });

            await interaction.editReply({
                content: `✅ Removed ${amount} invites from <@${targetUser.id}>.\n` +
                        `They now have ${newTotal} invites remaining.`
            });

        } catch (error) {
            console.error('Error removing invites:', error);
            await interaction.editReply({
                content: '❌ An error occurred while removing invites.'
            });
        }
    }
};
