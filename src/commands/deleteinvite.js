const { SlashCommandBuilder } = require('discord.js');
const { Invite, JoinTracking } = require('../models/schemas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deleteinvite')
    .setDescription('Delete one of your invite links')
    .addIntegerOption(option =>
      option.setName('number')
        .setDescription('The number of the invite to delete (from /invites list)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ flags: ['Ephemeral'] });

    try {
      const inviteNumber = interaction.options.getInteger('number');

      // Get user's invites
      const userInvites = await Invite.aggregate([
        {
          $match: {
            user_id: interaction.user.id,
            guild_id: interaction.guildId
          }
        },
        {
          $lookup: {
            from: 'jointrackings',
            localField: '_id',
            foreignField: 'invite_id',
            as: 'uses'
          }
        },
        {
          $project: {
            link: 1,
            max_uses: 1,
            invite_code: 1,
            times_used: { $size: '$uses' }
          }
        }
      ]);

      if (inviteNumber < 1 || inviteNumber > userInvites.length) {
        return await interaction.editReply({
          content: `Invalid invite number. You have ${userInvites.length} active invites.`
        });
      }

      const inviteToDelete = userInvites[inviteNumber - 1];

      // Delete the invite from Discord
      const inviteCode = inviteToDelete.invite_code;
      const guildInvites = await interaction.guild.invites.fetch();
      const discordInvite = guildInvites.find(inv => inv.code === inviteCode);
      if (discordInvite) {
        await discordInvite.delete();
      }

      // Delete from database
      await Invite.findByIdAndDelete(inviteToDelete._id);
      await JoinTracking.deleteMany({ invite_id: inviteToDelete._id });

      await interaction.editReply(`Deleted invite: ${inviteToDelete.link}`);

    } catch (error) {
      console.error('Error in deleteinvite:', error);
      await interaction.editReply('There was an error deleting the invite.');
    }
  }
}; 