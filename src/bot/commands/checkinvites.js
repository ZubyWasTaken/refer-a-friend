const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User, Invite } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkinvites')
        .setDescription('Check how many invites a user has')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check invites for')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;  // Exit if checks failed

        try {
            const targetUser = interaction.options.getUser('user');
            const member = await interaction.guild.members.fetch(targetUser.id);
            const displayName = member.displayName;
            const isTargetAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

            // Log that someone is checking invites
            interaction.client.logger.logToFile("Invite check performed", "invite_check", {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag,
                message: `Checked invites for user: ${targetUser.tag} (${targetUser.id})`
            });

            // Get user's invite information
            const userInvites = await User.aggregate([
                {
                    $match: {
                        user_id: targetUser.id,
                        guild_id: interaction.guildId
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalInvitesRemaining: { $sum: "$invites_remaining" }
                    }
                }
            ]);

            // Get active invites
            const activeInvites = await Invite.aggregate([
                {
                    $match: {
                        user_id: targetUser.id,
                        guild_id: interaction.guildId
                    }
                },
                {
                    $lookup: {
                        from: 'jointrackings',
                        localField: '_id',
                        foreignField: 'invite_id',
                        as: 'uses'
                    }
                },
                {
                    $project: {
                        link: 1,
                        max_uses: 1,
                        created_at: 1,
                        invite_code: 1,
                        times_used: { $size: '$uses' }
                    }
                },
                {
                    $match: {
                        $or: [
                            { $expr: { $lt: ['$times_used', '$max_uses'] } },
                            { max_uses: 0 }
                        ]
                    }
                }
            ]);

            // Log the results
            interaction.client.logger.logToFile(`Invite check results for ${targetUser.tag} (${targetUser.id}): remaining invites ${userInvites[0].totalInvitesRemaining} active invites ${activeInvites.length}`, "invite_check", {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag,
                message: `Remaining invites: ${isTargetAdmin ? 'Unlimited' : 
                    userInvites.length > 0 ? userInvites[0].totalInvitesRemaining : 0}, ` +
                    `Active invites: ${activeInvites.length}`
            });

            // Format response
            let response = `**Invite Balance for ${displayName}:**\n`;
            if (isTargetAdmin) {
                response += `${displayName} has unlimited invites (Administrator)\n`;
            } else if (userInvites.length > 0) {
                const inviteCount = userInvites[0].totalInvitesRemaining === -1 ? 'Unlimited' : userInvites[0].totalInvitesRemaining;
                response += `${displayName} has ${inviteCount} invites remaining\n`;
            } else {
                response += `${displayName} has 0 invites remaining\n`;
            }

            if (activeInvites.length > 0) {
                response += '\n**Active Invites:**\n';
                activeInvites.forEach((inv, index) => {
                    const uses = inv.max_uses === 0 ? '∞' : inv.max_uses;
                    response += `${index + 1}. ${inv.link}\n`;
                });
            } else {
                response += `\n${displayName} has no active invites.`;
            }

            await interaction.editReply({
                content: response,
                flags: ['Ephemeral']
            });

        } catch (error) {
            console.error('Error checking invites:', error);
            await interaction.editReply({
                content: 'There was an error checking the user\'s invites.',
                flags: ['Ephemeral']
            });
        }
    }
}; 