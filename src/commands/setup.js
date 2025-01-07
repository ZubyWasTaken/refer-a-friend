const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getDatabase } = require('../database/init');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Initial setup for the invite manager bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
      option.setName('logs')
        .setDescription('Channel for bot logs')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('botchannel')
        .setDescription('Channel where bot commands can be used')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)),

  async execute(interaction) {
    const db = getDatabase();
    
    try {
      const guild = interaction.guild;
      const logsChannel = interaction.options.getChannel('logs');
      const botChannel = interaction.options.getChannel('botchannel');
      
      // Check system messages channel
      const systemChannel = guild.systemChannel;
      if (!systemChannel) {
        return await interaction.reply({
          content: '❌ System Messages Channel is not set up! Please:\n' +
                  '1. Go to Server Settings\n' +
                  '2. Click on "Overview"\n' +
                  '3. Set a "System Messages Channel"\n' +
                  '4. Enable "Show Join Messages"',
          flags: ['Ephemeral']
        });
      }

      // Check if system messages are enabled
      const systemChannelFlags = guild.systemChannelFlags;
      if (systemChannelFlags.has('SuppressJoinNotifications')) {
        return await interaction.reply({
          content: '❌ Join Messages are disabled! Please:\n' +
                  '1. Go to Server Settings\n' +
                  '2. Click on "Overview"\n' +
                  '3. Under "System Messages Channel", enable "Show Join Messages"',
          flags: ['Ephemeral']
        });
      }

      // Update or insert server config
      db.prepare(`
        INSERT OR REPLACE INTO server_config 
        (guild_id, logs_channel_id, bot_channel_id, system_channel_id, setup_completed)
        VALUES (?, ?, ?, ?, TRUE)
      `).run(interaction.guildId, logsChannel.id, botChannel.id, systemChannel.id);

      const response = [
        '🔧 **Bot Setup Complete**',
        '',
        `📝 Logs Channel: ${logsChannel}`,
        `🤖 Bot Commands Channel: ${botChannel}`,
        `📢 System Messages Channel: ${systemChannel}`,
        '',
        '**Admin Commands:**',
        '`/setup` - Configure bot channels and settings',
        '`/setinvites` - Set maximum invites for a role',
        '',
        '**User Commands:**',
        '`/createinvite` - Create a new invite link',
        '`/invites` - View your invites and their status',
        '`/deleteinvite` - Delete one of your invite links'
      ].join('\n');

      await interaction.reply({ content: response });

      // Send test messages
      await logsChannel.send('✅ Bot logging has been configured for this channel.');
      await systemChannel.send('✅ Join message tracking has been configured for this channel.');

    } catch (error) {
      console.error('Error during setup:', error);
      await interaction.reply({ 
        content: 'There was an error completing the setup process.',
        ephemeral: true 
      });
    }
  }
}; 