const {
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require('discord.js');
const { User } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');
const {
    addInviteCredits,
    calculateInviteBalance
} = require('../utils/inviteBalances');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addinvites')
        .setDescription('Add invites to a user')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to give invites to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of invites to give')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;  // Exit if checks failed

        try {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const member = await interaction.guild.members.fetch(targetUser.id);

            if (!Number.isInteger(amount) || amount < 1) {
                return await interaction.editReply({
                    content: '❌ The invite amount must be a positive integer.'
                });
            }

            if (member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.editReply({
                    content: `✅ ${targetUser} already has unlimited invites as an Administrator.`
                });
            }

            // Get all roles with invite configurations for this user
            const userRoles = await User.find({
                user_id: targetUser.id,
                guild_id: interaction.guildId
            });

            // Check if user has unlimited invites
            const balance = calculateInviteBalance(userRoles);
            if (balance.unlimited) {
                return await interaction.editReply({
                    content: `✅ ${targetUser} already has unlimited invites.`
                });
            }

            if (!userRoles || userRoles.length === 0) {
                return await interaction.editReply({
                    content: `❌ ${targetUser} doesn't have any roles that grant invites.`
                });
            }

            const updatedRole = await addInviteCredits({
                userId: targetUser.id,
                guildId: interaction.guildId,
                amount
            });

            if (updatedRole) {
                const updatedRecords = await User.find({
                    user_id: targetUser.id,
                    guild_id: interaction.guildId
                });
                const updatedBalance = calculateInviteBalance(updatedRecords);
                // Log the invite addition to file
                await interaction.client.logger.logToFile(`Added ${amount} invites to user ${targetUser.tag}`, "invite_add", {
                    guildId: interaction.guildId,
                    guildName: interaction.guild.name,
                    userId: interaction.user.id,
                    username: interaction.user.tag,
                });

                await interaction.editReply({
                    content: `✅ Successfully added ${amount} invites to ${targetUser}.`+
                        `\nThey now have ${updatedBalance.total} invites remaining.`
                });

                // Log the action with the correct total
                await interaction.client.logger.logToChannel(interaction.guildId,
                    `🎟️ **Invite Added**\n` +
                    `Admin: <@${interaction.user.id}>\n` +
                    `User: <@${targetUser.id}>\n` +
                    `Amount: +${amount}\n` +
                    `New Total: ${updatedBalance.total}`
                );
            } else {
                await interaction.editReply({
                    content: `❌ ${targetUser} doesn't have any roles that grant invites.`
                });
            }

        } catch (error) {
            console.error('Error adding invites:', error);
            await interaction.editReply({
                content: 'There was an error adding invites.'
            });
        }
    }
};
