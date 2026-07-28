const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const { Collection, PermissionFlagsBits } = require('discord.js');
const { Role, ServerConfig, User } = require('../src/models/schemas');
const setrole = require('../src/commands/setrole');

function createInteraction(maxInvites) {
    const replies = [];
    const role = {
        id: 'role-1',
        name: 'Inviter'
    };
    return {
        replies,
        role,
        interaction: {
            guildId: 'guild-1',
            channelId: 'commands-1',
            deferred: false,
            replied: false,
            user: {
                id: 'admin-1',
                tag: 'admin'
            },
            member: {
                permissions: {
                    has: permission => (
                        permission === PermissionFlagsBits.Administrator
                    )
                }
            },
            guild: {
                name: 'Guild',
                channels: {
                    cache: new Collection([
                        ['commands-1', '<#commands-1>']
                    ])
                },
                members: {
                    fetch: async () => new Collection([
                        [
                            'user-1',
                            {
                                id: 'user-1',
                                roles: {
                                    cache: new Collection([
                                        ['role-1', role]
                                    ])
                                }
                            }
                        ]
                    ])
                }
            },
            options: {
                getRole: () => role,
                getInteger: () => maxInvites
            },
            client: {
                logger: {
                    logToFile: async () => {}
                }
            },
            deferReply: async function () {
                this.deferred = true;
            },
            editReply: async reply => replies.push(reply)
        }
    };
}

test('setting a role to unlimited changes only that role record for each member', async (t) => {
    const fixture = createInteraction(-1);
    t.mock.method(ServerConfig, 'findOne', async () => ({
        bot_channel_id: 'commands-1',
        setup_completed: true
    }));
    t.mock.method(Role, 'findOne', async () => ({
        max_invites: 3
    }));
    t.mock.method(mongoose.connection, 'transaction', async callback => (
        callback({})
    ));
    t.mock.method(Role, 'findOneAndUpdate', async () => ({}));
    t.mock.method(User, 'updateMany', async () => ({}));
    t.mock.method(User, 'bulkWrite', async () => ({}));

    await setrole.execute(fixture.interaction);

    assert.equal(User.updateMany.mock.callCount(), 0);
    assert.equal(User.bulkWrite.mock.callCount(), 1);
    assert.deepEqual(
        User.bulkWrite.mock.calls[0].arguments[0][0].updateOne.filter,
        {
          user_id: 'user-1',
          role_id: 'role-1',
          guild_id: 'guild-1'
        }
    );
});

test('changing an unlimited role to finite replaces its sentinel allocation', async (t) => {
    const fixture = createInteraction(4);
    t.mock.method(ServerConfig, 'findOne', async () => ({
        bot_channel_id: 'commands-1',
        setup_completed: true
    }));
    t.mock.method(Role, 'findOne', async () => ({
        max_invites: -1
    }));
    t.mock.method(mongoose.connection, 'transaction', async callback => (
        callback({})
    ));
    t.mock.method(Role, 'findOneAndUpdate', async () => ({}));
    t.mock.method(User, 'findOne', async () => ({
        invites_remaining: -1
    }));
    t.mock.method(User, 'bulkWrite', async () => ({}));
    t.mock.method(User, 'create', async () => ({}));

    await setrole.execute(fixture.interaction);

    assert.equal(User.bulkWrite.mock.callCount(), 1);
    assert.deepEqual(
        User.bulkWrite.mock.calls[0].arguments[0][0].updateOne.update,
        {
            $set: { invites_remaining: 4 },
            $setOnInsert: {
                user_id: 'user-1',
                role_id: 'role-1',
                guild_id: 'guild-1'
            }
        }
    );
});
