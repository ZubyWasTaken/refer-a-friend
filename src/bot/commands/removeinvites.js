const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User, Role, ServerConfig } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removeinvites')
        .setDescription('Remove invites from a user')
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
            const hasUnlimitedInvites = userRoles.some(role => role.invites_remaining === -1);
            if (hasUnlimitedInvites) {
                return await interaction.editReply({
                    content: `❌ Cannot remove invites from ${targetUser} as they have unlimited invites.`
                });
            }

            const member = await interaction.guild.members.fetch(targetUser.id);

            // Get user's highest invite role
            const highestInviteRole = userRoles.reduce((prev, current) => 
                (prev.max_invites > current.max_invites) ? prev : current
            );

            // Find user record
            const userInvites = await User.findOne({
                user_id: targetUser.id,
                role_id: highestInviteRole.role_id,
                guild_id: interaction.guildId
            });

            if (!userInvites) {
                return await interaction.editReply({
                    content: `❌ ${targetUser.tag} doesn't have any invites to remove.`
                });
            }

            // Check if user has enough invites to remove
            if (userInvites.invites_remaining < amount) {
                return await interaction.editReply({
                    content: `❌ ${targetUser.tag} only has ${userInvites.invites_remaining} invites remaining. Cannot remove ${amount}.`
                });
            }

            // Update user's invites
            const updatedUser = await User.findOneAndUpdate(
                {
                    user_id: targetUser.id,
                    role_id: highestInviteRole.role_id,
                    guild_id: interaction.guildId
                },
                {
                    $inc: { invites_remaining: -amount }
                },
                { new: true }
            );

            // Get total invites across all roles after update
            const totalInvites = await User.aggregate([
                {
                    $match: {
                        user_id: targetUser.id,
                        guild_id: interaction.guildId
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: "$invites_remaining" }
                    }
                }
            ]);

            // Log the action with the correct total
            await interaction.client.logger.logToChannel(interaction.guildId,
                `🎟️ **Invites Removed**\n` +
                `Admin: <@${interaction.user.id}>\n` +
                `User: <@${targetUser.id}>\n` +
                `Amount: -${amount}\n` +
                `New Total: ${totalInvites[0]?.total || 0}`
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
                        `They now have ${totalInvites[0]?.total || 0} invites remaining.`
            });

        } catch (error) {
            console.error('Error removing invites:', error);
            await interaction.editReply({
                content: '❌ An error occurred while removing invites.'
            });
        }
    }
}; 