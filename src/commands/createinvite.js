const { SlashCommandBuilder, PermissionFlagsBits, Collection } = require('discord.js');
const { User, Role, Invite } = require('../models/schemas');
const { initializeUser } = require('../utils/userManager');
const { invitesCache } = require('../utils/inviteCache');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createinvite')
    .setDescription('Creates a new single-use invite link'),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });

    try {
      const member = interaction.member;
      const roles = member.roles.cache;
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
      const requestedUses = 1; // Force single-use invites

      if (!isAdmin) {
        // First check if they have any roles set up for invites
        const currentInviteRoles = await Role.find({
          role_id: { $in: Array.from(roles.keys()) },
          guild_id: interaction.guildId
        });

        // Check for existing database entries
        const existingEntries = await User.find({
          user_id: member.id,
          guild_id: interaction.guildId
        });

        // Case 1: No roles and no existing data
        if (currentInviteRoles.length === 0 && existingEntries.length === 0) {
          return await interaction.editReply({
            content: "❌ You don't have permission to create invites. You need a role with invite permissions.",
            flags: ['Ephemeral']
          });
        }

        // Case 2: Had permissions before (has data) but no current roles
        if (currentInviteRoles.length === 0 && existingEntries.length > 0) {
          // Clean up their old data
          await User.deleteMany({
            user_id: member.id,
            guild_id: interaction.guildId
          });

          return await interaction.editReply({
            content: "❌ Your invite permissions have been revoked. Contact an administrator if you think this is a mistake.",
            flags: ['Ephemeral']
          });
        }

        // Get the role with the highest max_invites
        const highestInviteRole = currentInviteRoles.reduce((prev, current) => 
          (prev.max_invites > current.max_invites) ? prev : current
        );

        // Initialize user if they don't exist
        await initializeUser(member.id, highestInviteRole.role_id, interaction.guildId);

        // Check remaining invites
        const userInvites = await User.findOne({
          user_id: member.id,
          role_id: highestInviteRole.role_id,
          guild_id: interaction.guildId
        });

        if (!userInvites || (userInvites.invites_remaining <= 0 && highestInviteRole.max_invites !== -1)) {
          return await interaction.editReply({
            content: 'You have no invites remaining.',
            flags: ['Ephemeral']
          });
        }
      }

      if (isAdmin) {
        const adminRole = roles.find(role => role.permissions.has(PermissionFlagsBits.Administrator));
        
        await Role.findOneAndUpdate(
          { 
            role_id: adminRole.id,
            guild_id: interaction.guildId
          },
          {
            role_id: adminRole.id,
            guild_id: interaction.guildId,
            name: adminRole.name,
            max_invites: -1
          },
          { upsert: true }
        );
        
        await initializeUser(member.id, adminRole.id, interaction.guildId);
      }

      const invite = await interaction.channel.createInvite({
        maxUses: requestedUses,
        maxAge: 0,
        unique: true
      });

      console.log('Created invite:', {
        code: invite.code,
        maxUses: requestedUses,
        url: invite.url
      });

      await Invite.create({
        user_id: member.id,
        guild_id: interaction.guildId,
        link: invite.url,
        invite_code: invite.code,
        max_uses: requestedUses
      });

      const guildInvites = interaction.client.invites.get(interaction.guildId);
      if (guildInvites) {
        guildInvites.set(invite.code, invite);
        console.log(`Added invite ${invite.code} to cache. New cache size: ${guildInvites.size}`);
      } else {
        interaction.client.invites.set(interaction.guildId, new Collection([[invite.code, invite]]));
        console.log(`Created new cache for guild with invite ${invite.code}`);
      }

      if (!isAdmin && highestInviteRole && highestInviteRole.max_invites !== -1) {
        await User.findOneAndUpdate(
          {
            user_id: member.id,
            role_id: highestInviteRole.role_id,
            guild_id: interaction.guildId
          },
          { $inc: { invites_remaining: -1 } }
        );
      }

      await interaction.client.logger.logToChannel(interaction.guildId, 
        `🎟️ **New Single-Use Invite Created**\n` +
        `Created by: ${interaction.user.tag}\n` +
        `Link: ${invite.url}`
      );

      await interaction.editReply({
        content: `Created single-use invite link: ${invite.url}`,
        flags: ['Ephemeral']
      });

    } catch (error) {
      console.error('Error in createinvite:', error);
      await interaction.editReply({
        content: 'There was an error creating the invite.',
        flags: ['Ephemeral']
      });
    }
  }
}; 