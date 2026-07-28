const { PermissionFlagsBits } = require('discord.js');

const REQUIRED_CHANNEL_PERMISSIONS = {
    logs: [
        ['View Channel', PermissionFlagsBits.ViewChannel],
        ['Send Messages', PermissionFlagsBits.SendMessages],
        ['Embed Links', PermissionFlagsBits.EmbedLinks]
    ],
    commands: [
        ['View Channel', PermissionFlagsBits.ViewChannel],
        ['Send Messages', PermissionFlagsBits.SendMessages],
        ['Create Instant Invite', PermissionFlagsBits.CreateInstantInvite],
        ['Manage Channels', PermissionFlagsBits.ManageChannels]
    ]
};

function findMissingChannelPermissions(channel, botMember, requirements) {
    const permissions = channel.permissionsFor(botMember);
    if (!permissions) return requirements.map(([label]) => label);

    return requirements
        .filter(([, permission]) => !permissions.has(permission))
        .map(([label]) => label);
}

module.exports = {
    findMissingChannelPermissions,
    REQUIRED_CHANNEL_PERMISSIONS
};
