const { SlashCommandBuilder } = require('discord.js');
const { Invite, ServerConfig } = require('../models/schemas');

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

    // Check if server is setup
    const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
    if (!serverConfig) {
        return await interaction.editReply({
            content: '❌ This server is not set up for invite management.\n' +
                    'Please contact a server administrator for assistance.',
            flags: ['Ephemeral']
        });
    }

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

      // First verify and delete the Discord invite
      try {
        // Fetch fresh list of guild invites
        const guildInvites = await interaction.guild.invites.fetch();
        console.log('Found guild invites:', guildInvites.map(inv => inv.code).join(', '));
        
        const discordInvite = guildInvites.get(inviteToDelete.invite_code);
        
        if (discordInvite) {
          // Found the invite, try to delete it
          try {
            await discordInvite.delete('User requested deletion');
            console.log(`Successfully deleted Discord invite: ${inviteToDelete.invite_code}`);
          } catch (deleteError) {
            // If we get an Unknown Invite error, just continue with database cleanup
            if (deleteError.code === 10006) {
              console.log(`Invite ${inviteToDelete.invite_code} already deleted from Discord, cleaning up database`);
            } else {
              console.error(`Failed to delete Discord invite: ${inviteToDelete.invite_code}`, deleteError);
              return await interaction.editReply({
                content: '❌ Failed to delete the invite. Please try again or contact an administrator.',
                flags: ['Ephemeral']
              });
            }
          }
        } else {
          console.log(`Discord invite not found in guild: ${inviteToDelete.invite_code}`);
          // If invite doesn't exist in Discord, just clean up database
        }
      } catch (fetchError) {
        console.error('Error fetching guild invites:', fetchError);
        return await interaction.editReply({
          content: '❌ Failed to fetch server invites. Please try again or contact an administrator.',
          flags: ['Ephemeral']
        });
      }

      // Then delete from database
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