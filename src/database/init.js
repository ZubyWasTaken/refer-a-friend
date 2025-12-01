require('dotenv').config();
const mongoose = require('mongoose');
const { User, Invite, Role, JoinTracking, ServerConfig } = require('../models/schemas');

// Mongoose 8.0 best practices: Set strictQuery option
mongoose.set('strictQuery', true);

// MongoDB Driver 6.x: Connection event handlers for monitoring
// Only set up once to avoid multiple event listeners
let listenersSetup = false;

function setupConnectionListeners() {
    if (listenersSetup) return; // Prevent duplicate listener registration
    listenersSetup = true;

    const conn = mongoose.connection;

    // Connection successful
    conn.on('connected', () => {
        console.log('📡 Mongoose connected to MongoDB');
    });

    // Connection error
    conn.on('error', (err) => {
        console.error('❌ Mongoose connection error:', err.message);
    });

    // Connection disconnected
    conn.on('disconnected', () => {
        console.log('⚠️  Mongoose disconnected from MongoDB');
    });

    // REMOVED: SIGINT handler - now handled centrally in index.js shutdown()
    // This prevents conflicts between multiple shutdown handlers
}

// Expose closeConnection for graceful shutdown
async function closeConnection() {
    try {
        await mongoose.connection.close();
        console.log('📡 Mongoose connection closed');
    } catch (err) {
        console.error('Error closing mongoose connection:', err);
        throw err;
    }
}

async function initDatabase() {
    // Set up connection listeners (only once)
    setupConnectionListeners();
    try {
        // Mongoose 8 with MongoDB Driver 6 connection options
        // Note: keepAlive is permanently enabled in driver 6.x
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'invite_manager',
            // Recommended options for Mongoose 8 + MongoDB Driver 6
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s default
            maxPoolSize: 10, // Maintain up to 10 socket connections
            minPoolSize: 2,  // Minimum 2 connections in pool
        });

        console.log('✅ Connected to MongoDB');
        console.log(`   Database: ${mongoose.connection.db.databaseName}`);
        console.log(`   Host: ${mongoose.connection.host}`);

        // Create indexes for better query performance
        // Using Promise.allSettled to handle index creation errors gracefully
        const indexResults = await Promise.allSettled([
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

        // Check for index creation failures
        const failures = indexResults.filter(result => result.status === 'rejected');
        if (failures.length > 0) {
            console.log('⚠️  Some indexes may already exist (this is normal on subsequent runs)');
        } else {
            console.log('✅ Database indexes created successfully');
        }

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing database:', error.message);
        throw error; // Re-throw to let caller handle
    }
}

function getDatabase() {
    return mongoose.connection;
}

module.exports = { initDatabase, getDatabase, closeConnection }; 