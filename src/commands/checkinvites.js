const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User, Role, Invite } = require('../models/schemas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkinvites')
        .setDescription('Check invite balance and active invites for a user (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check invites for')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ flags: ['Ephemeral'] });

        try {
            const targetUser = interaction.options.getUser('user');
            const member = await interaction.guild.members.fetch(targetUser.id);
            const displayName = member.displayName;
            const isTargetAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

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

            // Format response
            let response = `**Invite Balance for ${displayName}:**\n`;
            if (isTargetAdmin) {
                response += `${displayName} has unlimited invites (Administrator)\n`;
            } else if (userInvites.length > 0) {
                response += `${displayName} has ${userInvites[0].totalInvitesRemaining} invites remaining\n`;
            } else {
                response += `${displayName} has 0 invites remaining\n`;
            }

            if (activeInvites.length > 0) {
                response += '\n**Active Invites:**\n';
                activeInvites.forEach((inv, index) => {
                    const uses = inv.max_uses === 0 ? '∞' : inv.max_uses;
                    response += `${index + 1}. ${inv.link} (${inv.times_used}/${uses} uses)\n`;
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