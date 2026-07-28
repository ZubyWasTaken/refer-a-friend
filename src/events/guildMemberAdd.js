const { Collection } = require('discord.js');
const { Invite, JoinTracking, ServerConfig } = require('../models/schemas');
const { TIME } = require('../utils/constants');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        try {
            const cachedInvites = member.client.invites.get(member.guild.id)?.clone();
            const newInvites = await member.guild.invites.fetch();

            let usedInviteCode = null;
            let inviteInfo = null;

            // First check for missing invites (invite was used and may have been deleted)
            if (cachedInvites) {
                for (const [code] of cachedInvites) {
                    if (!newInvites.has(code)) {
                        usedInviteCode = code;

                        // Check recently deleted invites first (using invite code as key)
                        const recentlyDeletedInvite = member.client.recentlyDeletedInvites?.get(code);
                        if (
                            recentlyDeletedInvite &&
                            recentlyDeletedInvite.guildId === member.guild.id &&
                            Date.now() - recentlyDeletedInvite.timestamp < TIME.DELETED_INVITE_MATCH_WINDOW
                        ) {
                            inviteInfo = recentlyDeletedInvite;
                        } else {
                            // Fall back to database lookup
                            inviteInfo = await Invite.findOne({
                                invite_code: code,
                                guild_id: member.guild.id
                            });
                        }

                        if (inviteInfo) break;
                    }
                }
            }

            // inviteDelete may remove the single-use invite from the shared cache
            // before guildMemberAdd runs. Fall back to the newest recent deletion
            // for this guild when the snapshot comparison cannot identify it.
            if (!inviteInfo && member.client.recentlyDeletedInvites) {
                for (const [code, deletedInvite] of member.client.recentlyDeletedInvites) {
                    const isCandidate =
                        deletedInvite.guildId === member.guild.id &&
                        Date.now() - deletedInvite.timestamp < TIME.DELETED_INVITE_MATCH_WINDOW;

                    if (!isCandidate) continue;

                    if (!inviteInfo || deletedInvite.timestamp > inviteInfo.timestamp) {
                        usedInviteCode = code;
                        inviteInfo = deletedInvite;
                    }
                }
            }

            // Consume a matched deletion so it cannot be attributed twice.
            if (
                inviteInfo &&
                member.client.recentlyDeletedInvites?.get(usedInviteCode) === inviteInfo
            ) {
                member.client.recentlyDeletedInvites.delete(usedInviteCode);
            }

            // If we found an invite, process it
            if (inviteInfo) {
                // Role assignment is independent of join tracking and logging.
                // A non-critical tracking failure must not prevent access.
                try {
                    const serverConfig = await ServerConfig.findOne({ guild_id: member.guild.id });
                    if (serverConfig?.default_invite_role) {
                        const defaultRole = member.guild.roles.cache.get(serverConfig.default_invite_role);
                        if (!defaultRole?.editable) {
                            throw new Error('The configured default invite role is not assignable by the bot');
                        }

                        await member.roles.add(
                            defaultRole,
                            'Joined through a tracked referral invite'
                        );

                        // Log only after Discord confirms the role was added.
                        await member.client.logger.logToFile(
                            `Default invite role (${defaultRole.name}) assigned to ${member.user.tag}`,
                            "default_role",
                            {
                                guildId: member.guild.id,
                                guildName: member.guild.name,
                                userId: member.id,
                                username: member.user.tag,
                                roleName: defaultRole.name,
                                roleId: defaultRole.id
                            }
                        );
                    }
                } catch (error) {
                    console.error('Error assigning default invite role:', error);
                    await member.client.logger.logToChannel(
                        member.guild.id,
                        `❌ Failed to assign the configured default invite role to ${member.user.tag}. ` +
                        'Make sure the bot has Manage Roles and its highest role is above the configured role.'
                    );
                }

                try {
                    await member.client.logger.logToFile("New member joined server", "join", {
                        guildId: member.guild.id,
                        guildName: member.guild.name,
                        userId: member.id,
                        username: member.user.tag,
                        inviteCode: usedInviteCode
                    });

                    await JoinTracking.create({
                        invite_id: inviteInfo._id,
                        guild_id: member.guild.id,
                        joined_user_id: member.id
                    });

                    await member.client.logger.logToChannel(
                        member.guild.id,
                        `👋 **New Member Joined**\n` +
                        `Member: <@${member.id}>\n` +
                        `Invited by: <@${inviteInfo.user_id}>\n` +
                        `Invite Code: ${usedInviteCode}`
                    );

                    const inviter = await member.client.users.fetch(inviteInfo.user_id);
                    await member.client.logger.logToFile(
                        `New member ${member.user.tag} joined using invite ${usedInviteCode} from ${inviter.tag}`,
                        "invite_used",
                        {
                            guildId: member.guild.id,
                            guildName: member.guild.name,
                            userId: member.id,
                            username: member.user.tag,
                            inviteCode: usedInviteCode
                        }
                    );
                } catch (error) {
                    console.error('Error in join tracking:', error);
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
