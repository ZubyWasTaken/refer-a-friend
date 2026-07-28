const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Collection } = require('discord.js');
const mongoose = require('mongoose');
const { Invite, User } = require('../src/models/schemas');
const inviteDelete = require('../src/events/inviteDelete');

test('a command-planned deletion is finalized but not cached as a consumed invite', async (t) => {
    const guildId = 'guild-1';
    const code = 'invite-1';
    const client = {
        plannedInviteDeletions: new Collection([
            [`${guildId}:${code}`, Date.now()]
        ]),
        recentlyDeletedInvites: new Collection(),
        invites: new Collection([
            [guildId, new Collection([[code, { code }]])]
        ]),
        logger: {
            logToFile: async () => {}
        },
        user: {
            id: 'bot-1',
            tag: 'bot'
        }
    };
    t.mock.method(mongoose.connection, 'transaction', async callback => (
        callback({})
    ));
    t.mock.method(Invite, 'findOne', async () => ({
        _id: 'invite-document-1',
        invite_code: code,
        user_id: 'user-1',
        deletion_requested_at: new Date()
    }));
    t.mock.method(Invite, 'findOneAndUpdate', async () => ({
        _id: 'invite-document-1',
        invite_code: code,
        user_id: 'user-1',
        debited_role_id: 'role-1'
    }));
    t.mock.method(User, 'find', async () => [
        { invites_remaining: 1 }
    ]);
    t.mock.method(User, 'findOneAndUpdate', async () => ({
        invites_remaining: 2
    }));

    await inviteDelete.execute({
        code,
        client,
        guild: {
            id: guildId,
            name: 'Guild'
        }
    });

    assert.equal(Invite.findOne.mock.callCount(), 1);
    assert.equal(Invite.findOneAndUpdate.mock.callCount(), 1);
    assert.equal(client.recentlyDeletedInvites.size, 0);
    assert.equal(client.plannedInviteDeletions.size, 0);
    assert.equal(client.invites.get(guildId).has(code), false);
});
