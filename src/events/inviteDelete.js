const { Events } = require('discord.js');
const { Invite } = require('../models/schemas');
const { finalizeInviteDeletion } = require('../utils/inviteBalances');
const {
    consumePlannedInviteDeletion
} = require('../utils/inviteDeletionTracker');

module.exports = {
    name: Events.InviteDelete,
    async execute(invite) {
        const client = invite.client;
        const guildId = invite.guild.id;

        try {
            const planned = consumePlannedInviteDeletion(
                client,
                guildId,
                invite.code
            );

            const trackedInvite = await Invite.findOne({
                invite_code: invite.code,
                guild_id: guildId,
                active: { $ne: false }
            });

            if (trackedInvite) {
                if (planned && trackedInvite.deletion_requested_at) {
                    await finalizeInviteDeletion({
                        inviteId: trackedInvite._id,
                        inviteCode: trackedInvite.invite_code,
                        userId: trackedInvite.user_id,
                        guildId,
                        isAdministrator: false
                    });
                } else if (!planned) {
                    client.recentlyDeletedInvites.set(invite.code, {
                        code: invite.code,
                        timestamp: Date.now(),
                        guildId,
                        _id: trackedInvite._id,
                        user_id: trackedInvite.user_id,
                        link: trackedInvite.link
                    });

                    await Invite.updateOne({
                        invite_code: invite.code,
                        guild_id: guildId,
                        active: { $ne: false }
                    }, {
                        $set: { active: false }
                    }, {
                        runValidators: true
                    });
                }
            }

            client.invites.get(guildId)?.delete(invite.code);

            await client.logger.logToFile(
                planned
                    ? 'Planned invite deletion processed'
                    : 'Invite deletion processed',
                'invite_deleted',
                {
                    guildId,
                    guildName: invite.guild.name,
                    userId: client.user.id,
                    username: client.user.tag,
                    inviteCode: invite.code
                }
            );
        } catch (error) {
            await client.logger.logToFile(
                `Error handling invite deletion: ${error.message}`,
                'error',
                {
                    guildId,
                    guildName: invite.guild.name,
                    userId: client.user.id,
                    username: client.user.tag,
                    inviteCode: invite.code
                }
            );
        }
    }
};
