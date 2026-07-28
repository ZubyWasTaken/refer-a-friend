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
  finalizeInviteDeletion
} = require('../utils/inviteBalances');
const { appendNumberedLinks } = require('../utils/responseBuilder');
const { initializeUser } = require('../utils/userManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check your remaining invite balance and view your active invite links')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const serverConfig = await checkRequirements(interaction, {
      requireAdministrator: false
    });
    if (!serverConfig) return;

    try {
      const member = interaction.member;
      const isAdministrator = member.permissions.has(
        PermissionFlagsBits.Administrator
      );
      const inviteRoles = await Role.find({
        role_id: { $in: Array.from(member.roles.cache.keys()) },
        guild_id: interaction.guildId
      });
      const existingEntries = await User.find({
        user_id: member.id,
        guild_id: interaction.guildId
      });

      if (
        !isAdministrator &&
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

      const userRecords = await User.find({
        user_id: interaction.user.id,
        guild_id: interaction.guildId
      });
      const balance = isAdministrator
        ? { unlimited: true, total: -1 }
        : calculateInviteBalance(userRecords);
      const activeInvites = await Invite.find(
        {
          user_id: member.id,
          guild_id: interaction.guildId,
          active: { $ne: false }
        },
        null,
        { sort: { created_at: 1, _id: 1 } }
      );
      const discordInvites = await interaction.guild.invites.fetch();
      const validInvites = activeInvites.filter(invite => (
        discordInvites.has(invite.invite_code)
      ));
      const invalidInviteCodes = activeInvites
        .filter(invite => !discordInvites.has(invite.invite_code))
        .map(invite => invite.invite_code);
      const pendingDeletions = activeInvites.filter(invite => (
        !discordInvites.has(invite.invite_code) &&
        invite.deletion_requested_at
      ));
      const pendingCodes = new Set(
        pendingDeletions.map(invite => invite.invite_code)
      );
      const staleInviteCodes = invalidInviteCodes.filter(code => (
        !pendingCodes.has(code)
      ));

      for (const invite of pendingDeletions) {
        await finalizeInviteDeletion({
          inviteId: invite._id,
          inviteCode: invite.invite_code,
          userId: interaction.user.id,
          guildId: interaction.guildId,
          isAdministrator
        });
      }

      if (staleInviteCodes.length > 0) {
        await Invite.updateMany({
          invite_code: { $in: staleInviteCodes },
          guild_id: interaction.guildId,
          user_id: interaction.user.id,
          active: { $ne: false }
        }, {
          $set: { active: false }
        }, {
          runValidators: true
        });
      }

      const botInvites = discordInvites.filter(invite => (
        invite.inviterId === interaction.client.user.id
      ));
      interaction.client.invites.set(
        interaction.guildId,
        new Collection(
          botInvites.map(invite => [invite.code, invite])
        )
      );

      let response = '**Your Invite Balance:**\n';
      response += balance.unlimited
        ? 'You can invite unlimited people.\n\n'
        : `You can invite ${balance.total} people.\n\n`;

      if (validInvites.length > 0) {
        response = appendNumberedLinks(
          `${response}**Active Invites:**\n`,
          validInvites.map(invite => invite.link),
          { maxLength: 1900 }
        );
        response += '\nUse `/deleteinvite <number>` to delete a specific invite.';
      } else {
        response += 'Currently you have no active invites.';
      }

      await interaction.client.logger.logToFile(
        'Invites command used',
        'command_usage',
        {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag,
          command: 'invites'
        }
      );

      await interaction.editReply({ content: response });
    } catch (error) {
      console.error('Error in invites command:', error);
      await interaction.client.logger.logToFile(
        `Error in invites command: ${error.message}`,
        'error',
        {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag
        }
      );

      await interaction.editReply({
        content: 'There was an error checking your invites.'
      });
    }
  }
};
