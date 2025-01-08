const { Collection } = require('discord.js');
const { Invite, JoinTracking, ServerConfig } = require('../models/schemas');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        console.log(`Member joined: ${member.user.tag}`);
        try {
            const cachedInvites = member.client.invites.get(member.guild.id);
            const newInvites = await member.guild.invites.fetch();
            
            console.log('Cached invites:', Array.from(cachedInvites?.values() || []).map(inv => ({
                code: inv.code,
                uses: inv.uses
            })));
            console.log('New invites:', Array.from(newInvites.values()).map(inv => ({
                code: inv.code,
                uses: inv.uses
            })));
            
            let usedInvite = null;
            let usedInviteCode = null;

            // For single-use invites, check which invite from our cache is missing in the new invites
            if (cachedInvites) {
                for (const [code, invite] of cachedInvites) {
                    if (!newInvites.has(code)) {
                        console.log(`Found used single-use invite: ${code}`);
                        usedInvite = invite;
                        usedInviteCode = code;
                        break;
                    }
                }
            }

            // Update cache with only bot-created invites
            const botInvites = newInvites.filter(invite => invite.inviterId === process.env.APPLICATION_ID);
            member.client.invites.set(member.guild.id, new Collection(botInvites.map(invite => [invite.code, invite])));

            if (usedInviteCode) {
                console.log(`Processing invite: ${usedInviteCode}`);
                const inviteInfo = await Invite.findOne({ 
                    invite_code: usedInviteCode,
                    guild_id: member.guild.id
                });

                if (inviteInfo) {
                    await JoinTracking.create({
                        invite_id: inviteInfo._id,
                        guild_id: member.guild.id,
                        joined_user_id: member.id
                    });

                    try {
                        const inviter = await member.guild.members.fetch(inviteInfo.user_id);
                        
                        // Get server config and check for default invite role
                        const serverConfig = await ServerConfig.findOne({ guild_id: member.guild.id });
                        if (serverConfig?.default_invite_role) {
                            try {
                                await member.roles.add(serverConfig.default_invite_role);
                                await member.client.logger.logToChannel(member.guild.id,
                                    `🎭 Default invite role assigned to ${member.user.tag}`
                                );
                            } catch (error) {
                                console.error('Error assigning default invite role:', error);
                                await member.client.logger.logToChannel(member.guild.id,
                                    `❌ Failed to assign default invite role to ${member.user.tag}: ${error.message}`
                                );
                            }
                        }

                        await member.client.logger.logToChannel(member.guild.id,
                            `👋 **New Member Joined**\n` +
                            `Member: <@${member.id}>\n` +
                            `Invited by: <@${inviter.id}>\n` +
                            `Invite Code: ${usedInviteCode}`
                        );
                    } catch (error) {
                        console.error('Error fetching inviter or sending log:', error);
                    }
                }
            }
        } catch (error) {
            console.error('Error processing member join:', error);
        }
    }
}; 