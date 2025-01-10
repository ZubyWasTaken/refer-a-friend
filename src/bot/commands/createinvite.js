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

    // After server setup check, add invite limit check
    const totalServerInvites = await Invite.countDocuments({ guild_id: interaction.guildId });

    if (totalServerInvites >= 1000) {
        return await interaction.editReply({
            content: '❌ This server has reached its maximum invite capacity (1000 invites).\n' +
                    'Please contact a server administrator to remove unused invites.',
            flags: ['Ephemeral']
        });
    }

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

      // Get all roles with invite configurations for this user
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

      // Check if user has any roles with unlimited invites
      const hasUnlimitedInvites = userRoles.some(role => role.invites_remaining === -1);
      let highestInviteRole = null;

      if (!hasUnlimitedInvites) {
        // Calculate total remaining invites across all roles
        const totalInvites = userRoles.reduce((sum, role) => sum + role.invites_remaining, 0);
        
        // Find role with highest invites (still needed for other logic)
        highestInviteRole = userRoles.reduce((highest, current) => {
          return (!highest || current.invites_remaining > highest.invites_remaining) ? current : highest;
        }, null);

        if (totalInvites <= 0) {
          return await interaction.editReply({
            content: '❌ You don\'t have any invites remaining.',
            flags: ['Ephemeral']
          });
        }

        // Get the default role for this server
        const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });

        // Create the invite
        const invite = await interaction.channel.createInvite({
          maxAge: 0,
          maxUses: 1,
          unique: true,
        });

        // Store the invite in the database with correct fields
        await Invite.create({
          invite_code: invite.code,
          guild_id: interaction.guildId,
          user_id: interaction.user.id,
          link: invite.url,
          max_uses: 1
        });

        // Log invite creation to file
        interaction.client.logger.logToFile("Invite created", "invite", {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag,
          inviteCode: invite.code
      });

        // Decrement one invite from the role with remaining invites
        for (const role of userRoles) {
          if (role.invites_remaining > 0) {
            await User.findOneAndUpdate(
              {
                _id: role._id
              },
              {
                $inc: { invites_remaining: -1 }
              }
            );
            break;  // Only decrement one invite from the first available role
          }
        }

        // Customize message based on whether default role exists and is valid
        // let roleMessage = '';
        // if (serverConfig?.default_invite_role) {
        //     const defaultRole = interaction.guild.roles.cache.get(serverConfig.default_invite_role);
        //     if (defaultRole) {
        //         roleMessage = `\nThis invite will grant the user the ${defaultRole} role.`;
        //     }
        // }

        // First send the log message
        await interaction.client.logger.logToChannel(interaction.guildId, 
            `🎟️ **New Single-Use Invite Created**\n` +
            `Created by: <@${interaction.user.id}>\n` +
            `Link: ${invite.url}`
        );

        // Then send the reply and make sure to return
        return interaction.editReply({
            content: `✅ Created invite: ${invite.url}\n\nYou have ${totalInvites - 1} invites remaining.\nUse \`/invites\` to see your active invites.`,
            flags: ['Ephemeral']
        });
      }

      const invite = await interaction.channel.createInvite({
        maxUses: requestedUses,
        maxAge: 0,
        unique: true
      });

      // Log invite creation to file
      interaction.client.logger.logToFile("Invite created", "invite", {
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        userId: interaction.user.id,
        username: interaction.user.tag,
        inviteCode: invite.code,
        message: `Single-use invite created in #${interaction.channel.name}`
    });

      await Invite.create({
        invite_code: invite.code,
        guild_id: interaction.guildId,
        user_id: interaction.user.id,
        link: invite.url,
        max_uses: requestedUses
      });

      const guildInvites = interaction.client.invites.get(interaction.guildId);
      if (guildInvites) {
        guildInvites.set(invite.code, invite);
      } else {
        interaction.client.invites.set(interaction.guildId, new Collection([[invite.code, invite]]));
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

      // Log the action
      await interaction.client.logger.logToChannel(interaction.guildId,
          `🎟️ **New Single-Use Invite Created**\n` +
          `Created by: <@${interaction.user.id}>\n` +
          `Link: ${invite.url}`
      );

      // // Get role message
      // let roleMessage = '';
      // if (serverConfig?.default_invite_role) {
      //     const defaultRole = interaction.guild.roles.cache.get(serverConfig.default_invite_role);
      //     if (defaultRole) {
      //         roleMessage = `\nThis invite will grant the user the ${defaultRole} role.`;
      //     }
      // }

      // Final reply for unlimited invites case
      return await interaction.editReply({
          content: `✅ Created invite: ${invite.url}\n\nYou have unlimited invites remaining.\n\nUse \`/invites\` to see your active invites.`,
          flags: ['Ephemeral']
      });

    } catch (error) {
      console.error('Error in createinvite:', error);
      // Log the error
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