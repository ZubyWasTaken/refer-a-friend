require('dotenv').config();
const Database = require('better-sqlite3');

function initDatabase() {
  const db = new Database(process.env.DATABASE_PATH);

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS server_config (
      guild_id TEXT PRIMARY KEY,
      logs_channel_id TEXT NOT NULL,
      bot_channel_id TEXT NOT NULL,
      system_channel_id TEXT NOT NULL,
      setup_completed BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id TEXT NOT NULL,
      name TEXT NOT NULL,
      max_invites INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      invites_remaining INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      link TEXT NOT NULL,
      invite_code TEXT NOT NULL,
      max_uses INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS join_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invite_id INTEGER NOT NULL,
      joined_user_id TEXT NOT NULL,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invite_id) REFERENCES invites(id)
    );
  `);

  return db;
}

module.exports = {
  initDatabase,
  getDatabase: () => new Database(process.env.DATABASE_PATH)
}; 