const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User, Role, Invite, JoinTracking } = require('../models/schemas');
const { initializeUser } = require('../utils/userManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check your remaining invites and view your active invite links'),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });

    try {
      const member = interaction.member;
      const roles = member.roles.cache;
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

      // If not admin, check for invite roles
      if (!isAdmin) {
        // Get all invite roles the user has
        const inviteRoles = await Role.find({
          role_id: { $in: Array.from(roles.keys()) },
          guild_id: interaction.guildId
        });

        // Check if user has any invite roles
        if (inviteRoles.length === 0) {
          return await interaction.editReply({
            content: "❌ You don't have permission to invite anyone. You need a role that has been given invite permissions.",
            flags: ['Ephemeral']
          });
        }

        // Initialize user for each role they have
        for (const role of inviteRoles) {
          await initializeUser(member.id, role.role_id, interaction.guildId);
        }
      }

      // Get user's remaining invites
      const userInvites = await User.aggregate([
        {
          $match: {
            user_id: interaction.user.id,
            guild_id: interaction.guildId
          }
        },
        {
          $lookup: {
            from: 'roles',
            localField: 'role_id',
            foreignField: 'role_id',
            as: 'role'
          }
        },
        {
          $unwind: '$role'
        },
        {
          $group: {
            _id: '$user_id',
            totalInvitesRemaining: {
              $sum: '$invites_remaining'
            }
          }
        }
      ]);

      // Get active invites
      const activeInvites = await Invite.aggregate([
        {
          $match: {
            user_id: interaction.user.id,
            guild_id: interaction.guildId
          }
        },
        {
          $lookup: {
            from: 'jointrackings',
            localField: '_id',
            foreignField: 'invite_id',
            as: 'uses'
          }
        },
        {
          $project: {
            link: 1,
            max_uses: 1,
            created_at: 1,
            invite_code: 1,
            times_used: { $size: '$uses' }
          }
        },
        {
          $match: {
            $or: [
              { $expr: { $lt: ['$times_used', '$max_uses'] } },
              { max_uses: 0 }
            ]
          }
        }
      ]);

      // Format response
      let response = '**Your Invite Balance:**\n';
      if (isAdmin) {
        response += 'You have unlimited invites (Administrator)\n';
      } else if (userInvites.length > 0) {
        const inviteCount = userInvites[0].totalInvitesRemaining === -1 ? 'Unlimited' : userInvites[0].totalInvitesRemaining;
        response += `You have ${inviteCount} invites remaining\n`;
      } else {
        response += 'You have 0 invites remaining\n';
      }

      if (activeInvites.length > 0) {
        response += '\n**Your Active Invites:**\n';
        activeInvites.forEach((inv, index) => {
          const uses = inv.max_uses === 0 ? '∞' : inv.max_uses;
          response += `${index + 1}. ${inv.link} (${inv.times_used}/${uses} uses)\n`;
        });
      } else {
        response += '\nYou have no active invites.';
      }

      await interaction.editReply({ 
        content: response,
        flags: ['Ephemeral']
      });

    } catch (error) {
      console.error('Error in invites command:', error);
      await interaction.editReply({
        content: 'There was an error fetching your invites.',
        flags: ['Ephemeral']
      });
    }
  }
}; 