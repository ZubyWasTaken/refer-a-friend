require('dotenv').config();
const mongoose = require('mongoose');
const { User, Invite, Role, JoinTracking, ServerConfig } = require('../models/schemas');

async function initDatabase() {
    try {
        // Connect to MongoDB with explicit database name
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'invite_manager'
        });
        console.log('Connected to MongoDB');

        // Create indexes for better query performance
        await Promise.all([
            // Server Config indexes
            ServerConfig.collection.createIndex({ guild_id: 1 }, { unique: true }),

            // Roles indexes
            Role.collection.createIndex({ role_id: 1 }, { unique: true }),

            // Users indexes
            User.collection.createIndex({ user_id: 1, role_id: 1 }, { unique: true }),

            // Invites indexes
            Invite.collection.createIndex({ invite_code: 1 }, { unique: true }),
            Invite.collection.createIndex({ user_id: 1 }),

            // Join Tracking indexes
            JoinTracking.collection.createIndex({ invite_id: 1 }),
            JoinTracking.collection.createIndex({ joined_user_id: 1 })
        ]);

        console.log('Database initialized successfully');
    } catch (error) {
        if (error.code === 'IndexError') {
            console.log('Indexes already exist, continuing...');
        } else {
            console.error('Error initializing database:', error);
            process.exit(1);
        }
    }
}

function getDatabase() {
    return mongoose.connection;
}

module.exports = { initDatabase, getDatabase }; 