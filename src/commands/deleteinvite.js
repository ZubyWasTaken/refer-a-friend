const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Invite, User, Role, ServerConfig } = require('../models/schemas');
const { initializeUser } = require('../utils/userManager');

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
      const member = interaction.member;
      const roles = member.roles.cache;
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

      // Get all invite roles the user has (including for admins)
      const inviteRoles = await Role.find({
          role_id: { $in: Array.from(roles.keys()) },
          guild_id: interaction.guildId
      });

      // Check for existing user entries
      const existingEntries = await User.find({
          user_id: member.id,
          guild_id: interaction.guildId
      });

      // If not admin, do permission checks
      if (!isAdmin) {
          // Case 1: Never had permissions
          if (inviteRoles.length === 0 && existingEntries.length === 0) {
              return await interaction.editReply({
                  content: '❌ **You need a role with invite permissions to use this command**\n\n' +
                          'If you think this is a mistake, contact an administrator',
                  flags: ['Ephemeral']
              });
          }
      }

      let currentInviteRole = null;
    if (inviteRoles.length > 0) {
        currentInviteRole = inviteRoles.reduce((prev, current) => 
            (prev.max_invites > current.max_invites) ? prev : current
        );
    }

    // Initialize user if they don't exist
    if (currentInviteRole) {
        await initializeUser(member.id, currentInviteRole.role_id, interaction.guildId);
    }

      const inviteNumber = interaction.options.getInteger('number');

      // Get user's invites
      const userInvites = await Invite.find({
        user_id: interaction.user.id,
        guild_id: interaction.guildId
      });

      if (inviteNumber < 1 || inviteNumber > userInvites.length) {
        // Log invalid attempt
        interaction.client.logger.logToFile("Invalid invite deletion attempt", "invite_delete", {
            guildId: interaction.guildId,
            guildName: interaction.guild.name,
            userId: interaction.user.id,
            username: interaction.user.tag,
            message: `Attempted to delete invalid invite number: ${inviteNumber}. User has ${userInvites.length} invites.`
        });

        return await interaction.editReply({
          content: `Invalid invite number. You have ${userInvites.length} active invites.`
        });
      }

      const inviteToDelete = userInvites[inviteNumber - 1];

      // Log deletion attempt
      interaction.client.logger.logToFile("Invite deletion started", "invite_delete", {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag,
          inviteCode: inviteToDelete.invite_code,
          message: `Starting deletion of invite: ${inviteToDelete.link}`
      });

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
                
                // Log successful Discord invite deletion
                interaction.client.logger.logToFile("Discord invite deleted", "invite_delete", {
                    guildId: interaction.guildId,
                    guildName: interaction.guild.name,
                    userId: interaction.user.id,
                    username: interaction.user.tag,
                    inviteCode: inviteToDelete.invite_code
                });
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
            console.log(`Verified invite deletion - invite ${inviteToDelete.invite_code} no longer exists`);

            // Log successful database deletion
            interaction.client.logger.logToFile("Invite deleted from database", "invite_delete", {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag,
                inviteCode: inviteToDelete.invite_code,
                message: "Successfully removed from database"
            });
        }

      } catch (fetchError) {
        console.error('Error in delete process:', fetchError);
        // Log deletion error
        interaction.client.logger.logToFile("Failed to delete invite", "error", {
            guildId: interaction.guildId,
            guildName: interaction.guild.name,
            userId: interaction.user.id,
            username: interaction.user.tag,
            inviteCode: inviteToDelete.invite_code,
            message: fetchError.message
        });
        return await interaction.editReply({
          content: '❌ Failed to delete the invite. Please try again or contact an administrator.',
          flags: ['Ephemeral']
        });
      }

      await interaction.editReply({
        content: `✅ Deleted invite: ${inviteToDelete.link}` +
        `\n\nUse \`/invites\` to see your updated invites list and balance.`
      });

    } catch (error) {
      console.error('Error in deleteinvite:', error);
      // Log general error
      interaction.client.logger.logToFile("Error in delete invite command", "error", {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag,
          message: error.message
      });

      await interaction.editReply({
        content: '❌ There was an error deleting the invite.',
        flags: ['Ephemeral']
      });
    }
  }
}; 