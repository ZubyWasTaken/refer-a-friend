const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { User, Role, ServerConfig } = require('../models/schemas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addinvites')
        .setDescription('Add invites to a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to add invites to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of invites to add')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        // Check if server is setup
        const serverConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
        if (!serverConfig) {
            return await interaction.editReply({
                content: '❌ Server not set up! Please use `/setup` first.',
                flags: ['Ephemeral']
            });
        }

        // Check if command is being used in the correct channel
        if (interaction.channelId !== serverConfig.bot_channel_id) {
            const correctChannel = interaction.guild.channels.cache.get(serverConfig.bot_channel_id);
            return await interaction.editReply({
                content: `❌ This command can only be used in ${correctChannel}.\nPlease try again in the correct channel.`,
                flags: ['Ephemeral']
            });
        }

        try {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const member = await interaction.guild.members.fetch(targetUser.id);

            // Get user's highest invite role
            const userRoles = await Role.find({
                role_id: { $in: Array.from(member.roles.cache.keys()) },
                guild_id: interaction.guildId
            });

            if (userRoles.length === 0) {
                return await interaction.editReply({
                    content: `❌ ${targetUser.tag} doesn't have any roles that can create invites.`
                });
            }

            // Get the role with the highest max_invites
            const highestInviteRole = userRoles.reduce((prev, current) => 
                (prev.max_invites > current.max_invites) ? prev : current
            );

            // Find or create user record
            const userInvites = await User.findOneAndUpdate(
                {
                    user_id: targetUser.id,
                    role_id: highestInviteRole.role_id,
                    guild_id: interaction.guildId
                },
                {
                    $inc: { invites_remaining: amount }
                },
                {
                    upsert: true,
                    new: true
                }
            );

            // Log the action
            await interaction.client.logger.logToChannel(interaction.guildId,
                `🎟️ **Invites Added**\n` +
                `Admin: ${interaction.user.tag}\n` +
                `User: ${targetUser.tag}\n` +
                `Amount: +${amount}\n` +
                `New Total: ${userInvites.invites_remaining}`
            );

            await interaction.editReply({
                content: `✅ Added ${amount} invites to ${targetUser.tag}.\n` +
                        `They now have ${userInvites.invites_remaining} invites remaining.`
            });

        } catch (error) {
            console.error('Error adding invites:', error);
            await interaction.editReply({
                content: '❌ An error occurred while adding invites.'
            });
        }
    }
}; 