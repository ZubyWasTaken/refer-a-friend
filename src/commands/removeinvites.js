const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User, Role } = require('../models/schemas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removeinvites')
        .setDescription('Remove invites from a user (Admin only)')
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

        try {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const member = await interaction.guild.members.fetch(targetUser.id);

            // Get user's highest invite role
            const userRoles = await Role.find({
                role_id: { $in: Array.from(member.roles.cache.keys()) },
                guild_id: interaction.guildId
            });

            if (userRoles.length === 0) {
                return await interaction.editReply({
                    content: `❌ ${targetUser.tag} doesn't have any roles that can create invites.`
                });
            }

            // Get the role with the highest max_invites
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

            // Log the action
            await interaction.client.logger.logToChannel(interaction.guildId,
                `🎟️ **Invites Removed**\n` +
                `Admin: ${interaction.user.tag}\n` +
                `User: ${targetUser.tag}\n` +
                `Amount: -${amount}\n` +
                `New Total: ${updatedUser.invites_remaining}`
            );

            await interaction.editReply({
                content: `✅ Removed ${amount} invites from ${targetUser.tag}.\n` +
                        `They now have ${updatedUser.invites_remaining} invites remaining.`
            });

        } catch (error) {
            console.error('Error removing invites:', error);
            await interaction.editReply({
                content: '❌ An error occurred while removing invites.'
            });
        }
    }
}; 