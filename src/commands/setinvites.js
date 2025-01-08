const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Role } = require('../models/schemas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setinvites')
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
    await interaction.deferReply({ flags: ['Ephemeral'] });
    
    // Check if user is an admin
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.editReply({
        content: 'You need Administrator permissions to use this command.',
        flags: ['Ephemeral']
      });
    }

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

      const inviteLimit = maxInvites === -1 ? 'unlimited' : maxInvites;
      await interaction.editReply({
        content: `Successfully set maximum invites for role ${role.name} to ${inviteLimit}.`,
        flags: ['Ephemeral']
      });

    } catch (error) {
      console.error('Error setting role invites:', error);
      await interaction.editReply({
        content: 'There was an error setting the role invites.',
        flags: ['Ephemeral']
      });
    }
  }
}; 