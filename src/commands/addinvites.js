const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User, Role, ServerConfig } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addinvites')
        .setDescription('Add invites to a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to add invites to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of invites to add')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;  // Exit if checks failed

        try {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const member = await interaction.guild.members.fetch(targetUser.id);
            // Get all roles with invite configurations for this user
            const userRoles = await User.find({
                user_id: targetUser.id,
                guild_id: interaction.guildId
            });

            // Check if user has unlimited invites
            const hasUnlimitedInvites = userRoles.some(role => role.invites_remaining === -1);
            if (hasUnlimitedInvites) {
                return await interaction.editReply({
                    content: `✅ ${targetUser} already has unlimited invites.`
                });
            }

            if (!userRoles || userRoles.length === 0) {
                return await interaction.editReply({
                    content: `❌ ${targetUser} doesn't have any roles that grant invites.`
                });
            }

            // Find the role with the lowest non-negative invite count
            const roleToUpdate = userRoles.reduce((lowest, current) => {
                if (current.invites_remaining >= 0) {
                    if (!lowest || current.invites_remaining < lowest.invites_remaining) {
                        return current;
                    }
                }
                return lowest;
            }, null);

            if (roleToUpdate) {
                await User.findOneAndUpdate(
                    { _id: roleToUpdate._id },
                    { $inc: { invites_remaining: amount } }
                );

                await interaction.editReply({
                    content: `✅ Successfully added ${amount} invites to ${targetUser}.`,
                    flags: ['Ephemeral']
                });
                 // Log the action
                await interaction.client.logger.logToChannel(interaction.guildId,
                    `🎟️ **Invites Added**\n` +
                    `Admin: ${interaction.user.tag}\n` +
                    `User: ${targetUser.tag}\n` +
                    `Amount: +${amount}\n` +
                    `New Total: ${userRoles.invites_remaining}`
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