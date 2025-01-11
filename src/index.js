require("dotenv").config();
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const path = require("path");
const fs = require("fs");
const { initDatabase } = require("./database/init");
const Logger = require("./utils/logger");
const { isSetupComplete } = require("./utils/setupCheck");
const { Invite } = require('./models/schemas');

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

// Fetch and cache invites when bot joins a guild or starts up
client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Log the bot's presence
  client.logger.logToFile("Bot logged in", "bot_logged_in", {
    guildId: null,
    guildName: null,
    userId: client.user.id,
    username: client.user.tag
  });

  // Set the bot's presence
  client.user.setPresence({
    activities: [{ 
      name: '/help for commands',
      type: 3 // WATCHING
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
            client.recentlyDeletedInvites.set(invite.guild.id, {
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

            // // Log the deletion
            // await client.logger.logToChannel(invite.guild.id,
            //     `🗑️ **Invite Deleted**\n` +
            //     `Invite Code: \`${invite.code}\`\n` +
            //     `Originally Created By: <@${inviteToDelete.user_id}>\n` +
            //     `Link: ${inviteToDelete.link}`
            // );

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

// Clean logs older than 30 days every 24 hours
setInterval(() => {
    client.logger.cleanOldLogs(30);
}, 24 * 60 * 60 * 1000);

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

// Handle interactions
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.editReply({
      content: "There was an error executing this command!",
      flags: ["Ephemeral"],
    });
  }
});

client.login(process.env.BOT_TOKEN);

