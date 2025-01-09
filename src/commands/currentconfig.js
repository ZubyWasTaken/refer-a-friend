const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { ServerConfig, Role } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('currentconfig')
        .setDescription('Show current bot configuration for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;  // Exit if checks failed

        try {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('🛠️ Server Configuration')
                .setTimestamp();

            // Get channels and default role
            const logsChannel = interaction.guild.channels.cache.get(serverConfig.logs_channel_id);
            const botChannel = interaction.guild.channels.cache.get(serverConfig.bot_channel_id);
            const defaultRole = serverConfig.default_invite_role ? 
                interaction.guild.roles.cache.get(serverConfig.default_invite_role) : 
                'None set';

            // Basic Configuration Section
            embed.addFields({
                name: '📋 Basic Settings',
                value: `
📝 Logs Channel: ${logsChannel || '❌ Channel not found!'}
🤖 Bot Commands Channel: ${botChannel || '❌ Channel not found!'}
👥 Default Invite Role: ${defaultRole || '❌ None set'}
                `.trim()
            });

            // Get all configured roles for this server
            const configuredRoles = await Role.find({ guild_id: interaction.guildId });
            
            if (configuredRoles.length > 0) {
                // Sort roles by max_invites (highest first)
                configuredRoles.sort((a, b) => b.max_invites - a.max_invites);
                
                let rolesText = '**Role Invite Limits:**\n';
                for (const roleData of configuredRoles) {
                    const role = interaction.guild.roles.cache.get(roleData.role_id);
                    const inviteLimit = roleData.max_invites === -1 ? '♾️ Unlimited' : `${roleData.max_invites}`;
                    
                    if (role) {
                        rolesText += `${role}: ${inviteLimit} invites\n`;
                    }
                }

                embed.addFields({
                    name: '🎭 Role Configuration',
                    value: rolesText
                });
            } else {
                embed.addFields({
                    name: '🎭 Role Configuration',
                    value: 'No roles configured with invite limits yet.'
                });
            }

            // Help Section
            embed.addFields({
                name: '💡 Quick Help',
                value: `
Use these commands to modify settings:
• \`/changedefaults logschannel\` - Change logs channel
• \`/changedefaults botchannel\` - Change bot commands channel
• \`/changedefaults defaultrole\` - Change default invite role
• \`/setinvites\` - Modify role invite limits
\nUse \`/help\` to show all commands
                `.trim()
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing config:', error);
            await interaction.editReply({
                content: '❌ There was an error fetching the server configuration.'
            });
        }
    }
}; 