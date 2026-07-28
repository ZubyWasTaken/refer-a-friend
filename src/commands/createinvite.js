const {
  Collection,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');
const { User, Role, Invite } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');
const {
  calculateInviteBalance,
  consumeInviteCredit,
  refundInviteCredit
} = require('../utils/inviteBalances');
const {
  consumePlannedInviteDeletion,
  markPlannedInviteDeletion
} = require('../utils/inviteDeletionTracker');
const { initializeUser } = require('../utils/userManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('createinvite')
    .setDescription('Creates a new single-use invite link')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const serverConfig = await checkRequirements(interaction, {
      requireAdministrator: false
    });
    if (!serverConfig) {
      return;
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

      if (
        !isAdmin &&
        inviteRoles.length === 0 &&
        existingEntries.length === 0
      ) {
        return await interaction.editReply({
          content: '❌ **You need a role with invite permissions to use this command**\n\n' +
                  'If you think this is a mistake, contact an administrator'
        });
      }

      await Promise.all(
        inviteRoles.map(role => (
          initializeUser(member.id, role.role_id, interaction.guildId)
        ))
      );

      const userRoles = await User.find({
        user_id: interaction.user.id,
        guild_id: interaction.guildId
      });

      if (!isAdmin && userRoles.length === 0) {
        return await interaction.editReply({
          content: '❌ You don\'t have any roles that grant invites.'
        });
      }

      const balance = calculateInviteBalance(userRoles);
      const hasUnlimitedInvites = isAdmin || balance.unlimited;
      const totalInvites = balance.total;
      if (!hasUnlimitedInvites) {
        if (totalInvites <= 0) {
          return await interaction.editReply({
            content: '❌ You don\'t have any invites remaining.'
          });
        }
      }

      // Check if bot has permission to create invites in this channel
      const botMember = interaction.guild.members.me;
      if (!botMember) {
        return await interaction.editReply({
          content: '❌ Cannot verify bot permissions. Please try again.'
        });
      }

      const botPermissions = interaction.channel.permissionsFor(botMember);
      if (!botPermissions || !botPermissions.has(PermissionFlagsBits.CreateInstantInvite)) {
        return await interaction.editReply({
          content: '❌ I don\'t have permission to create invites in this channel.\nPlease contact an administrator to grant me the "Create Invite" permission.'
        });
      }

      let decrementedRole = null;
      if (!hasUnlimitedInvites) {
        decrementedRole = await consumeInviteCredit({
          userId: interaction.user.id,
          guildId: interaction.guildId
        });
        if (!decrementedRole) {
          return await interaction.editReply({
            content: '❌ You don\'t have any invites remaining. Another request may have used your last invite.'
          });
        }
      }

      let invite;
      try {
        invite = await interaction.channel.createInvite({
          maxAge: 0,
          maxUses: 1,
          unique: true,
        });
      } catch (discordError) {
        if (decrementedRole) {
          const refunded = await refundInviteCredit({
            userId: interaction.user.id,
            guildId: interaction.guildId,
            roleId: decrementedRole.role_id
          });
          if (!refunded) {
            await interaction.client.logger.logToFile(
              'Invite creation failed and its credit could not be refunded',
              'critical',
              {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag
              }
            );
          }
        }
        throw discordError;
      }

      try {
        await Invite.create({
          invite_code: invite.code,
          guild_id: interaction.guildId,
          user_id: interaction.user.id,
          link: invite.url,
          max_uses: 1,
          debited_role_id: decrementedRole?.role_id ?? null,
          active: true
        });
      } catch (databaseError) {
        markPlannedInviteDeletion(
          interaction.client,
          interaction.guildId,
          invite.code
        );

        try {
          await invite.delete('Rolling back failed invite persistence');
        } catch (deleteError) {
          consumePlannedInviteDeletion(
            interaction.client,
            interaction.guildId,
            invite.code
          );
          await interaction.client.logger.logToFile(
            `Invite database write and Discord rollback both failed: ${deleteError.message}`,
            'critical',
            {
              guildId: interaction.guildId,
              guildName: interaction.guild.name,
              userId: interaction.user.id,
              username: interaction.user.tag,
              inviteCode: invite.code
            }
          );
          return await interaction.editReply({
            content: '⚠️ The invite was created but could not be recorded or removed. ' +
                    `Your credit remains consumed. Please contact an administrator and provide this link: ${invite.url}`
          });
        }

        if (decrementedRole) {
          try {
            const refunded = await refundInviteCredit({
              userId: interaction.user.id,
              guildId: interaction.guildId,
              roleId: decrementedRole.role_id
            });
            if (!refunded) {
              throw new Error('No finite invite balance record exists');
            }
          } catch (refundError) {
            await interaction.client.logger.logToFile(
              `Invite rollback succeeded but credit refund failed: ${refundError.message}`,
              'critical',
              {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag,
                inviteCode: invite.code
              }
            );
            return await interaction.editReply({
              content: '❌ The invite was rolled back, but its credit could not be refunded automatically. Please contact an administrator.'
            });
          }
        }

        throw databaseError;
      }

      const guildInvites = interaction.client.invites.get(interaction.guildId);
      if (guildInvites) {
        guildInvites.set(invite.code, invite);
      } else {
        interaction.client.invites.set(
          interaction.guildId,
          new Collection([[invite.code, invite]])
        );
      }

      await interaction.client.logger.logToFile("Invite created", "invite", {
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        userId: interaction.user.id,
        username: interaction.user.tag,
        inviteCode: invite.code
      });

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
        content: `✅ Created invite: ${invite.url}\n\nYou have ${inviteCountMessage}.\nUse \`/invites\` to see your active invites.`
      });

    } catch (error) {
      console.error('Error in createinvite:', error);
      await interaction.client.logger.logToFile(`Failed to create invite: ${error.message}`, "error", {
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        userId: interaction.user.id,
        username: interaction.user.tag
      });

      await interaction.editReply({
        content: 'There was an error creating the invite.'
      });
    }
  }
};
