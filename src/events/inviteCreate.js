const { Collection, Events } = require('discord.js');

module.exports = {
    name: Events.InviteCreate,
    async execute(invite) {
        const client = invite.client;
        if (invite.inviterId !== client.user.id) return;

        const guildInvites = client.invites.get(invite.guild.id);
        if (guildInvites) {
            guildInvites.set(invite.code, invite);
        } else {
            client.invites.set(
                invite.guild.id,
                new Collection([[invite.code, invite]])
            );
        }

        await client.logger.logToFile(
            'Bot invite added to cache',
            'invite_cache',
            {
                guildId: invite.guild.id,
                guildName: invite.guild.name,
                userId: client.user.id,
                username: client.user.tag,
                inviteCode: invite.code
            }
        );
    }
};
