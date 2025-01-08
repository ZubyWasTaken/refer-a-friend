const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { ServerConfig, Role } = require('../models/schemas');

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
    try {
      const guild = interaction.guild;
      const logsChannel = interaction.options.getChannel('logs');
      const botChannel = interaction.options.getChannel('botchannel');
      const defaultRole = interaction.options.getRole('defaultrole');
      
      // Check system messages channel
      const systemChannel = guild.systemChannel;
      if (!systemChannel) {
        return await interaction.reply({
          content: '❌ System Messages Channel is not set up! Please:\n' +
                  '1. Go to Server Settings\n' +
                  '2. Click on "Overview"\n' +
                  '3. Set a "System Messages Channel"\n' +
                  '4. Enable "Show Join Messages"'
        });
      }

      // Check if system messages are enabled
      const systemChannelFlags = guild.systemChannelFlags;
      if (systemChannelFlags.has('SuppressJoinNotifications')) {
        return await interaction.reply({
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
        '**Admin Commands:**',
        '`/setup` - Configure bot channels and settings',
        '`/setinvites` - Set maximum invites for a role',
        '`/addinvites` - Add invites to a user',
        '`/removeinvites` - Remove invites from a user',
        '`/changedefaults` - Change bot settings',
        '**User Commands:**',
        '`/createinvite` - Create a new invite link',
        '`/invites` - View your invites and their status',
        '`/deleteinvite` - Delete one of your invite links'
      ].filter(Boolean).join('\n');

      await interaction.reply({ content: response });

      // Send test messages
      await logsChannel.send('✅ Bot logging has been configured for this channel.');
      await systemChannel.send('✅ Join message tracking has been configured for this channel.');

    } catch (error) {
      console.error('Error during setup:', error);
      await interaction.reply({ 
        content: 'There was an error completing the setup process.'
      });
    }
  }
}; 