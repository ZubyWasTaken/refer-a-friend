const { Collection } = require('discord.js');
const { Invite, JoinTracking, ServerConfig } = require('../models/schemas');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        try {
            const cachedInvites = member.client.invites.get(member.guild.id);
            const newInvites = await member.guild.invites.fetch();
            
            let usedInvite = null;
            let usedInviteCode = null;
            let inviteInfo = null;

            // Check the invite delete event log for the most recent deletion
            const recentlyDeletedInvite = member.client.recentlyDeletedInvites?.get(member.guild.id);
            if (recentlyDeletedInvite && Date.now() - recentlyDeletedInvite.timestamp < 5000) { // within 5 seconds
                usedInviteCode = recentlyDeletedInvite.code;
                inviteInfo = recentlyDeletedInvite;
            }

            // If we didn't find a recently deleted invite, check for missing invites
            if (!usedInviteCode && cachedInvites) {
                for (const [code, invite] of cachedInvites) {
                    if (!newInvites.has(code)) {
                        usedInviteCode = code;
                        inviteInfo = await Invite.findOne({ 
                            invite_code: code,
                            guild_id: member.guild.id
                        });
                        if (inviteInfo) break;
                    }
                }
            }

            // If we found an invite, process it
            if (inviteInfo) {

                try {
                    // Log member join to file
                    member.client.logger.logToFile("New member joined server", "join", {
                        guildId: member.guild.id,
                        guildName: member.guild.name,
                        userId: member.id,
                        username: member.user.tag,
                        inviteCode: usedInviteCode
                    });

                    // Create join tracking record first
                    const tracking = await JoinTracking.create({
                        invite_id: inviteInfo._id,
                        guild_id: member.guild.id,
                        joined_user_id: member.id
                    });

                    // Then log the join
                    await member.client.logger.logToChannel(member.guild.id,
                        `👋 **New Member Joined**\n` +
                        `Member: <@${member.id}>\n` +
                        `Invited by: <@${inviteInfo.user_id}>\n` +
                        `Invite Code: ${usedInviteCode}`
                    );


                    // Get the inviter's user object
                    const inviter = await member.client.users.fetch(inviteInfo.user_id);

                    // Log invite usage
                    await member.client.logger.logToFile(`New member ${member.user.tag} joined using invite ${usedInviteCode} from ${inviter.tag}`, "invite_used", {
                        guildId: member.guild.id,
                        guildName: member.guild.name,
                        userId: member.id,
                        username: member.user.tag,
                        inviteCode: usedInviteCode
                    });

                    // Check for default role assignment
                    const serverConfig = await ServerConfig.findOne({ guild_id: member.guild.id });
                    if (serverConfig?.default_invite_role) {
                        try {
                            // Get the role object
                            const defaultRole = member.guild.roles.cache.get(serverConfig.default_invite_role);

                            // Log default role assignment
                            member.client.logger.logToFile(`Default invite role (${defaultRole.name}) assigned to ${member.user.tag}`, "default_role", {
                                guildId: member.guild.id,
                                guildName: member.guild.name,
                                userId: member.id,
                                username: member.user.tag,
                                roleName: defaultRole.name,
                                roleId: serverConfig.default_invite_role
                            });

                            await member.roles.add(serverConfig.default_invite_role);
                        } catch (error) {
                            console.error('Error assigning default invite role:', error);
                            await member.client.logger.logToChannel(member.guild.id,
                                `❌ Failed to assign default invite role to ${member.user.tag}: ${error.message}`
                            );
                        }
                    }

                } catch (error) {
                    console.error('Error in join tracking:', error);
                    console.error('Invite info:', inviteInfo);
                }
            }

            // Update cache with only bot-created invites
            const botInvites = newInvites.filter(invite => invite.inviterId === process.env.APPLICATION_ID);
            member.client.invites.set(member.guild.id, new Collection(botInvites.map(invite => [invite.code, invite])));

        } catch (error) {
            console.error('Error processing member join:', error);
        }
    }
}; 