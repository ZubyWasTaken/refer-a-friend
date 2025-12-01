const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ServerConfig } = require('../models/schemas');
const checkRequirements = require('../utils/checkRequirements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('changedefaults')
        .setDescription('Change default server settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('logschannel')
                .setDescription('Change where this bot\'s logs are sent')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The new logs channel')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('botchannel')
                .setDescription('Change the channel where this bot\'s commands can be used')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The new bot commands channel')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('defaultrole')
                .setDescription('Change or remove the default invite role')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The new default invite role')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option.setName('delete')
                        .setDescription('Remove the current default role?')
                        .addChoices(
                            { name: 'Yes', value: 'yes' },
                            { name: 'No', value: 'no' }
                        )
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const serverConfig = await checkRequirements(interaction);
        if (!serverConfig) return;  // Exit if checks failed

        try {
            const subcommand = interaction.options.getSubcommand();
            

            // Check for same-value settings and role hierarchy
            switch(subcommand) {
                case 'botchannel': {
                    const newChannel = interaction.options.getChannel('channel');
                    if (newChannel.id === serverConfig.bot_channel_id) {
                        return await interaction.editReply({
                            content: `❌ ${newChannel} is already set as the bot commands channel.`
                        });
                    }
                    break;
                }
                case 'logschannel': {
                    const newChannel = interaction.options.getChannel('channel');
                    if (newChannel.id === serverConfig.logs_channel_id) {
                        return await interaction.editReply({
                            content: `❌ ${newChannel} is already set as the logs channel.`
                        });
                    }
                    break;
                }
                case 'defaultrole': {
                    const deleteOption = interaction.options.getString('delete');
                    const newRole = interaction.options.getRole('role');

                    // Handle deletion request
                    if (deleteOption === 'yes') {
                        if (!serverConfig.default_invite_role) {
                            return await interaction.editReply({
                                content: '❌ There is no default invite role set to remove.'
                            });
                        }

                        await ServerConfig.findOneAndUpdate(
                            { guild_id: interaction.guildId },
                            { $unset: { default_invite_role: "" } }
                        );

                        await interaction.client.logger.logToChannel(interaction.guildId,
                            `⚙️ **Bot Settings Updated**\n` +
                            `Admin: <@${interaction.user.id}>\n` +
                            `Change: Default invite role removed`
                        );

                        // Log the default role removal
                        interaction.client.logger.logToFile(`Default invite role removed`, "settings", {
                            guildId: interaction.guildId,
                            guildName: interaction.guild.name,
                            userId: interaction.user.id,
                            username: interaction.user.tag
                        });


                        return await interaction.editReply({
                            content: '✅ Default invite role has been removed.'
                        });
                    }

                    // If not deleting, require a role
                    if (!newRole) {
                        return await interaction.editReply({
                            content: '❌ You must provide a role to set as default, or use delete=yes to remove the current default role.'
                        });
                    }

                    // Continue with existing role change logic
                    if (newRole.id === serverConfig.default_invite_role) {
                        return await interaction.editReply({
                            content: `❌ ${newRole} is already set as the default invite role.`
                        });
                    }

                    // Check if the role is higher than the bot's role
                    const botRole = interaction.guild.members.me.roles.highest;
                    if (newRole.position >= botRole.position) {
                        return await interaction.editReply({
                            content: `❌ I cannot assign the ${newRole} role as it is positioned higher than or equal to my highest role (${botRole}).`
                        });
                    }

                    await ServerConfig.findOneAndUpdate(
                        { guild_id: interaction.guildId },
                        { default_invite_role: newRole.id }
                    );

                    await interaction.client.logger.logToChannel(interaction.guildId,
                        `⚙️ **Bot Settings Updated**\n` +
                        `Admin: <@${interaction.user.id}>\n` +
                        `Change: Default invite role updated to ${newRole}`
                    );

                    await interaction.editReply({
                        content: `✅ Default invite role updated to ${newRole}`
                    });
                    break;
                }
            }

            // Only handle logschannel and botchannel here
            // defaultrole is already fully handled above
            if (subcommand !== 'defaultrole') {
                let updateData = {};
                let successMessage = '';

                switch (subcommand) {
                    case 'logschannel':
                        const logsChannel = interaction.options.getChannel('channel');
                        updateData = { logs_channel_id: logsChannel.id };
                        successMessage = `✅ Logs channel updated to ${logsChannel}`;

                        // Log the logs channel change
                        interaction.client.logger.logToFile(`Logs channel changed to ${logsChannel.name}`, "settings", {
                            guildId: interaction.guildId,
                            guildName: interaction.guild.name,
                            userId: interaction.user.id,
                            username: interaction.user.tag
                        });
                        break;

                    case 'botchannel':
                        const botChannel = interaction.options.getChannel('channel');
                        updateData = { bot_channel_id: botChannel.id };
                        successMessage = `✅ Bot commands channel updated to ${botChannel}`;

                        // Log the bot channel change
                        interaction.client.logger.logToFile(`Bot commands channel changed to ${botChannel.name}`, "settings", {
                            guildId: interaction.guildId,
                            guildName: interaction.guild.name,
                            userId: interaction.user.id,
                            username: interaction.user.tag
                        });
                        break;
                }

                // Update the server config
                await ServerConfig.findOneAndUpdate(
                    { guild_id: interaction.guildId },
                    updateData,
                    { upsert: true }
                );

                // Log the change
                await interaction.client.logger.logToChannel(interaction.guildId,
                    `⚙️ **Bot Settings Updated**\n` +
                    `Admin: <@${interaction.user.id}>\n` +
                    `Change: ${successMessage}`
                );

                await interaction.editReply({
                    content: successMessage
                });
            }

        } catch (error) {
            console.error('Error changing defaults:', error);
            await interaction.editReply({
                content: '❌ An error occurred while updating the settings.'
            });
        }
    }
}; 