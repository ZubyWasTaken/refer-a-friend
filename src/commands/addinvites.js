const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addinvites')
        .setDescription('Add invites to a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to give invites to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of invites to give')
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
                // Update user's invites and get the updated document
                const updatedUser = await User.findOneAndUpdate(
                    { _id: roleToUpdate._id },
                    { $inc: { invites_remaining: amount } },
                    { new: true }  // This returns the updated document
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

                // Log the invite addition to file
                interaction.client.logger.logToFile(`Added ${amount} invites to user ${targetUser.tag}`, "invite_add", {
                    guildId: interaction.guildId,
                    guildName: interaction.guild.name,
                    userId: interaction.user.id,
                    username: interaction.user.tag,
                });

                await interaction.editReply({
                    content: `✅ Successfully added ${amount} invites to ${targetUser}.`+
                        `\nThey now have ${totalInvites[0]?.total || 0} invites remaining.`
                });

                // Log the action with the correct total
                await interaction.client.logger.logToChannel(interaction.guildId,
                    `🎟️ **Invite Added**\n` +
                    `Admin: <@${interaction.user.id}>\n` +
                    `User: <@${targetUser.id}>\n` +
                    `Amount: +${amount}\n` +
                    `New Total: ${totalInvites[0]?.total || 0}`
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