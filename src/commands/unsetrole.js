const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { Role, ServerConfig } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unsetrole')
        .setDescription('Remove invite limits from a role')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to remove invite limits from')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;  // Exit if checks failed      

        try {
            // Get all configured roles first
            const configuredRoles = await Role.find({ guild_id: interaction.guildId });
            
            if (configuredRoles.length === 0) {
                return await interaction.editReply({
                    content: '❌ There are no roles configured with invite limits.'
                });
            }

            const selectedRole = interaction.options.getRole('role');
            const roleConfig = await Role.findOne({
                role_id: selectedRole.id,
                guild_id: interaction.guildId
            });

            if (!roleConfig) {
                // Create a list of configured roles to show the user
                const configuredRolesList = configuredRoles
                    .map(config => {
                        const role = interaction.guild.roles.cache.get(config.role_id);
                        const inviteLimit = config.max_invites === -1 ? 'Unlimited' : config.max_invites;
                        return role ? `• ${role.name} (${inviteLimit} invites)` : null;
                    })
                    .filter(Boolean)
                    .join('\n');

                return await interaction.editReply({
                    content: `❌ ${selectedRole} is not configured with any invite limits.\n\nConfigured roles:\n${configuredRolesList}`
                });
            }

            // Delete the role configuration
            await Role.findOneAndDelete({
                role_id: selectedRole.id,
                guild_id: interaction.guildId
            });

            await interaction.editReply({
                content: `✅ Successfully removed invite configuration from role ${selectedRole}.\n\n` +
                        `ℹ️ Note: This does not remove any invite balance from users. ` +
                        `Use \`/removeinvites\` to modify user invite balances.`
            });

            // Log the action
            interaction.client.logger.logToFile(`Successfully removed invite configuration from role "${selectedRole.name}"`, "unset_role_invites", {
                guildId: interaction.guildId,
                guildName: interaction.guild.name,
                userId: interaction.user.id,
                username: interaction.user.tag,
                roleName: selectedRole.name
            }); 

        } catch (error) {
            console.error('Error unsetting role:', error);
            await interaction.editReply({
                content: 'There was an error removing the role configuration.'
            });
        }
    }
}; 