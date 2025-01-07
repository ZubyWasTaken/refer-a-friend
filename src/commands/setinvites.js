const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getDatabase } = require('../database/init');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setinvites')
    .setDescription('Set maximum invites for a role')
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role to set invites for')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('maxinvites')
        .setDescription('Maximum number of invites')
        .setRequired(true)
        .addChoices(
          { name: '1 invite', value: 1 },
          { name: '5 invites', value: 5 },
          { name: '10 invites', value: 10 },
          { name: '25 invites', value: 25 },
          { name: '50 invites', value: 50 },
          { name: '100 invites', value: 100 },
          { name: 'Unlimited', value: -1 }
        )),

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
    const db = getDatabase();

    try {
      // Check if role already exists in database
      const existingRole = db.prepare('SELECT * FROM roles WHERE role_id = ?').get(role.id);

      if (existingRole) {
        // Update existing role
        db.prepare('UPDATE roles SET max_invites = ?, name = ? WHERE role_id = ?')
          .run(maxInvites, role.name, role.id);
      } else {
        // Insert new role
        db.prepare('INSERT INTO roles (role_id, name, max_invites) VALUES (?, ?, ?)')
          .run(role.id, role.name, maxInvites);
      }

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