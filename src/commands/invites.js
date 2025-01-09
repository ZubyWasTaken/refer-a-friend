const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User, Role, Invite, ServerConfig } = require('../models/schemas');
const { initializeUser } = require('../utils/userManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check your remaining invites and view your active invite links'),

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

        // If not admin, check for invite roles
        if (!isAdmin) {
            // Get all invite roles the user has
            const inviteRoles = await Role.find({
                role_id: { $in: Array.from(roles.keys()) },
                guild_id: interaction.guildId
            });

            // Check if user has any invite roles
            if (inviteRoles.length === 0) {
                return await interaction.editReply({
                    content: "❌ You don't have permission to use this command. You need a role that has been given invite permissions.",
                    flags: ['Ephemeral']
                });
            }

            // Initialize user for each role they have
            for (const role of inviteRoles) {
                await initializeUser(member.id, role.role_id, interaction.guildId);
            }
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
            console.log(`Cleaned up ${invalidInvites.length} invalid invites from database`);
        }

        // Debug logs
        console.log('User ID:', member.id);
        console.log('Guild ID:', interaction.guildId);
        console.log('Active invites found:', activeInvites);

        // Calculate total remaining invites
        const totalInvites = userInvites.reduce((sum, role) => 
            role.invites_remaining === -1 ? -1 : sum + role.invites_remaining, 
            0
        );

        let response = '**Your Invite Balance:**\n';
        if (totalInvites === -1) {
            response += 'You have unlimited invites remaining\n\n';
        } else {
            response += `You have ${totalInvites} invites remaining\n\n`;
        }

        if (validInvites.length > 0) {
            response += '**Active Invites:**\n';
            validInvites.forEach((invite, index) => {
                response += `${index + 1}. ${invite.link}\n`;
            });
            response += '\nUse `/deleteinvite <number>` to delete a specific invite.';
        } else {
            response += 'You have no active invites.';
        }

        await interaction.editReply({
            content: response,
            flags: ['Ephemeral']
        });

    } catch (error) {
        console.error('Error in invites command:', error);
        await interaction.editReply({
            content: 'There was an error checking your invites.',
            flags: ['Ephemeral']
        });
    }
  }
}; 