const {
    InteractionContextType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require('discord.js');
const { User, Invite } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');
const { calculateInviteBalance } = require('../utils/inviteBalances');
const { appendNumberedLinks } = require('../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkinvites')
        .setDescription('Check how many invites a user has')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check invites for')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
            const userRecords = await User.find({
                user_id: targetUser.id,
                guild_id: interaction.guildId
            });
            const balance = calculateInviteBalance(userRecords);

            // Get active invites
            const activeInvites = await Invite.aggregate([
                {
                    $match: {
                        user_id: targetUser.id,
                        guild_id: interaction.guildId,
                        active: { $ne: false }
                    }
                },
                {
                    $lookup: {
                        from: 'jointrackings',
                        let: {
                            inviteId: '$_id',
                            guildId: '$guild_id'
                        },
                        pipeline: [{
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$invite_id', '$$inviteId'] },
                                        { $eq: ['$guild_id', '$$guildId'] }
                                    ]
                                }
                            }
                        }],
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
                },
                {
                    $sort: {
                        created_at: 1,
                        _id: 1
                    }
                }
            ]);

            // Log the results
            const totalInvitesRemaining = balance.total;
            await interaction.client.logger.logToFile(`Invite check results for ${targetUser.tag} (${targetUser.id}): remaining invites ${totalInvitesRemaining} active invites ${activeInvites.length}`, "invite_check", {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag,
                message: `Remaining invites: ${isTargetAdmin || balance.unlimited ? 'Unlimited' : totalInvitesRemaining}, ` +
                    `Active invites: ${activeInvites.length}`
            });

            // Format response
            let response = `**Invite Balance for ${displayName}:**\n`;
            if (isTargetAdmin) {
                response += `${displayName} has unlimited invites (Administrator)\n`;
            } else if (balance.unlimited) {
                response += `${displayName} has unlimited invites\n`;
            } else if (userRecords.length > 0) {
                const inviteCount = balance.total;
                response += `${displayName} has ${inviteCount} invites remaining\n`;
            } else {
                response += `${displayName} has 0 invites remaining\n`;
            }

            if (activeInvites.length > 0) {
                response = appendNumberedLinks(
                    `${response}\n**Active Invites:**\n`,
                    activeInvites.map(invite => invite.link)
                );
            } else {
                response += `\nThey have no active invites.`;
            }

            await interaction.editReply({
                content: response
            });

        } catch (error) {
            console.error('Error checking invites:', error);
            await interaction.editReply({
                content: 'There was an error checking the user\'s invites.'
            });
        }
    }
};
