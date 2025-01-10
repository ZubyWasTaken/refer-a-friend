const { Events } = require('discord.js');
const { User, Role } = require('../models/schemas');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        // Only process if roles changed
        if (oldMember.roles.cache.size === newMember.roles.cache.size) return;

        try {
            // Get all configured roles for this guild
            const configuredRoles = await Role.find({ guild_id: newMember.guild.id });
            if (!configuredRoles.length) return;

            // Get added roles
            const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
            
            // Check if any of the member's roles (not just added ones) have unlimited invites
            const hasUnlimitedRole = configuredRoles.some(roleConfig => 
                newMember.roles.cache.has(roleConfig.role_id) && roleConfig.max_invites === -1
            );

            if (hasUnlimitedRole) {
                // Delete all existing records for this user in this guild
                await User.deleteMany({
                    user_id: newMember.id,
                    guild_id: newMember.guild.id
                });

                // Create a new record with unlimited invites
                await User.create({
                    user_id: newMember.id,
                    guild_id: newMember.guild.id,
                    role_id: addedRoles.first()?.id || newMember.roles.cache.first().id,
                    invites_remaining: -1
                });
                
                return; // Exit since we've set to unlimited
            }

            // If we get here, the user doesn't have any unlimited roles
            // Handle normal role changes
            for (const [roleId, role] of addedRoles) {
                const roleConfig = configuredRoles.find(r => r.role_id === roleId);
                if (!roleConfig) continue;

                // Create or update user's invite balance
                await User.findOneAndUpdate(
                    {
                        user_id: newMember.id,
                        role_id: roleId,
                        guild_id: newMember.guild.id
                    },
                    {
                        $setOnInsert: {
                            user_id: newMember.id,
                            role_id: roleId,
                            guild_id: newMember.guild.id,
                            invites_remaining: roleConfig.max_invites
                        }
                    },
                    { upsert: true }
                );
            }

            // Handle removed roles
            const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
            for (const [roleId] of removedRoles) {
                // First delete the role's invite record
                await User.deleteOne({
                    user_id: newMember.id,
                    role_id: roleId,
                    guild_id: newMember.guild.id
                });

                // Get the current configured roles the user has
                const userConfiguredRoles = configuredRoles.filter(r => 
                    newMember.roles.cache.has(r.role_id)
                );

                if (userConfiguredRoles.length > 0) {
                    const hasUnlimitedRole = userConfiguredRoles.some(r => r.max_invites === -1);
                    
                    if (hasUnlimitedRole) {
                        await User.updateMany(
                            {
                                user_id: newMember.id,
                                guild_id: newMember.guild.id
                            },
                            {
                                invites_remaining: -1
                            }
                        );
                    } else {
                        // Get existing records
                        const existingRecords = await User.find({
                            user_id: newMember.id,
                            guild_id: newMember.guild.id
                        });

                        for (const roleConfig of userConfiguredRoles) {
                            const existingRecord = existingRecords.find(r => r.role_id === roleConfig.role_id);
                            
                            if (existingRecord) {
                                // Update existing record
                                await User.findOneAndUpdate(
                                    {
                                        _id: existingRecord._id
                                    },
                                    {
                                        invites_remaining: roleConfig.max_invites
                                    }
                                );
                            } else {
                                // Create new record only if one doesn't exist
                                await User.create({
                                    user_id: newMember.id,
                                    guild_id: newMember.guild.id,
                                    role_id: roleConfig.role_id,
                                    invites_remaining: roleConfig.max_invites
                                });
                            }
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Error handling role update:', error);
        }
    },
}; 