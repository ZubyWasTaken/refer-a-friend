const mongoose = require('mongoose');
const { Events } = require('discord.js');
const { User, Role } = require('../models/schemas');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        const oldRoleIds = new Set(oldMember.roles.cache.keys());
        const newRoleIds = new Set(newMember.roles.cache.keys());

        const rolesChanged = oldRoleIds.size !== newRoleIds.size ||
            [...oldRoleIds].some(id => !newRoleIds.has(id)) ||
            [...newRoleIds].some(id => !oldRoleIds.has(id));

        if (!rolesChanged) return;

        try {
            const configuredRoles = await Role.find({ guild_id: newMember.guild.id });
            if (!configuredRoles.length) return;

            const configsByRoleId = new Map(
                configuredRoles.map(config => [config.role_id, config])
            );
            const addedRoleIds = [...newRoleIds]
                .filter(roleId => !oldRoleIds.has(roleId));
            const removedRoleIds = [...oldRoleIds]
                .filter(roleId => !newRoleIds.has(roleId));

            await mongoose.connection.transaction(async session => {
                for (const roleId of addedRoleIds) {
                    const roleConfig = configsByRoleId.get(roleId);
                    if (!roleConfig) continue;

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
                        {
                            session,
                            upsert: true,
                            runValidators: true,
                            setDefaultsOnInsert: true
                        }
                    );
                }

                // Finite credits are earned and persist after a role is
                // removed. Unlimited access is a capability, so its sentinel
                // is removed with the role that granted it.
                for (const roleId of removedRoleIds) {
                    const roleConfig = configsByRoleId.get(roleId);
                    if (roleConfig?.max_invites !== -1) continue;

                    await User.deleteOne({
                        user_id: newMember.id,
                        role_id: roleId,
                        guild_id: newMember.guild.id
                    }, { session });
                }
            });

        } catch (error) {
            console.error('Error handling role update:', error);
        }
    },
};
