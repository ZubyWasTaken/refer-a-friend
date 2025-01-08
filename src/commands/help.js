const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Shows all available commands'),
    requiresSetup: false,

    async execute(interaction) {

        // Check if server is setup
        const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
        if (!serverConfig) {
            return await interaction.editReply({
                content: '❌ Server not set up! Contact a server administrator to set up the bot.',
                flags: ['Ephemeral']
            });
        }

        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📚 Command List')
            .setTimestamp()
            .setFooter({ 
                text: 'Refer-a-Friend v0,1', 
                iconURL: interaction.client.user.displayAvatarURL() 
            });

        if (isAdmin) {
            // Admin Commands Section
            embed.addFields({
                name: '🛠️ Admin Commands',
                value: `
\`/setup\` - Initial bot setup (logs channel, bot channel, default role)
\`/changedefaults\` - Change server settings:
  • \`logschannel\` - Change logs channel
  • \`botchannel\` - Change bot commands channel
  • \`defaultrole\` - Change default invite role
\`/setinvites\` - Set invite limits for a role
\`/addinvites\` - Give invites to a user
\`/removeinvites\` - Remove invites from a user
\`/checkinvites\` - Check any user's invite balance and active invites
\`/reset\` - Reset all bot data for the server
                `
            });
        }

        // Regular Commands Section (shown to everyone)
        embed.addFields({
            name: '👥 User Commands',
            value: `
\`/createinvite\` - Create a single-use invite
\`/invites\` - Check your invite balance and active invites
\`/deleteinvite\` - Delete one of your invite links
\`/help\` - Show this help message

Made by [Zuby](https://imzuby.straw.page/)
            `
        });

        // Add description based on user type
        if (isAdmin) {
            embed.setDescription('Here are all available commands, including admin commands.');
        } else {
            embed.setDescription('Here are all commands available to you.');
        }

        await interaction.reply({ 
            embeds: [embed], 
            flags: ['Ephemeral']
        });
    }
}; 