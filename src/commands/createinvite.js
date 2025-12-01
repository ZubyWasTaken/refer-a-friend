const { SlashCommandBuilder, PermissionFlagsBits, Collection } = require('discord.js');
const { User, Role, Invite, ServerConfig } = require('../models/schemas');
const { initializeUser } = require('../utils/userManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createinvite')
    .setDescription('Creates a new single-use invite link'),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });

    // Check if server is setup
    const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
    if (!serverConfig) {
      return await interaction.editReply({
        content: '❌ This server is not set up for invite management.\n' +
                'Please contact a server administrator for assistance.',
        flags: ['Ephemeral']
      });
    }

    try {
      const member = interaction.member;
      const roles = member.roles.cache;
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

      // Get all invite roles the user has
      const inviteRoles = await Role.find({
        role_id: { $in: Array.from(roles.keys()) },
        guild_id: interaction.guildId
      });

      // Check for existing user entries
      const existingEntries = await User.find({
        user_id: member.id,
        guild_id: interaction.guildId
      });

      // If not admin, check permissions
      if (!isAdmin) {
        if (inviteRoles.length === 0 && existingEntries.length === 0) {
          return await interaction.editReply({
            content: '❌ **You need a role with invite permissions to use this command**\n\n' +
                    'If you think this is a mistake, contact an administrator',
            flags: ['Ephemeral']
          });
        }
      }

      // Setup admin role if needed
      if (isAdmin) {
        const adminRole = roles.find(role => role.permissions.has(PermissionFlagsBits.Administrator));
        if (adminRole) {
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
      }

      // Get or initialize user's highest invite role
      let currentInviteRole = null;
      if (inviteRoles.length > 0) {
        currentInviteRole = inviteRoles.reduce((prev, current) =>
          (prev.max_invites > current.max_invites) ? prev : current
        );
        await initializeUser(member.id, currentInviteRole.role_id, interaction.guildId);
      }

      // Get all user's invite records
      const userRoles = await User.find({
        user_id: interaction.user.id,
        guild_id: interaction.guildId
      });

      if (!userRoles || userRoles.length === 0) {
        return await interaction.editReply({
          content: '❌ You don\'t have any roles that grant invites.',
          flags: ['Ephemeral']
        });
      }

      // Check if user has unlimited invites
      const hasUnlimitedInvites = userRoles.some(role => role.invites_remaining === -1);

      // Calculate total invites (if not unlimited)
      let totalInvites = 0;
      if (!hasUnlimitedInvites) {
        totalInvites = userRoles.reduce((sum, role) => sum + role.invites_remaining, 0);

        if (totalInvites <= 0) {
          return await interaction.editReply({
            content: '❌ You don\'t have any invites remaining.',
            flags: ['Ephemeral']
          });
        }
      }

      // Check if bot has permission to create invites in this channel
      const botMember = interaction.guild.members.me;
      if (!botMember) {
        return await interaction.editReply({
          content: '❌ Cannot verify bot permissions. Please try again.',
          flags: ['Ephemeral']
        });
      }

      const botPermissions = interaction.channel.permissionsFor(botMember);
      if (!botPermissions || !botPermissions.has(PermissionFlagsBits.CreateInstantInvite)) {
        return await interaction.editReply({
          content: '❌ I don\'t have permission to create invites in this channel.\nPlease contact an administrator to grant me the "Create Invite" permission.',
          flags: ['Ephemeral']
        });
      }

      // Decrement invite count BEFORE creating invite (prevents race condition issues)
      let decrementedRole = null;
      if (!hasUnlimitedInvites) {
        // Find first role with invites remaining and decrement atomically
        // This prevents race conditions by checking invites > 0 at update time
        for (const role of userRoles) {
          const updated = await User.findOneAndUpdate(
            {
              _id: role._id,
              invites_remaining: { $gt: 0 }  // Atomic check
            },
            { $inc: { invites_remaining: -1 } },
            { new: true }
          );

          if (updated) {
            decrementedRole = updated;
            break;
          }
        }

        // If no role could be decremented, another concurrent request consumed the invites
        if (!decrementedRole) {
          return await interaction.editReply({
            content: '❌ You don\'t have any invites remaining. Another request may have used your last invite.',
            flags: ['Ephemeral']
          });
        }
      }

      let invite;
      try {
        // Create the invite
        invite = await interaction.channel.createInvite({
          maxAge: 0,
          maxUses: 1,
          unique: true,
        });

        // Store the invite in the database
        await Invite.create({
          invite_code: invite.code,
          guild_id: interaction.guildId,
          user_id: interaction.user.id,
          link: invite.url,
          max_uses: 1
        });

        // Update cache
        const guildInvites = interaction.client.invites.get(interaction.guildId);
        if (guildInvites) {
          guildInvites.set(invite.code, invite);
        } else {
          interaction.client.invites.set(interaction.guildId, new Collection([[invite.code, invite]]));
        }

        // Log invite creation to file
        interaction.client.logger.logToFile("Invite created", "invite", {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag,
          inviteCode: invite.code
        });
      } catch (inviteError) {
        // If invite creation failed, refund the decremented invite
        if (decrementedRole) {
          await User.findOneAndUpdate(
            { _id: decrementedRole._id },
            { $inc: { invites_remaining: 1 } }
          );
        }
        throw inviteError; // Re-throw to be caught by outer catch block
      }

      // Log to channel
      await interaction.client.logger.logToChannel(interaction.guildId,
        `🎟️ **New Single-Use Invite Created**\n` +
        `Created by: <@${interaction.user.id}>\n` +
        `Link: ${invite.url}`
      );

      // Send appropriate response
      const inviteCountMessage = hasUnlimitedInvites
        ? 'unlimited invites remaining'
        : `${totalInvites - 1} invites remaining`;

      return await interaction.editReply({
        content: `✅ Created invite: ${invite.url}\n\nYou have ${inviteCountMessage}.\nUse \`/invites\` to see your active invites.`,
        flags: ['Ephemeral']
      });

    } catch (error) {
      console.error('Error in createinvite:', error);
      interaction.client.logger.logToFile(`Failed to create invite: ${error.message}`, "error", {
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        userId: interaction.user.id,
        username: interaction.user.tag
      });

      await interaction.editReply({
        content: 'There was an error creating the invite.',
        flags: ['Ephemeral']
      });
    }
  }
}; 