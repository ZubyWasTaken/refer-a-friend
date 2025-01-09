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
            let inviteInfo = null;

            // Check the invite delete event log for the most recent deletion
            const recentlyDeletedInvite = member.client.recentlyDeletedInvites?.get(member.guild.id);
            if (recentlyDeletedInvite && Date.now() - recentlyDeletedInvite.timestamp < 5000) { // within 5 seconds
                console.log('Found recently deleted invite:', recentlyDeletedInvite);
                usedInviteCode = recentlyDeletedInvite.code;
                inviteInfo = recentlyDeletedInvite;
            }

            // If we didn't find a recently deleted invite, check for missing invites
            if (!usedInviteCode && cachedInvites) {
                for (const [code, invite] of cachedInvites) {
                    if (!newInvites.has(code)) {
                        console.log(`Found used single-use invite: ${code}`);
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
                console.log('Processing invite info:', inviteInfo);

                try {
                    // Create join tracking record first
                    const tracking = await JoinTracking.create({
                        invite_id: inviteInfo._id,
                        guild_id: member.guild.id,
                        joined_user_id: member.id
                    });
                    console.log('Created join tracking:', tracking);

                    // Then log the join
                    await member.client.logger.logToChannel(member.guild.id,
                        `👋 **New Member Joined**\n` +
                        `Member: <@${member.id}>\n` +
                        `Invited by: <@${inviteInfo.user_id}>\n` +
                        `Invite Code: ${usedInviteCode}`
                    );

                    // // Then log the invite usage
                    // await member.client.logger.logToChannel(member.guild.id,
                    //     `🗑️ **Invite Used**\n` +
                    //     `Invite Code: \`${usedInviteCode}\`\n` +
                    //     `Originally Created By: <@${inviteInfo.user_id}>\n` +
                    //     `Link: ${inviteInfo.link}`
                    // );

                    // Check for default role assignment
                    const serverConfig = await ServerConfig.findOne({ guild_id: member.guild.id });
                    if (serverConfig?.default_invite_role) {
                        try {
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