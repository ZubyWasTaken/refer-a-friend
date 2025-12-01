require("dotenv").config();
const { Client, Collection, GatewayIntentBits, ActivityType } = require("discord.js");
const path = require("path");
const fs = require("fs");
const { initDatabase, closeConnection } = require("./database/init");
const Logger = require("./utils/logger");
const { isSetupComplete } = require("./utils/setupCheck");
const { Invite } = require('./models/schemas');
const { TIME } = require('./utils/constants');

// Validate required environment variables on startup
const requiredEnvVars = ['BOT_TOKEN', 'CLIENT_ID', 'APPLICATION_ID', 'MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ ERROR: Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease create a .env file with all required variables.');
  console.error('See .env.example for reference (if available).\n');
  process.exit(1);
}

console.log('✅ Environment variables validated');

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

// Initialize invite cache
client.invites = new Collection();

// Add this near the top where you initialize other client properties
client.recentlyDeletedInvites = new Collection();

// Clean up old deleted invite entries to prevent memory leak
setInterval(() => {
  const now = Date.now();

  for (const [inviteCode, invite] of client.recentlyDeletedInvites.entries()) {
    if (now - invite.timestamp > TIME.DELETED_INVITE_CACHE_MAX_AGE) {
      client.recentlyDeletedInvites.delete(inviteCode);
    }
  }
}, TIME.DELETED_INVITE_CLEANUP_INTERVAL);

// Fetch and cache invites when bot joins a guild or starts up
// Discord.js 14.x: Use 'ready' event with once: true for initialization
client.once("ready", async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`   User ID: ${c.user.id}`);
  console.log(`   Servers: ${c.guilds.cache.size}`);

  // Log the bot's presence
  client.logger.logToFile("Bot logged in", "bot_logged_in", {
    guildId: null,
    guildName: null,
    userId: c.user.id,
    username: c.user.tag
  });

  // Discord.js 14.x: Set the bot's presence with ActivityType enum
  // Note: Using number (3) still works but enum is preferred
  c.user.setPresence({
    activities: [{
      name: '/help for commands',
      type: ActivityType.Watching
    }],
    status: 'online'
  });

  // Initialize database
  await initDatabase();

  // Log the database initialization
  client.logger.logToFile("Database initialized", "database_initialized", {
    guildId: null,
    guildName: null,
    userId: client.user.id,
    username: client.user.tag
  });

  // Cache invites for all guilds
  for (const guild of client.guilds.cache.values()) {
    try {
      const guildInvites = await guild.invites.fetch();
      // Only cache invites created by the bot
      const botInvites = guildInvites.filter(
        (invite) => invite.inviterId === process.env.APPLICATION_ID
      );
      client.invites.set(
        guild.id,
        new Collection(botInvites.map((invite) => [invite.code, invite]))
      );
      

      // Log the action
      client.logger.logToFile("Invite cache initialized", "invite_cache_initialized", {
        guildId: guild.id,
        guildName: guild.name,
        userId: client.user.id,
        username: client.user.tag
      });
    } catch (error) {
      console.error(`Error caching invites for guild ${guild.name}:`, error);

      // Log the error
      client.logger.logToFile("Error caching invites", "error", {
        guildId: guild.id,
        guildName: guild.name,
        userId: client.user.id,
        username: client.user.tag,
        error: error.message
      });
    }
  }
});

// Update cache when invites are created
client.on("inviteCreate", (invite) => {
  // Only cache if invite was created by the bot
  if (invite.inviterId === process.env.APPLICATION_ID) {

    // Log the action
    client.logger.logToFile("New bot invite created", "new_bot_invite_created", {
      guildId: invite.guild.id,
      guildName: invite.guild.name,
      userId: client.user.id,
      username: client.user.tag,
      inviteCode: invite.code
    });

    const guildInvites = client.invites.get(invite.guild.id);
    if (guildInvites) {
      guildInvites.set(invite.code, invite);

      // Log the action
      client.logger.logToFile("Invite added to cache", "invite_added_to_cache", {
        guildId: invite.guild.id,
        guildName: invite.guild.name,
        userId: client.user.id,
        username: client.user.tag,
        inviteCode: invite.code
      });
    } else {
      // If no cache exists for this guild, create one
      client.invites.set(
        invite.guild.id,
        new Collection([[invite.code, invite]])
      );

      // Log the action
      client.logger.logToFile("New invite cache created", "new_invite_cache_created", {
        guildId: invite.guild.id,
        guildName: invite.guild.name,
        userId: client.user.id,
        username: client.user.tag,
        inviteCode: invite.code
      });
    }
  }
});

// Update cache and database when invites are deleted
client.on("inviteDelete", async (invite) => {
    try {

        // First find the invite in our database before deleting
        const inviteToDelete = await Invite.findOne({
            invite_code: invite.code,
            guild_id: invite.guild.id
        });

        if (inviteToDelete) {
            // Store ALL the invite info before deleting
            // Use invite CODE as key (not guild ID) to track multiple deleted invites per guild
            client.recentlyDeletedInvites.set(invite.code, {
                code: invite.code,
                timestamp: Date.now(),
                guildId: invite.guild.id,
                _id: inviteToDelete._id,
                user_id: inviteToDelete.user_id,
                link: inviteToDelete.link
            });

            // Remove from database
            await Invite.deleteOne({
                invite_code: invite.code,
                guild_id: invite.guild.id
            });

            // Log the action
            client.logger.logToFile("Invite deleted", "invite_deleted", {
                guildId: invite.guild.id,
                guildName: invite.guild.name,
                userId: client.user.id,
                username: client.user.tag,
                inviteCode: invite.code
            });
        }

        // Remove from cache if it exists
        const guildInvites = client.invites.get(invite.guild.id);
        if (guildInvites) {
            guildInvites.delete(invite.code);
        }

    } catch (error) {  
        // Log the error
        client.logger.logToFile("Error handling invite deletion", "error", {
            guildId: invite?.guild?.id,
            guildName: invite?.guild?.name,
            userId: client.user.id,
            username: client.user.tag,
            inviteCode: invite?.code,
            error: error.message
        });
    }
});

// Attach logger to client
client.logger = new Logger(client);

// Clean old logs periodically
setInterval(() => {
    client.logger.cleanOldLogs(TIME.LOG_RETENTION_DAYS);
}, TIME.LOG_CLEANUP_INTERVAL);

// Load commands and events
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// Load events
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Handle interactions (Discord.js 14.x best practices)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`⚠️  Command not found: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing command ${interaction.commandName}:`, error);

    // Log the error for debugging
    client.logger?.logToFile(`Error executing command: ${error.message}`, "error", {
      guildId: interaction.guildId,
      guildName: interaction.guild?.name,
      userId: interaction.user.id,
      username: interaction.user.tag,
      error: error.stack
    });

    // Determine appropriate error message based on error type
    let errorMessage = "There was an error executing this command!";

    if (error.name === 'MongooseError' || error.name === 'MongoError') {
      errorMessage = "Database error occurred. Please try again later.";
    } else if (error.code === 10062) { // Discord API: Unknown interaction
      console.log('Interaction token expired or already acknowledged');
      return; // Can't respond to expired interactions
    } else if (error.code === 50013) { // Discord API: Missing permissions
      errorMessage = "I don't have permission to do that!";
    }

    // Try to respond to the user
    try {
      // Check if we can still respond
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: errorMessage,
          flags: ["Ephemeral"],
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          flags: ["Ephemeral"],
        });
      }
    } catch (replyError) {
      // If we can't reply, just log it
      console.error('Failed to send error message to user:', replyError.message);
    }
  }
});

// Graceful shutdown handler (Discord.js 14.x best practice)
async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    // Destroy the Discord client first
    await client.destroy();
    console.log('✅ Discord client destroyed');

    // Close mongoose connection
    await closeConnection();
    console.log('✅ Database connection closed');

    console.log('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle various shutdown signals (best practice for production)
// Centralized here to avoid conflicts with multiple handlers
process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // Docker/PM2 stop
process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  client.logger?.logToFile(`Unhandled promise rejection: ${error.message}`, "error", {
    guildId: null,
    guildName: null,
    userId: null,
    username: null,
    error: error.stack
  });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  client.logger?.logToFile(`Uncaught exception: ${error.message}`, "error", {
    guildId: null,
    guildName: null,
    userId: null,
    username: null,
    error: error.stack
  });
  shutdown('UNCAUGHT_EXCEPTION');
});

client.login(process.env.BOT_TOKEN);

