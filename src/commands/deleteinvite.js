const { SlashCommandBuilder } = require('discord.js');
const { getDatabase } = require('../database/init');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deleteinvite')
    .setDescription('Delete one of your invite links')
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('The number of the invite to delete (check /invites for numbers)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });
    const db = getDatabase();

    try {
      const inviteNumber = interaction.options.getInteger('number');

      // Get user's invites in order
      const userInvites = db.prepare(`
        SELECT 
          i.id,
          i.link,
          i.max_uses,
          COUNT(jt.id) as times_used
        FROM invites i
        LEFT JOIN join_tracking jt ON i.id = jt.invite_id
        WHERE i.user_id = ?
        GROUP BY i.id
      `).all(interaction.user.id);

      if (inviteNumber < 1 || inviteNumber > userInvites.length) {
        return await interaction.editReply({
          content: `Invalid invite number. You have ${userInvites.length} active invites.`,
          flags: ['Ephemeral']
        });
      }

      const inviteToDelete = userInvites[inviteNumber - 1];

      // Delete the invite from Discord
      const inviteCode = inviteToDelete.link.split('/').pop();
      const guildInvites = await interaction.guild.invites.fetch();
      const discordInvite = guildInvites.find(inv => inv.code === inviteCode);
      if (discordInvite) {
        await discordInvite.delete();
      }

      // Delete from database
      db.prepare('DELETE FROM invites WHERE id = ?').run(inviteToDelete.id);

      // Log the deletion
      await interaction.client.logger.logToChannel(interaction.guildId,
        `🗑️ **Invite Deleted**\n` +
        `Deleted by: ${interaction.user.tag}\n` +
        `Link: ${inviteToDelete.link}\n` +
        `Usage: ${inviteToDelete.times_used}/${inviteToDelete.max_uses}`
      );

      await interaction.editReply({
        content: `Successfully deleted invite link #${inviteNumber}.`,
        flags: ['Ephemeral']
      });

    } catch (error) {
      console.error('Error deleting invite:', error);
      await interaction.editReply({
        content: 'There was an error deleting the invite.',
        flags: ['Ephemeral']
      });
    }
  }
}; 