const { getDatabase } = require('../database/init');

function initializeUser(userId, roleId) {
    const db = getDatabase();
    
    // Check if user exists with this role
    const existingUser = db.prepare(`
        SELECT * FROM users 
        WHERE user_id = ? AND role_id = ?
    `).get(userId, roleId);

    if (!existingUser) {
        // Get role's max_invites
        const role = db.prepare(`
            SELECT max_invites 
            FROM roles 
            WHERE role_id = ?
        `).get(roleId);

        if (role) {
            // Add new user with full invites
            db.prepare(`
                INSERT INTO users (user_id, role_id, invites_remaining) 
                VALUES (?, ?, ?)
            `).run(userId, roleId, role.max_invites);
        }
    }
}

module.exports = { initializeUser }; 