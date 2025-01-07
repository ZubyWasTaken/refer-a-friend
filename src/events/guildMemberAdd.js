const { Events } = require('discord.js');
const { getDatabase } = require('../database/init');
const { Collection } = require('discord.js');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        const db = getDatabase();
        
        try {
            // Get the cached invites before the member joined
            const oldInvites = member.client.invites.get(member.guild.id);
            // Fetch new invites after the member joined
            const newInvites = await member.guild.invites.fetch();
            
            // Find the invite that was used by comparing uses
            let usedInvite = null;
            let usedInviteCode = null;

            // Compare each invite in the new list with the old list
            newInvites.forEach(newInv => {
                const oldInv = oldInvites?.get(newInv.code);
                if (oldInv && newInv.uses > oldInv.uses) {
                    usedInvite = newInv;
                    usedInviteCode = newInv.code;
                }
            });

            // If we couldn't find it in the new invites (e.g., single-use invite), check the old invites
            if (!usedInvite) {
                oldInvites?.forEach(oldInv => {
                    if (!newInvites.has(oldInv.code)) {
                        usedInvite = oldInv;
                        usedInviteCode = oldInv.code;
                    }
                });
            }

            if (usedInviteCode) {
                // Update the uses in our database
                const inviteInfo = db.prepare(`
                    SELECT i.*, u.user_id as creator_id
                    FROM invites i
                    JOIN users u ON i.user_id = u.user_id
                    WHERE i.invite_code = ?
                `).get(usedInviteCode);

                if (inviteInfo) {
                    // Store join in tracking table
                    db.prepare(`
                        INSERT INTO join_tracking (invite_id, joined_user_id)
                        VALUES (?, ?)
                    `).run(inviteInfo.id, member.id);

                    // Get the current use count
                    const useCount = db.prepare(`
                        SELECT COUNT(*) as count
                        FROM join_tracking
                        WHERE invite_id = ?
                    `).get(inviteInfo.id).count;

                    // Get inviter
                    const inviter = await member.guild.members.fetch(inviteInfo.creator_id);

                    // Log the join with updated use count
                    await member.client.logger.logToChannel(member.guild.id,
                        `👋 **New Member Joined**\n` +
                        `Member: ${member.user.tag}\n` +
                        `Invited by: ${inviter.user.tag}\n` +
                        `Invite Code: ${usedInviteCode}\n` +
                        `Uses: ${useCount}/${inviteInfo.max_uses || '∞'}`
                    );
                }
            }

            // Update the cache with new invites
            member.client.invites.set(member.guild.id, 
                new Collection(newInvites.map(invite => [invite.code, invite]))
            );

        } catch (error) {
            console.error('Error tracking join:', error);
        }
    }
}; 