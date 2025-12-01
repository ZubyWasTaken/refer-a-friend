const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { ServerConfig } = require('../models/schemas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows all available commands'),
    requiresSetup: false,

    async execute(interaction) {
        await interaction.deferReply({flags: ['Ephemeral'] });

        // // Check if server is setup
        // const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
        // if (!serverConfig) {
        //     return await interaction.editReply({
        //         content: '❌ Server not set up! Contact a server administrator to set up the bot.',
        //         flags: ['Ephemeral']
        //     });
        // }

        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📚 Command List')
            .setTimestamp()
            .setFooter({ 
                text: 'Refer-a-Friend v0.1.2', 
                iconURL: interaction.client.user.displayAvatarURL() 
            });

        if (isAdmin) {
            // Admin Commands Section
            embed.addFields(
                {
                    name: '🛠️ Setup Commands (Admin)',
                    value: `
\`/setup\` - Initial bot setup
• Configure logs channel for bot activity
• Configure bot commands channel
• Optionally set default role for new members

\`/changedefaults\` - Modify server settings
• \`logschannel\` - Change logs channel
• \`botchannel\` - Change bot commands channel
• \`defaultrole\` - Set or remove default invite role

\`/currentconfig\` - View server configuration
• Display all configured channels
• Show role invite limits
• View current settings
                    `
                },
                {
                    name: '⚙️ Invite Management (Admin)',
                    value: `
\`/setrole\` - Set invite limits for roles
• Assign max invites for a specific role
• Use -1 for unlimited invites
• Automatically applies to existing members

\`/unsetrole\` - Remove role invite configuration
• Remove invite limits from a role
• Stops tracking that role's invites

\`/addinvites\` - Add invites to a user
• Give additional invites to specific users
• Must have a role with invite permissions

\`/removeinvites\` - Remove invites from a user
• Deduct invites from specific users
• Manage invite balances manually

\`/checkinvites\` - Check user's invites
• View any user's remaining invite balance
• See their active invite links
• Monitor invite usage

\`/reset\` - Reset all bot data
• Clears all bot configuration and data
• Requires server re-setup
• **⚠️ Use with extreme caution!**
                    `
                }
            );
        }

        // Regular Commands Section (shown to everyone)
        embed.addFields({
            name: '👥 User Commands',
            value: `
\`/createinvite\` - Create a new invite link
• Creates a single-use invite to the server
• Deducts from your invite balance
• Shows remaining invites after creation

\`/invites\` - View your invites
• Check your remaining invite balance
• See all your active invite links
• Track invite usage

\`/deleteinvite\` - Delete an invite link
• Remove a specific invite you created
• Refunds 1 invite credit back to your balance
• Helps manage your active invites

\`/help\` - Show this help menu
• Display all available commands
• See detailed command descriptions
            `
        });

        // Add description based on user type
        if (isAdmin) {
            embed.setDescription('All available commands, including admin commands.\n**Note:** The bot must be set up using \`/setup\` to use any commands except \`/help\`');
        } else {
            embed.setDescription('All available commands.\n**Note:** The admin must set up the bot to use any commands except \`/help\`');
        }

        embed.addFields({
            name: '\u200B',  // Zero-width space for spacing
            value: `Made by [Zuby](https://imzuby.straw.page/)`
        });

        // Log command usage
        interaction.client.logger.logToFile("Command usage", "command_usage", {
            guildId: interaction.guildId,
            guildName: interaction.guild.name,
            userId: interaction.user.id,
            username: interaction.user.tag,
            command: 'help'
        });

        await interaction.editReply({ 
            embeds: [embed], 
            flags: ['Ephemeral']
        });
    }
}; 