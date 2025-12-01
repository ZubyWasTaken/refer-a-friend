const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User, Role, Invite, ServerConfig } = require('../models/schemas');
const { initializeUser } = require('../utils/userManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check your remaining invite balance and view your active invite links'),

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

        // Get user's invite information
        const userInvites = await User.find({
            user_id: interaction.user.id,
            guild_id: interaction.guildId
        });

        // Get active invites
        const activeInvites = await Invite.find({
            user_id: member.id,
            guild_id: interaction.guildId
        });

        // Fetch current Discord invites
        const discordInvites = await interaction.guild.invites.fetch();

        // Filter out invites that no longer exist in Discord
        const validInvites = activeInvites.filter(dbInvite => 
            discordInvites.some(discordInvite => discordInvite.code === dbInvite.invite_code)
        );

        // Clean up any invalid invites from database
        const invalidInvites = activeInvites.filter(dbInvite => 
            !discordInvites.some(discordInvite => discordInvite.code === dbInvite.invite_code)
        );

        // Remove invalid invites from database
        if (invalidInvites.length > 0) {
            await Invite.deleteMany({
                invite_code: { $in: invalidInvites.map(inv => inv.invite_code) },
                guild_id: interaction.guildId
            });
        }


        // Calculate total remaining invites
        // Check if ANY role has unlimited invites first
        const hasUnlimited = userInvites.some(role => role.invites_remaining === -1);
        const totalInvites = hasUnlimited
            ? -1
            : userInvites.reduce((sum, role) => sum + role.invites_remaining, 0);

        let response = '**Your Invite Balance:**\n';
        if (totalInvites === -1) {
            response += 'You can invite unlimited people.\n\n';
        } else {
            response += `You can invite ${totalInvites} people.\n\n`;
        }

        if (validInvites.length > 0) {
            response += '**Active Invites:**\n';
            validInvites.forEach((invite, index) => {
                response += `${index + 1}. ${invite.link}\n`;
            });
            response += '\nUse `/deleteinvite <number>` to delete a specific invite.';
        } else {
            response += 'Currently you have no active invites.';
        }

        // Log command usage
        interaction.client.logger.logToFile("Invites Command usage", "command_usage", {
            guildId: interaction.guildId,
            guildName: interaction.guild.name,
            userId: interaction.user.id,
            username: interaction.user.tag,
            command: 'invites'
        });

        await interaction.editReply({
            content: response,
            flags: ['Ephemeral']
        });

    } catch (error) {
        console.error('Error in invites command:', error);

        // Log error
        interaction.client.logger.logToFile("Error in invites command", "error", {
            guildId: interaction.guildId,
            guildName: interaction.guild.name,
            userId: interaction.user.id,
            username: interaction.user.tag,
            message: error.message
        });

        await interaction.editReply({
            content: 'There was an error checking your invites.',
            flags: ['Ephemeral']
        });
    }
  }
}; 