const {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');
const { Invite } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');
const {
  finalizeInviteDeletion
} = require('../utils/inviteBalances');
const {
  consumePlannedInviteDeletion,
  markPlannedInviteDeletion
} = require('../utils/inviteDeletionTracker');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deleteinvite')
    .setDescription('Delete one of your invite links')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('The number of the invite to delete (from /invites list)')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const serverConfig = await checkRequirements(interaction, {
      requireAdministrator: false
    });
    if (!serverConfig) return;

    try {
      const inviteNumber = interaction.options.getInteger('number');
      const guildInvites = await interaction.guild.invites.fetch();
      const storedInvites = await Invite.find(
        {
          user_id: interaction.user.id,
          guild_id: interaction.guildId,
          active: { $ne: false }
        },
        null,
        { sort: { created_at: 1, _id: 1 } }
      );
      const userInvites = storedInvites.filter(invite => (
        guildInvites.has(invite.invite_code)
      ));

      if (inviteNumber < 1 || inviteNumber > userInvites.length) {
        await interaction.client.logger.logToFile(
          'Invalid invite deletion attempt',
          'invite_delete',
          {
            guildId: interaction.guildId,
            guildName: interaction.guild.name,
            userId: interaction.user.id,
            username: interaction.user.tag,
            inviteNumber,
            activeInviteCount: userInvites.length
          }
        );

        return await interaction.editReply({
          content: `❌ Invalid invite number. You have ${userInvites.length} active invites.`
        });
      }

      const inviteToDelete = userInvites[inviteNumber - 1];
      const discordInvite = guildInvites.get(inviteToDelete.invite_code);

      if (discordInvite) {
        const deletionRequest = await Invite.updateOne({
          _id: inviteToDelete._id,
          invite_code: inviteToDelete.invite_code,
          user_id: interaction.user.id,
          guild_id: interaction.guildId,
          active: { $ne: false }
        }, {
          $set: { deletion_requested_at: new Date() }
        }, {
          runValidators: true
        });
        if (deletionRequest.matchedCount !== 1) {
          return await interaction.editReply({
            content: '❌ This invite is no longer active. Run `/invites` to refresh your list.'
          });
        }

        markPlannedInviteDeletion(
          interaction.client,
          interaction.guildId,
          inviteToDelete.invite_code
        );

        try {
          await discordInvite.delete('User requested deletion');
        } catch (error) {
          consumePlannedInviteDeletion(
            interaction.client,
            interaction.guildId,
            inviteToDelete.invite_code
          );

          await Invite.updateOne({
            _id: inviteToDelete._id,
            invite_code: inviteToDelete.invite_code,
            user_id: interaction.user.id,
            guild_id: interaction.guildId,
            active: { $ne: false }
          }, error.code === 10006 ? {
            $set: {
              active: false,
              deletion_requested_at: null
            }
          } : {
            $set: { deletion_requested_at: null }
          }, {
            runValidators: true
          });

          if (error.code === 10006) {
            return await interaction.editReply({
              content: 'ℹ️ That invite was already gone from Discord, so it was archived without refunding a credit.'
            });
          }
          throw error;
        }
      }

      const result = await finalizeInviteDeletion({
        inviteId: inviteToDelete._id,
        inviteCode: inviteToDelete.invite_code,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        isAdministrator: interaction.member.permissions.has(
          PermissionFlagsBits.Administrator
        )
      });

      interaction.client.invites
        .get(interaction.guildId)
        ?.delete(inviteToDelete.invite_code);

      await interaction.client.logger.logToFile(
        'Invite deletion completed',
        'invite_delete',
        {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag,
          inviteCode: inviteToDelete.invite_code,
          refunded: result.refunded
        }
      );

      let balanceMessage;
      if (!result.claimed) {
        balanceMessage = 'This invite had already been processed, so no additional credit was refunded.';
      } else if (result.unlimited) {
        balanceMessage = 'No refund was needed because your invite balance is unlimited.';
      } else if (result.refunded) {
        balanceMessage = 'One invite credit was refunded to your balance.';
      } else {
        balanceMessage = 'No finite invite balance was available to receive a refund.';
      }

      return await interaction.editReply({
        content: `✅ Deleted invite: ${inviteToDelete.link}\n\n` +
          `💰 ${balanceMessage}\nUse \`/invites\` to see your updated list.`
      });
    } catch (error) {
      console.error('Error in deleteinvite:', error);
      await interaction.client.logger.logToFile(
        `Error deleting invite: ${error.message}`,
        'error',
        {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag
        }
      );

      await interaction.editReply({
        content: '❌ Failed to delete the invite. No duplicate refund was applied; please try again or contact an administrator.'
      });
    }
  }
};
