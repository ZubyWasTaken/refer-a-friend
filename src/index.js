require("dotenv").config();
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const path = require("path");
const fs = require("fs");
const { initDatabase } = require("./database/init");
const Logger = require("./utils/logger");
const { isSetupComplete } = require("./utils/setupCheck");

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

// Fetch and cache invites when bot joins a guild or starts up
client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

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
      console.log(
        `Cached ${botInvites.size} bot invites for guild ${guild.name}`
      );
    } catch (error) {
      console.error(`Error caching invites for guild ${guild.name}:`, error);
    }
  }
});

// Update cache when invites are created
client.on("inviteCreate", (invite) => {
  // Only cache if invite was created by the bot
  if (invite.inviterId === process.env.APPLICATION_ID) {
    console.log(`New bot invite created: ${invite.code}`);
    const guildInvites = client.invites.get(invite.guild.id);
    if (guildInvites) {
      guildInvites.set(invite.code, invite);
      console.log(`Added to cache. Cache size: ${guildInvites.size}`);
    } else {
      // If no cache exists for this guild, create one
      client.invites.set(
        invite.guild.id,
        new Collection([[invite.code, invite]])
      );
      console.log(`Created new cache for guild with invite ${invite.code}`);
    }
  }
});

// Update cache when invites are deleted
client.on("inviteDelete", (invite) => {
  // Only remove from cache if it was a bot invite
  if (invite.inviterId === process.env.APPLICATION_ID) {
    const guildInvites = client.invites.get(invite.guild.id);
    if (guildInvites) {
      guildInvites.delete(invite.code);
      console.log(`Removed invite ${invite.code} from cache`);
    }
  }
});

// Attach logger to client
client.logger = new Logger(client);

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
    await interaction.reply({
      content: "There was an error executing this command!",
      flags: ["Ephemeral"],
    });
  }
});

client.login(process.env.BOT_TOKEN);
