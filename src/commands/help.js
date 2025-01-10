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
                text: 'Refer-a-Friend v0.1', 
                iconURL: interaction.client.user.displayAvatarURL() 
            });

        if (isAdmin) {
            // Admin Commands Section
            embed.addFields(
                {
                    name: '🛠️ Setup Commands (Admin)',
                    value: `
\`/setup\` - Initial bot setup
• Sets logs channel for bot activity
• Sets bot channel for command usage
• Sets default role for new invites

\`/changedefaults\` - Modify server settings
• \`logschannel\` - Change where bot logs appear
• \`botchannel\` - Change where commands can be used
• \`defaultrole\` - Change/remove default invite role

\`/currentconfig\` - View server configuration
• See all configured channels
• View role invite limits
• Check current settings
                    `
                },
                {
                    name: '⚙️ Invite Management (Admin)',
                    value: `
\`/setinvites\` - Configure invite limits for roles
• Set how many invites a role can create
• Set unlimited invites for specific roles

\`/setrole\` - Set role invite limits
• Configure max invites for a role
• Set unlimited invites (-1) for a role

\`/unsetrole\` - Remove role configuration
• Remove invite limits from a role
• View configured roles list

\`/addinvites\` - Give invites to users
• Add invites to specific users
• Specify role-based invite allocation

\`/removeinvites\` - Remove invites from users
• Remove invites from specific users
• Manage invite balances

\`/checkinvites\` - Monitor invite usage
• Check any user's invite balance
• View their active invite links

\`/reset\` - Reset bot data
• Clear all bot data for the server
• **Use with caution!**
                    `
                }
            );
        }

        // Regular Commands Section (shown to everyone)
        embed.addFields({
            name: '👥 User Commands',
            value: `
\`/createinvite\` - Create a new invite
• Creates a single-use invite link
• Shows your remaining invite balance

\`/invites\` - Check your invites
• View your remaining invite balance
• See all your active invite links

\`/deleteinvite\` - Remove a specific invite
• Delete specific invite links
• This does **NOT** refund you any invite credits

\`/help\` - Show this help menu
• View all available commands
• See command descriptions
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