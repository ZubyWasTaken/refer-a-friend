const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ServerConfig, Role } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('currentconfig')
        .setDescription('Show current bot configuration for this server (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;  // Exit if checks failed

        try {

            const logsChannel = interaction.guild.channels.cache.get(serverConfig.logs_channel_id);
            const botChannel = interaction.guild.channels.cache.get(serverConfig.bot_channel_id);
            const defaultRole = serverConfig.default_invite_role ? 
                interaction.guild.roles.cache.get(serverConfig.default_invite_role) : 
                'None set';

            // Get all configured roles for this server
            const configuredRoles = await Role.find({ guild_id: interaction.guildId });
            
            let response = `**Current Server Configuration:**\n\n` +
                         `📝 Logs Channel: ${logsChannel || 'Channel not found!'}\n` +
                         `🤖 Bot Commands Channel: ${botChannel || 'Channel not found!'}\n` +
                         `👥 Default Invite Role: ${defaultRole || 'None set'}\n\n`;

            if (configuredRoles.length > 0) {
                response += `**Current Role Configurations:**\n`;
                
                // Sort roles by max_invites (highest first)
                configuredRoles.sort((a, b) => b.max_invites - a.max_invites);
                
                for (const roleConfig of configuredRoles) {
                    const role = interaction.guild.roles.cache.get(roleConfig.role_id);
                    const inviteLimit = roleConfig.max_invites === -1 ? 'Unlimited' : roleConfig.max_invites;
                    
                    if (role) {
                        response += `${role}: ${inviteLimit} invites\n`;
                    }
                }
            } else {
                response += `**Current Role Configurations:**\nNo roles configured with invite limits yet.\n`;
            }

            response += `\n*To modify server settings, use:*\n` +
                       `\`/changedefaults logschannel\` - Change logs channel\n` +
                       `\`/changedefaults botchannel\` - Change bot commands channel\n` +
                       `\`/changedefaults defaultrole\` - Change default invite role\n` +
                       `\`/setinvites\` - Modify role invite limits`;

            await interaction.editReply({ content: response });

        } catch (error) {
            console.error('Error showing config:', error);
            await interaction.editReply({
                content: 'There was an error fetching the server configuration.'
            });
        }
    }
}; 