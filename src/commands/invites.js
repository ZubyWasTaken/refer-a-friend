const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('../database/init');
const { initializeUser } = require('../utils/userManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check your remaining invites and view your active invite links'),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });
    const db = getDatabase();

    try {
      const member = interaction.member;
      const roles = member.roles.cache;

      // Get all invite roles the user has
      const inviteRoles = db.prepare('SELECT * FROM roles WHERE role_id IN (' + 
        roles.map(role => `'${role.id}'`).join(',') + 
      ')').all();

      // Initialize user for each role they have
      inviteRoles.forEach(role => {
        initializeUser(member.id, role.role_id);
      });

      // Get user's remaining invites
      const userInvites = db.prepare(`
        SELECT r.name as role_name, u.invites_remaining, r.max_invites
        FROM users u
        JOIN roles r ON u.role_id = r.role_id
        WHERE u.user_id = ?
      `).all(interaction.user.id);

      // Get only active (unused) invites
      const activeInvites = db.prepare(`
        SELECT 
          i.id,
          i.link, 
          i.max_uses, 
          i.created_at,
          i.invite_code,
          COUNT(jt.id) as times_used
        FROM invites i
        LEFT JOIN join_tracking jt ON i.id = jt.invite_id
        WHERE i.user_id = ?
        GROUP BY i.id, i.link, i.max_uses, i.created_at, i.invite_code
        HAVING COUNT(jt.id) < i.max_uses OR i.max_uses = 0
      `).all(interaction.user.id);

      let response = '**Your Invite Status:**\n\n';

      if (userInvites.length > 0) {
        response += '**Remaining Invites:**\n';
        userInvites.forEach(invite => {
          const limit = invite.max_invites === -1 ? 'unlimited' : invite.invites_remaining;
          response += `${invite.role_name}: ${limit} invites remaining\n`;
        });
      }

      if (activeInvites.length > 0) {
        response += '\n**Your Invite Links:**\n';
        activeInvites.forEach((invite, index) => {
          const created = new Date(invite.created_at).toLocaleDateString();
          response += `**${index + 1}.** Link: ${invite.link}\n`;
          response += `   Status: ✅ ${invite.times_used}/${invite.max_uses || '∞'} uses\n`;
          response += `   Created: ${created}\n\n`;
        });
      }

      if (userInvites.length === 0 && activeInvites.length === 0) {
        response = 'You have no invite permissions or active invites.';
      }

      await interaction.editReply({
        content: response,
        flags: ['Ephemeral']
      });

    } catch (error) {
      console.error('Error checking invites:', error);
      await interaction.editReply('There was an error checking your invites.');
    }
  }
}; 