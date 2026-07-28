const { User, Role } = require('../models/schemas');

async function initializeUser(userId, roleId, guildId) {
    if (!guildId) {
        throw new TypeError('guildId is required to initialize a user');
    }

    const role = await Role.findOne({
        role_id: roleId,
        guild_id: guildId
    });

    if (!role) {
        return null;
    }

    return User.updateOne(
        {
            user_id: userId,
            role_id: roleId,
            guild_id: guildId
        },
        {
            $setOnInsert: {
                user_id: userId,
                role_id: roleId,
                guild_id: guildId,
                invites_remaining: role.max_invites
            }
        },
        {
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true
        }
    );
}

module.exports = { initializeUser };
