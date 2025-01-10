const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ServerConfig } = require('../models/schemas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Initial setup for the invite manager bot')
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

    // Check if user has Administrator privileges
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.editReply({
        content: '❌ You need a role with **Administrator** privileges to run this command.\n\n' +
                'Please:\n' +
                '1. Ask a server administrator to give you a role with Administrator permissions\n' +
                '2. Or ask them to run this command instead'
      });
    }

    // Add setup check at the start
    const existingConfig = await ServerConfig.findOne({ guild_id: interaction.guildId });
    if (existingConfig) {
      return await interaction.editReply({
        content: '❌ This server is already set up!\n\n' +
                'To modify existing settings, please use:\n' +
                '`/changedefaults logschannel` - Change logs channel\n' +
                '`/changedefaults botchannel` - Change bot commands channel\n' +
                '`/changedefaults defaultrole` - Change default invite role'
      });
    }

    try {
      const guild = interaction.guild;
      const botMember = guild.members.me;
      
      // Check bot role permissions
      const requiredBotPermissions = [
          'ViewAuditLog',
          'ManageGuild',    // Manage Server
          'ManageRoles',
          'ManageChannels',
          'CreateInstantInvite',
          'ViewChannel',
          'SendMessages',
          'SendMessagesInThreads',
          'EmbedLinks',
          'ReadMessageHistory',
          'UseApplicationCommands'  // Use Slash Commands
      ];

      const missingPermissions = requiredBotPermissions.filter(perm => !botMember.permissions.has(perm));
      
      if (missingPermissions.length > 0) {
          return await interaction.editReply({
              content: '❌ The bot role is missing required permissions!\n\n' +
                      'Missing Permissions:\n' +
                      missingPermissions.map(perm => `- ${perm}`).join('\n') + '\n\n' +
                      'Please ensure the bot role has all necessary permissions:\n' +
                      '- View Audit Log\n' +
                      '- Manage Server\n' +
                      '- Manage Roles\n' +
                      '- Manage Channels\n' +
                      '- Create Invite\n' +
                      '- View Channels\n' +
                      '- Send Messages\n' +
                      '- Send Messages in Threads\n' +
                      '- Embed Links\n' +
                      '- Read Message History\n' +
                      '- Use Slash Commands'
          });
      }

      const logsChannel = interaction.options.getChannel('logs');
      const botChannel = interaction.options.getChannel('botchannel');
      const defaultRole = interaction.options.getRole('defaultrole');
      
      // Check system messages channel
      const systemChannel = guild.systemChannel;
      if (!systemChannel) {
        return await interaction.editReply({
          content: '❌ System Messages Channel is not set up! Please:\n' +
                  '1. Go to Server Settings\n' +
                  '2. Click on "Overview"\n' +
                  '3. Set a "System Messages Channel"\n' +
                  '4. Enable "Show Join Messages"'
        });
      }

      // Add channel permission checks
      const requiredPermissions = ['ViewChannel', 'SendMessages', 'EmbedLinks', 'ReadMessageHistory'];
      
      // Check logs channel permissions
      const logsPermissions = logsChannel.permissionsFor(botMember);
      if (!requiredPermissions.every(perm => logsPermissions.has(perm))) {
        return await interaction.editReply({
          content: 'There was an error during setup.\n' +
                  `Make sure the bot has access to the logs channel (${logsChannel}).`
        });
      }

      // Check bot channel permissions
      const botChannelPermissions = botChannel.permissionsFor(botMember);
      if (!requiredPermissions.every(perm => botChannelPermissions.has(perm))) {
        return await interaction.editReply({
          content: 'There was an error during setup.\n' +
                  `Make sure the bot has access to the bot commands channel (${botChannel}).`
        });
      }

      // Check system channel permissions
      const systemPermissions = systemChannel.permissionsFor(botMember);
      if (!requiredPermissions.every(perm => systemPermissions.has(perm))) {
        return await interaction.editReply({
          content: 'There was an error during setup.\n' +
                  `Make sure the bot has access to the system messages channel (${systemChannel}).`
        });
      }


      // Check if system messages are enabled
      const systemChannelFlags = guild.systemChannelFlags;
      if (systemChannelFlags.has('SuppressJoinNotifications')) {
        return await interaction.editReply({
          content: '❌ Join Messages are disabled! Please:\n' +
                  '1. Go to Server Settings\n' +
                  '2. Click on "Overview"\n' +
                  '3. Under "System Messages Channel", enable "Show Join Messages"'
        });
      }

      // Update or insert server config using MongoDB
      await ServerConfig.findOneAndUpdate(
        { guild_id: interaction.guildId },
        {
          guild_id: interaction.guildId,
          logs_channel_id: logsChannel.id,
          bot_channel_id: botChannel.id,
          system_channel_id: systemChannel.id,
          default_invite_role: defaultRole?.id || null,
          setup_completed: true
        },
        { upsert: true, new: true }
      );

      const response = [
        '🔧 **Bot Setup Complete**',
        '',
        `📝 Logs Channel: ${logsChannel}`,
        `🤖 Bot Commands Channel: ${botChannel}`,
        `📢 System Messages Channel: ${systemChannel}`,
        defaultRole ? `🎭 Default Invite Role: ${defaultRole}` : null,
        '',
        `\nUse \`/help\` anywhere in the server to see all available commands.`
      ].filter(Boolean).join('\n');

      // Log successful setup
      interaction.client.logger.logToFile("Server setup completed", "setup", {
        guildId: interaction.guildId,
        guildName: interaction.guild.name,
        userId: interaction.user.id,
        username: interaction.user.tag
      });

      await interaction.editReply({ content: response });

      // Send test messages
      await logsChannel.send('✅ Bot logging has been configured for this channel.');
      await botChannel.send('✅ Bot commands have been configured to only be executed in this channel.');

    } catch (error) {
      console.error('Error during setup:', error);
      await interaction.editReply({
        content: 'There was an error during setup. Please contact the [developer](https://imzuby.straw.page/) for assistance.\n'
      });
    }
  }
}; 