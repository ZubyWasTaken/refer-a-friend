const {
  ChannelType,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');
const { ServerConfig } = require('../models/schemas');
const {
  findMissingChannelPermissions,
  REQUIRED_CHANNEL_PERMISSIONS
} = require('../utils/channelPermissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Initial setup for the invite manager bot')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('logs')
        .setDescription('Channel where this bot\'s logs are sent')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('botchannel')
        .setDescription('Channel where this bot\'s commands can be used')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('defaultrole')
        .setDescription('Role to give to users who join via invite (optional)')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.editReply({
        content: '❌ You need **Administrator** permission to run this command.'
      });
    }

    try {
      const existingConfig = await ServerConfig.findOne({
        guild_id: interaction.guildId
      });
      if (existingConfig) {
        return await interaction.editReply({
          content: '❌ This server is already set up!\n\n' +
            'Use `/changedefaults` to modify the existing settings.'
        });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember) {
        return await interaction.editReply({
          content: '❌ Cannot resolve the bot member for permission checks. Please try again.'
        });
      }

      if (!botMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return await interaction.editReply({
          content: '❌ The bot needs the **Manage Server** permission to fetch and track server invites.'
        });
      }

      const logsChannel = interaction.options.getChannel('logs');
      const botChannel = interaction.options.getChannel('botchannel');
      const defaultRole = interaction.options.getRole('defaultrole');

      if (defaultRole && !defaultRole.editable) {
        return await interaction.editReply({
          content: `❌ I cannot assign ${defaultRole} as the default invite role.\n\n` +
            'Make sure the bot has **Manage Roles**, its highest role is above the selected role, and the role is not managed by an integration.'
        });
      }

      const missingLogsPermissions = findMissingChannelPermissions(
        logsChannel,
        botMember,
        REQUIRED_CHANNEL_PERMISSIONS.logs
      );
      const missingCommandPermissions = findMissingChannelPermissions(
        botChannel,
        botMember,
        REQUIRED_CHANNEL_PERMISSIONS.commands
      );

      if (missingLogsPermissions.length > 0) {
        return await interaction.editReply({
          content: `❌ Missing permissions in ${logsChannel}: ${missingLogsPermissions.join(', ')}.`
        });
      }
      if (missingCommandPermissions.length > 0) {
        return await interaction.editReply({
          content: `❌ Missing permissions in ${botChannel}: ${missingCommandPermissions.join(', ')}.`
        });
      }

      await ServerConfig.findOneAndUpdate(
        { guild_id: interaction.guildId },
        {
          guild_id: interaction.guildId,
          logs_channel_id: logsChannel.id,
          bot_channel_id: botChannel.id,
          default_invite_role: defaultRole?.id ?? null,
          setup_completed: true
        },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
          setDefaultsOnInsert: true
        }
      );

      const notificationResults = await Promise.allSettled([
        logsChannel.send('✅ Bot logging has been configured for this channel.'),
        botChannel.send('✅ Bot commands have been configured for this channel.')
      ]);
      const notificationWarning = notificationResults.some(result => (
        result.status === 'rejected'
      ))
        ? '\n\n⚠️ Configuration was saved, but one test message could not be sent.'
        : '';
      const response = [
        '🔧 **Bot Setup Complete**',
        '',
        `📝 Logs Channel: ${logsChannel}`,
        `🤖 Bot Commands Channel: ${botChannel}`,
        defaultRole ? `🎭 Default Invite Role: ${defaultRole}` : null,
        '',
        'Use `/help` anywhere in the server to see all commands.'
      ].filter(Boolean).join('\n') + notificationWarning;

      await interaction.client.logger.logToFile(
        'Server setup completed',
        'setup',
        {
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          userId: interaction.user.id,
          username: interaction.user.tag
        }
      );

      await interaction.editReply({ content: response });
    } catch (error) {
      console.error('Error during setup:', error);
      await interaction.editReply({
        content: 'There was an error during setup. Please contact the developer for assistance.'
      });
    }
  }
};
