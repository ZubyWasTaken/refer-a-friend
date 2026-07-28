const {
    EmbedBuilder,
    InteractionContextType,
    PermissionFlagsBits,
    SlashCommandBuilder
} = require('discord.js');
const { Role } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('currentconfig')
        .setDescription('Show current bot configuration for this server')
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;  // Exit if checks failed

        try {
            // Log that configuration is being checked
            interaction.client.logger.logToFile(`Server configuration checked by ${interaction.user.tag}`, "config", {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag
            });

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
                configuredRoles.sort((a, b) => {
                    if (a.max_invites === -1) return -1;
                    if (b.max_invites === -1) return 1;
                    return b.max_invites - a.max_invites;
                });

                const roleLines = [];
                for (const roleData of configuredRoles) {
                    const role = interaction.guild.roles.cache.get(roleData.role_id);
                    const inviteLimit = roleData.max_invites === -1 ? '♾️ Unlimited' : `${roleData.max_invites}`;
                    
                    if (role) {
                        roleLines.push(`${role}: ${inviteLimit} invites\n`);
                    }
                }

                if (roleLines.length > 0) {
                    embed.addFields(...buildRoleFields(roleLines));
                } else {
                    embed.addFields({
                        name: '🎭 Role Configuration',
                        value: 'Configured role IDs no longer exist in this server.'
                    });
                }
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
• \`/setrole\` - Set role invite limits
• \`/unsetrole\` - Remove role invite limits
\nUse \`/help\` to show all commands
                `.trim()
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error showing config:', error);
            
            // Log the error
            interaction.client.logger.logToFile("Failed to show configuration", "error", {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag,
                message: error.message
            });

            await interaction.editReply({
                content: '❌ There was an error fetching the server configuration.'
            });
        }
    }
};

function buildRoleFields(lines) {
    if (lines.length === 0) return [];

    const chunks = [];
    let current = '**Role Invite Limits:**\n';
    let consumed = 0;

    for (const line of lines) {
        if (chunks.length === 4 && current.length + line.length > 900) {
            break;
        }
        if (current.length + line.length > 900) {
            chunks.push(current);
            current = '';
        }
        current += line;
        consumed++;
    }
    if (current) chunks.push(current);

    const omitted = lines.length - consumed;
    if (omitted > 0) {
        const suffix = `\n…and ${omitted} more configured role${omitted === 1 ? '' : 's'}.`;
        const lastIndex = chunks.length - 1;
        chunks[lastIndex] =
            `${chunks[lastIndex].slice(0, 1024 - suffix.length)}${suffix}`;
    }

    return chunks.map((value, index) => ({
        name: index === 0
            ? '🎭 Role Configuration'
            : '🎭 Role Configuration (continued)',
        value
    }));
}

module.exports.buildRoleFields = buildRoleFields;
