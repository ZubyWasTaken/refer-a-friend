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
        
        const discordInvite = guildInvites.get(inviteToDelete.invite_code);
        
        if (discordInvite) {
            // Found the invite, try to delete it
            try {
                // Force fetch the specific invite to ensure it's fresh
                const freshInvite = await interaction.guild.invites.fetch(inviteToDelete.invite_code);
                await freshInvite.delete('User requested deletion');
            } catch (deleteError) {
                console.error(`Error deleting invite:`, deleteError);
                if (deleteError.code === 10006) {
                    console.log(`Invite ${inviteToDelete.invite_code} not found in Discord`);
                } else {
                    return await interaction.editReply({
                        content: '❌ Failed to delete the invite. Please try again or contact an administrator.',
                        flags: ['Ephemeral']
                    });
                }
            }
        }

        // Update the cache
        const guildInvitesCache = interaction.client.invites.get(interaction.guildId);
        if (guildInvitesCache) {
            guildInvitesCache.delete(inviteToDelete.invite_code);
        }

        // Delete from database
        await Invite.findOneAndDelete({
            invite_code: inviteToDelete.invite_code,
            guild_id: interaction.guildId
        });

        // Verify deletion by trying to fetch the invite
        try {
            const verifyInvite = await interaction.guild.invites.fetch(inviteToDelete.invite_code);
            if (verifyInvite) {
                console.error(`Invite still exists after deletion attempt`);
                // One final deletion attempt
                await verifyInvite.delete('User requested deletion - final attempt');
            }
        } catch (verifyError) {
            // This error is expected if the invite is truly deleted
            console.log(`Verified invite deletion - invite no longer exists`);
        }

      } catch (fetchError) {
        console.error('Error in delete process:', fetchError);
        return await interaction.editReply({
          content: '❌ Failed to delete the invite. Please try again or contact an administrator.',
          flags: ['Ephemeral']
        });
      }

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