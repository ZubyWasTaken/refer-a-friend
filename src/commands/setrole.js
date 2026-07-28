const mongoose = require('mongoose');
const {
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');
const { Role, User } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Set the maximum number of invites for a role')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role to set invite limits for')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('maxinvites')
        .setDescription('Maximum number of invites this role grants (-1 for unlimited)')
        .setRequired(true)
        .setMinValue(-1)),

  async execute(interaction) {
    await interaction.deferReply();

    const serverConfig = await checkRequirements(interaction);
    if (!serverConfig) return;

    const role = interaction.options.getRole('role');
    const maxInvites = interaction.options.getInteger('maxinvites');

    if (
      !Number.isInteger(maxInvites) ||
      maxInvites < -1 ||
      maxInvites === 0
    ) {
      return await interaction.editReply({
        content: '❌ Maximum invites must be -1 for unlimited or a positive integer.'
      });
    }

    try {
      const guildMembers = await interaction.guild.members.fetch();
      const membersWithRole = guildMembers.filter(member => (
        member.roles.cache.has(role.id)
      ));
      await mongoose.connection.transaction(async session => {
        const previousConfig = await Role.findOne(
          {
            role_id: role.id,
            guild_id: interaction.guildId
          },
          null,
          { session }
        );

        await Role.findOneAndUpdate(
          {
            role_id: role.id,
            guild_id: interaction.guildId
          },
          {
            role_id: role.id,
            guild_id: interaction.guildId,
            name: role.name,
            max_invites: maxInvites
          },
          {
            session,
            upsert: true,
            returnDocument: 'after',
            runValidators: true,
            setDefaultsOnInsert: true
          }
        );

        const replacesSentinel =
          maxInvites === -1 ||
          previousConfig?.max_invites === -1;

        const operations = Array.from(
          membersWithRole.values(),
          member => ({
            updateOne: {
              filter: {
                user_id: member.id,
                role_id: role.id,
                guild_id: interaction.guildId
              },
              update: replacesSentinel
                ? {
                    $set: { invites_remaining: maxInvites },
                    $setOnInsert: {
                      user_id: member.id,
                      role_id: role.id,
                      guild_id: interaction.guildId
                    }
                  }
                : {
                    $setOnInsert: {
                      user_id: member.id,
                      role_id: role.id,
                      guild_id: interaction.guildId,
                      invites_remaining: maxInvites
                    }
                  },
              upsert: true
            }
          })
        );

        const batchSize = 500;
        for (let index = 0; index < operations.length; index += batchSize) {
          await User.bulkWrite(
            operations.slice(index, index + batchSize),
            { session, ordered: true }
          );
        }
      });

      await interaction.client.logger.logToFile(
        `Set invite allocation for ${role.name} to ${maxInvites === -1 ? 'unlimited' : maxInvites}`,
        'set_role_invites',
        {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag,
          roleName: role.name,
          maxInvites
        }
      );

      let response = `✅ Set the invite allocation for \`${role.name}\` to ` +
        `${maxInvites === -1 ? 'unlimited' : maxInvites}.`;
      if (membersWithRole.size > 0) {
        response += `\n\nℹ️ Synchronized ${membersWithRole.size} existing member` +
          `${membersWithRole.size === 1 ? '' : 's'} with this role.`;
      }

      await interaction.editReply({ content: response });
    } catch (error) {
      console.error('Error setting role invites:', error);
      await interaction.editReply({
        content: 'There was an error setting the role invites.'
      });
    }
  }
};
