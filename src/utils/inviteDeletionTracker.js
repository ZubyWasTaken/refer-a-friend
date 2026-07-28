function deletionKey(guildId, inviteCode) {
    return `${guildId}:${inviteCode}`;
}

function markPlannedInviteDeletion(client, guildId, inviteCode) {
    client.plannedInviteDeletions.set(
        deletionKey(guildId, inviteCode),
        Date.now()
    );
}

function consumePlannedInviteDeletion(client, guildId, inviteCode) {
    return client.plannedInviteDeletions.delete(
        deletionKey(guildId, inviteCode)
    );
}

module.exports = {
    consumePlannedInviteDeletion,
    deletionKey,
    markPlannedInviteDeletion
};
