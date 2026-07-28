require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const { User, Invite, Role, JoinTracking, ServerConfig } = require('../models/schemas');

// Mongoose 9: Keep query filters restricted to schema-defined fields
mongoose.set('strictQuery', true);

// Mongoose connection event handlers for monitoring
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
    if (mongoose.connection.readyState === 0) return;

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
        // Mongoose 9 with MongoDB Driver 7 connection options
        // Note: keepAlive is permanently enabled
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'invite_manager',
            autoIndex: false,
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10,
            minPoolSize: 0
        });

        console.log('✅ Connected to MongoDB');
        console.log(`   Database: ${mongoose.connection.db.databaseName}`);

        const models = [User, Invite, Role, JoinTracking, ServerConfig];
        await Promise.all(models.map(model => model.createIndexes()));

        const indexDiffs = await Promise.all(
            models.map(async model => ({
                model: model.modelName,
                diff: await model.diffIndexes()
            }))
        );
        const legacyIndexes = indexDiffs.flatMap(({ model, diff }) => (
            diff.toDrop.map(index => `${model}.${index}`)
        ));
        if (legacyIndexes.length > 0) {
            console.warn(
                '⚠️  Legacy indexes remain and should be reviewed manually:',
                legacyIndexes.join(', ')
            );
        }

        console.log('✅ Database indexes verified');
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
