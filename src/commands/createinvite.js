const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getDatabase } = require('../database/init');
const { initializeUser } = require('../utils/userManager');
const { logToChannel } = require('../utils/logger');
const { Collection } = require('discord.js');
const { invitesCache } = require('../utils/inviteCache');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createinvite')
    .setDescription('Creates a new invite link')
    .addIntegerOption(option =>
      option.setName('uses')
        .setDescription('Maximum number of uses for this invite')
        .setRequired(true)
        .addChoices(
          { name: '1 use', value: 1 },
          { name: '5 uses', value: 5 },
          { name: '10 uses', value: 10 },
          { name: '25 uses', value: 25 },
          { name: '50 uses', value: 50 },
          { name: '100 uses', value: 100 }
        )),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });
    const db = getDatabase();

    try {
      const member = interaction.member;
      const roles = member.roles.cache;
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
      const requestedUses = interaction.options.getInteger('uses');
      
      let highestInviteRole = null;

      if (!isAdmin) {
        // Get all roles that can create invites
        const inviteRoles = db.prepare('SELECT * FROM roles WHERE role_id IN (' + 
          roles.map(role => `'${role.id}'`).join(',') + 
        ')').all();

        if (inviteRoles.length === 0) {
          return await interaction.editReply('You do not have permission to create invites.');
        }

        // Get the role with the highest max_invites
        highestInviteRole = inviteRoles.reduce((prev, current) => 
          (prev.max_invites > current.max_invites) ? prev : current
        );

        // Initialize user if they don't exist
        initializeUser(member.id, highestInviteRole.role_id);

        // Check if requested uses exceeds role's max_invites
        if (requestedUses > highestInviteRole.max_invites && highestInviteRole.max_invites !== -1) {
          return await interaction.editReply(`You can only create invites with up to ${highestInviteRole.max_invites} uses.`);
        }

        // Check remaining invites
        const userInvites = db.prepare(`
          SELECT invites_remaining 
          FROM users 
          WHERE user_id = ? AND role_id = ?
        `).get(member.id, highestInviteRole.role_id);

        if (userInvites.invites_remaining <= 0 && highestInviteRole.max_invites !== -1) {
          return await interaction.editReply('You have no invites remaining.');
        }
      }

      if (isAdmin) {
        // Get or create admin role in database
        const adminRole = roles.find(role => role.permissions.has(PermissionFlagsBits.Administrator));
        
        // Ensure admin role exists in roles table
        const existingRole = db.prepare('SELECT * FROM roles WHERE role_id = ?').get(adminRole.id);
        if (!existingRole) {
            db.prepare('INSERT INTO roles (role_id, name, max_invites) VALUES (?, ?, ?)')
                .run(adminRole.id, adminRole.name, -1); // -1 for unlimited invites
        }
        
        // Initialize admin user
        initializeUser(member.id, adminRole.id);
      } else {
        // Non-admin users are already initialized on line 53
        // initializeUser(member.id, highestInviteRole.role_id);
      }

      // Create the invite
      const invite = await interaction.channel.createInvite({
        maxUses: requestedUses,
        maxAge: 0, // Never expires
        unique: true
      });

      console.log('Created invite:', {
        code: invite.code,
        maxUses: requestedUses,
        url: invite.url
      });

      // Store the invite in the database
      const result = db.prepare(`
        INSERT INTO invites (user_id, link, invite_code, max_uses) 
        VALUES (?, ?, ?, ?)
      `).run(member.id, invite.url, invite.code, requestedUses);

      console.log('Database insert result:', result);

      // Debug: Check if invite was stored with user info
      const storedInvite = db.prepare(`
        SELECT i.*, u.user_id as creator_id
        FROM invites i
        JOIN users u ON i.user_id = u.user_id
        WHERE i.invite_code = ?
      `).get(invite.code);

      console.log('Stored invite in database with user info:', storedInvite);

      // Update the invite cache manually
      const guildInvites = invitesCache.get(interaction.guildId);
      if (guildInvites) {
        guildInvites.set(invite.code, invite);
        console.log(`Added invite ${invite.code} to cache. New cache size: ${guildInvites.size}`);
      } else {
        invitesCache.set(interaction.guildId, new Collection([[invite.code, invite]]));
        console.log(`Created new cache for guild with invite ${invite.code}`);
      }

      // Decrease remaining invites if not admin and not unlimited
      if (!isAdmin && highestInviteRole && highestInviteRole.max_invites !== -1) {
        db.prepare(`
          UPDATE users 
          SET invites_remaining = invites_remaining - 1 
          WHERE user_id = ? AND role_id = ?
        `).run(member.id, highestInviteRole.role_id);
      }

      // After creating the invite, log it
      await interaction.client.logger.logToChannel(interaction.guildId, 
        `🎟️ **New Invite Created**\n` +
        `Created by: ${interaction.user.tag}\n` +
        `Max Uses: ${requestedUses}\n` +
        `Link: ${invite.url}`
      );

      await interaction.editReply({
        content: `Created invite link: ${invite.url}\nMaximum uses: ${requestedUses}`,
        flags: ['Ephemeral']
      });

    } catch (error) {
      console.error('Error in createinvite:', error);
      await interaction.editReply('There was an error creating the invite.');
    }
  }
}; 