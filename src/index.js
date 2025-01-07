require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { initDatabase, getDatabase } = require('./database/init');
const fs = require('fs');
const path = require('path');
const { isSetupComplete } = require('./utils/setupCheck');
const { Logger } = require('./utils/logger');
const { invitesCache } = require('./utils/inviteCache');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Initialize logger
const logger = new Logger(client);
client.logger = logger;

// Ready event - cache all guild invites
client.on('ready', async () => {
  console.log('Bot is ready!');
  // Wait a bit before fetching invites
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Fetch all invites for each guild
  client.guilds.cache.forEach(async (guild) => {
    console.log(`Fetching invites for guild: ${guild.name}`);
    try {
      const firstInvites = await guild.invites.fetch();
      console.log(`Cached ${firstInvites.size} invites for ${guild.name}`);
      invitesCache.set(guild.id, new Collection(firstInvites.map(invite => [invite.code, invite])));
    } catch (error) {
      console.error(`Error fetching invites for ${guild.name}:`, error);
    }
  });
});

// Track member joins
client.on('guildMemberAdd', async (member) => {
  console.log(`Member joined: ${member.user.tag}`);
  try {
    const db = getDatabase();
    const cachedInvites = invitesCache.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();
    
    console.log('Cached invites:', Array.from(cachedInvites?.values() || []).map(inv => ({
      code: inv.code,
      uses: inv.uses
    })));
    console.log('New invites:', Array.from(newInvites.values()).map(inv => ({
      code: inv.code,
      uses: inv.uses
    })));
    
    let usedInvite = null;
    let usedInviteCode = null;

    // First check for increased uses in existing invites
    newInvites.forEach(invite => {
      const cachedInvite = cachedInvites?.get(invite.code);
      if (cachedInvite) {
        console.log(`Comparing invite ${invite.code}: cached uses=${cachedInvite.uses}, new uses=${invite.uses}`);
        if (invite.uses > cachedInvite.uses) {
          console.log(`Found used invite: ${invite.code} (uses increased from ${cachedInvite.uses} to ${invite.uses})`);
          usedInvite = invite;
          usedInviteCode = invite.code;
        }
      }
    });

    // If no invite was found with increased uses, check for deleted invites
    if (!usedInviteCode && cachedInvites) {
      cachedInvites.forEach((cachedInv, code) => {
        if (!newInvites.has(code)) {
          console.log(`Found deleted invite: ${code}`);
          usedInvite = cachedInv;
          usedInviteCode = code;
        }
      });
    }

    // Important: Update the cache BEFORE processing the invite
    invitesCache.set(member.guild.id, new Collection(newInvites.map(invite => [invite.code, invite])));

    if (usedInviteCode) {
      console.log(`Processing invite: ${usedInviteCode}`);
      // Get invite info from our database
      const inviteInfo = db.prepare(`
        SELECT i.*, u.user_id as creator_id
        FROM invites i
        JOIN users u ON i.user_id = u.user_id
        WHERE i.invite_code = ?
      `).get(usedInviteCode);

      if (inviteInfo) {
        // Store join in tracking table
        db.prepare(`
          INSERT INTO join_tracking (invite_id, joined_user_id)
          VALUES (?, ?)
        `).run(inviteInfo.id, member.id);

        // Get the current use count
        const useCount = db.prepare(`
          SELECT COUNT(*) as count
          FROM join_tracking
          WHERE invite_id = ?
        `).get(inviteInfo.id).count;

        try {
          // Get inviter
          const inviter = await member.guild.members.fetch(inviteInfo.creator_id);

          // Log the join
          await client.logger.logToChannel(member.guild.id,
            `👋 **New Member Joined**\n` +
            `Member: ${member.user.tag}\n` +
            `Invited by: ${inviter.user.tag}\n` +
            `Invite Code: ${usedInviteCode}\n` +
            `Uses: ${useCount}/${inviteInfo.max_uses || '∞'}`
          );
        } catch (error) {
          console.error('Error fetching inviter or sending log:', error);
        }
      }
    }

  } catch (error) {
    console.error('Error tracking join:', error);
  }
});

// Update cache when invites are created
client.on('inviteCreate', (invite) => {
  console.log(`New invite created: ${invite.code}`);
  const guildInvites = invitesCache.get(invite.guild.id);
  if (guildInvites) {
    guildInvites.set(invite.code, invite);
    console.log(`Added to cache. Cache size: ${guildInvites.size}`);
  } else {
    // If no cache exists for this guild, create one
    invitesCache.set(invite.guild.id, new Collection([[invite.code, invite]]));
    console.log(`Created new cache for guild with invite ${invite.code}`);
  }
});

// Update cache when invites are deleted
client.on('inviteDelete', (invite) => {
  const guildInvites = invitesCache.get(invite.guild.id);
  if (guildInvites) {
    guildInvites.delete(invite.code);
  }
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// Handle interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    if (command.data.name !== 'setup') {
      const setupStatus = await isSetupComplete(interaction.guildId, interaction.channelId);
      if (!setupStatus.completed) {
        return await interaction.reply({ 
          content: setupStatus.message, 
          ephemeral: true 
        });
      }
    }

    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ 
      content: 'There was an error executing this command!', 
      ephemeral: true 
    });
  }
});

// Initialize database
initDatabase();

client.login(process.env.BOT_TOKEN); 