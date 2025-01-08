const { User, Role } = require('../models/schemas');

async function initializeUser(userId, roleId, guildId) {
    try {
        if (!guildId) {
            console.error('No guildId provided to initializeUser');
            return;
        }

        // Get the role's max_invites
        const role = await Role.findOne({ 
            role_id: roleId,
            guild_id: guildId
        });

        if (role) {
            // Check if user already has invites for this role
            const existingUser = await User.findOne({
                user_id: userId,
                role_id: roleId,
                guild_id: guildId
            });

            if (!existingUser) {
                // Create new user with role's max_invites
                await User.create({
                    user_id: userId,
                    role_id: roleId,
                    guild_id: guildId,
                    invites_remaining: role.max_invites
                });
            }
        }
    } catch (error) {
        console.error('Error initializing user:', error);
    }
}

module.exports = { initializeUser }; 