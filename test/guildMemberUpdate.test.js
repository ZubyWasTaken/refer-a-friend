const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const { Collection } = require('discord.js');
const { Role, User } = require('../src/models/schemas');
const guildMemberUpdate = require('../src/events/guildMemberUpdate');

function member(roleIds) {
    return {
        id: 'user-1',
        user: { tag: 'member' },
        guild: { id: 'guild-1' },
        roles: {
            cache: new Collection(
                roleIds.map(id => [id, { id }])
            )
        }
    };
}

test('adding an unlimited role preserves finite role balances', async (t) => {
    t.mock.method(mongoose.connection, 'transaction', async callback => (
        callback({})
    ));
    t.mock.method(Role, 'find', async () => [
        { role_id: 'finite', max_invites: 3 },
        { role_id: 'unlimited', max_invites: -1 }
    ]);
    t.mock.method(User, 'deleteMany', async () => ({}));
    t.mock.method(User, 'findOneAndUpdate', async () => ({}));
    t.mock.method(User, 'create', async () => ({}));

    await guildMemberUpdate.execute(
        member(['finite']),
        member(['finite', 'unlimited'])
    );

    assert.equal(User.deleteMany.mock.callCount(), 0);
    assert.equal(User.findOneAndUpdate.mock.callCount(), 1);
    assert.deepEqual(
        User.findOneAndUpdate.mock.calls[0].arguments[0],
        {
            user_id: 'user-1',
            role_id: 'unlimited',
            guild_id: 'guild-1'
        }
    );
});

test('removing a finite configured role preserves its remaining credits', async (t) => {
    t.mock.method(mongoose.connection, 'transaction', async callback => (
        callback({})
    ));
    t.mock.method(Role, 'find', async () => [
        { role_id: 'finite', max_invites: 3 }
    ]);
    t.mock.method(User, 'deleteOne', async () => ({}));
    t.mock.method(User, 'find', async () => []);

    await guildMemberUpdate.execute(
        member(['finite']),
        member([])
    );

    assert.equal(User.deleteOne.mock.callCount(), 0);
});

test('removing an unlimited role removes only that sentinel record', async (t) => {
    t.mock.method(mongoose.connection, 'transaction', async callback => (
        callback({})
    ));
    t.mock.method(Role, 'find', async () => [
        { role_id: 'finite', max_invites: 3 },
        { role_id: 'unlimited', max_invites: -1 }
    ]);
    t.mock.method(User, 'deleteOne', async () => ({}));
    t.mock.method(User, 'find', async () => [
        {
            role_id: 'finite',
            invites_remaining: 1
        }
    ]);

    await guildMemberUpdate.execute(
        member(['finite', 'unlimited']),
        member(['finite'])
    );

    assert.equal(User.deleteOne.mock.callCount(), 1);
    assert.deepEqual(
        User.deleteOne.mock.calls[0].arguments[0],
        {
            user_id: 'user-1',
            role_id: 'unlimited',
            guild_id: 'guild-1'
        }
    );
});
