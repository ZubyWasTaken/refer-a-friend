const { SlashCommandBuilder } = require('discord.js');
const { Invite, JoinTracking } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deleteinvite')
    .setDescription('Delete one of your invite links')
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('The number of the invite to delete (from /invites list)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });

    const serverConfig = await checkRequirements(interaction);
    if (!serverConfig) return;  // Exit if checks failed

    try {
      const inviteNumber = interaction.options.getInteger('number');

      // Get user's invites
      const userInvites = await Invite.find({
        user_id: interaction.user.id,
        guild_id: interaction.guildId
      });

      if (inviteNumber < 1 || inviteNumber > userInvites.length) {
        return await interaction.editReply({
          content: `Invalid invite number. You have ${userInvites.length} active invites.`
        });
      }

      const inviteToDelete = userInvites[inviteNumber - 1];

      // Try to delete the invite from Discord
      try {
        const inviteCode = inviteToDelete.invite_code;
        const guildInvites = await interaction.guild.invites.fetch();
        const discordInvite = guildInvites.find(inv => inv.code === inviteCode);
        if (discordInvite) {
          await discordInvite.delete();
        }
      } catch (discordError) {
        console.log('Discord invite already deleted or invalid:', discordError.code);
        // Continue with database cleanup even if Discord invite is gone
      }

      // Delete from database
      await Invite.findOneAndDelete({
        invite_code: inviteToDelete.invite_code,
        guild_id: interaction.guildId
      });

      await interaction.editReply({
        content: `✅ Deleted invite: ${inviteToDelete.link}`
      });

    } catch (error) {
      console.error('Error in deleteinvite:', error);
      await interaction.editReply({
        content: '❌ There was an error deleting the invite.',
        flags: ['Ephemeral']
      });
    }
  }
}; 