const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Role, ServerConfig, User } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Set the maximum number of invites for a role')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role to set invites for')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('maxinvites')
        .setDescription('Maximum number of invites (-1 for unlimited)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();

    const serverConfig = await checkRequirements(interaction);
    if (!serverConfig) return;  // Exit if checks failed  

    const role = interaction.options.getRole('role');
    const maxInvites = interaction.options.getInteger('maxinvites');

    try {
      // Update or create role in database
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
        { upsert: true }
      );

      // Get all members with this role
      const membersWithRole = await interaction.guild.members.fetch();
      const existingMembers = membersWithRole.filter(member => member.roles.cache.has(role.id));
      
      let updatedCount = 0;
      let response = `✅ Successfully set maximum invites for role ${role.name} to ${maxInvites === -1 ? 'unlimited' : maxInvites}.`;

      if (maxInvites === -1) {
        // Set unlimited invites for all members with this role
        for (const member of existingMembers.values()) {
          await User.updateMany(
            {
              user_id: member.id,
              guild_id: interaction.guildId
            },
            {
              $set: { invites_remaining: -1 }
            }
          );
          updatedCount++;
        }

        if (updatedCount > 0) {
          response += `\n\nℹ️ Set unlimited invites for ${updatedCount} member${updatedCount === 1 ? '' : 's'} with this role.`;
        }
      } else {
        // Handle normal invite amounts for existing members
        for (const member of existingMembers.values()) {
          const existingUser = await User.findOne({
            user_id: member.id,
            role_id: role.id,
            guild_id: interaction.guildId
          });

          if (!existingUser) {
            await User.create({
              user_id: member.id,
              role_id: role.id,
              guild_id: interaction.guildId,
              invites_remaining: maxInvites
            });
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          response += `\n\nℹ️ Added ${maxInvites} invites to ${updatedCount} existing member${updatedCount === 1 ? '' : 's'} with this role.`;
        }
      }

      await interaction.editReply({
        content: response
      });

    } catch (error) {
      console.error('Error setting role invites:', error);
      await interaction.editReply({
        content: 'There was an error setting the role invites.'
      });
    }
  }
}; 