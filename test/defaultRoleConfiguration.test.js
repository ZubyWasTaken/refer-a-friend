const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ServerConfig } = require('../src/models/schemas');
const setup = require('../src/commands/setup');
const changedefaults = require('../src/commands/changedefaults');

const unassignableRole = {
    id: 'role-1',
    editable: false,
    toString: () => '<@&role-1>'
};

test('setup rejects an unassignable default role without saving configuration', async (t) => {
    const replies = [];
    t.mock.method(ServerConfig, 'findOne', async (filter) => {
        assert.deepEqual(filter, { guild_id: 'guild-1' });
        return null;
    });
    t.mock.method(ServerConfig, 'findOneAndUpdate', async () => ({}));

    const interaction = {
        guildId: 'guild-1',
        member: {
            permissions: {
                has: () => true
            }
        },
        guild: {
            members: {
                me: {
                    permissions: {
                        has: () => true
                    }
                }
            }
        },
        options: {
            getChannel: (name) => ({ id: `${name}-1` }),
            getRole: () => unassignableRole
        },
        deferReply: async () => {},
        editReply: async (reply) => replies.push(reply)
    };

    await setup.execute(interaction);

    assert.match(replies.at(-1).content, /cannot assign/i);
    assert.equal(ServerConfig.findOneAndUpdate.mock.callCount(), 0);
});

test('changedefaults rejects an unassignable default role without updating configuration', async (t) => {
    const replies = [];
    const config = {
        bot_channel_id: 'bot-channel-1',
        default_invite_role: null,
        setup_completed: true
    };
    t.mock.method(console, 'error', () => {});
    t.mock.method(ServerConfig, 'findOne', async () => config);
    t.mock.method(ServerConfig, 'findOneAndUpdate', async () => ({}));

    const interaction = {
        guildId: 'guild-1',
        channelId: 'bot-channel-1',
        deferred: false,
        replied: false,
        member: {
            permissions: {
                has: () => true
            }
        },
        guild: {
            channels: {
                cache: new Map()
            }
        },
        options: {
            getSubcommand: () => 'defaultrole',
            getString: () => null,
            getRole: () => unassignableRole
        },
        deferReply: async function () {
            this.deferred = true;
        },
        editReply: async (reply) => replies.push(reply)
    };

    await changedefaults.execute(interaction);

    assert.match(replies.at(-1).content, /cannot assign/i);
    assert.equal(ServerConfig.findOneAndUpdate.mock.callCount(), 0);
});

test('setup does not require an unrelated system messages channel', async (t) => {
    const replies = [];
    const messages = [];
    const requestedChannels = [];
    const channel = id => ({
        id,
        permissionsFor: () => ({
            has: () => true
        }),
        send: async message => messages.push([id, message]),
        toString: () => `<#${id}>`
    });
    t.mock.method(ServerConfig, 'findOne', async () => null);
    t.mock.method(ServerConfig, 'findOneAndUpdate', async () => ({}));

    const interaction = {
        guildId: 'guild-1',
        member: {
            permissions: {
                has: () => true
            }
        },
        guild: {
            name: 'Guild',
            systemChannel: null,
            members: {
                me: {
                    permissions: {
                        has: () => true
                    }
                }
            }
        },
        user: {
            id: 'admin-1',
            tag: 'admin'
        },
        client: {
            logger: {
                logToFile: async () => {}
            }
        },
        options: {
            getChannel: name => {
                requestedChannels.push(name);
                assert.ok(
                    name === 'logs' || name === 'botchannel',
                    `Unexpected setup channel option: ${name}`
                );
                return channel(name);
            },
            getRole: () => null
        },
        deferReply: async () => {},
        editReply: async reply => replies.push(reply)
    };

    await setup.execute(interaction);

    assert.equal(ServerConfig.findOneAndUpdate.mock.callCount(), 1);
    const update = ServerConfig.findOneAndUpdate.mock.calls[0].arguments[1];
    assert.equal('system_channel_id' in update, false);
    assert.deepEqual(requestedChannels, ['logs', 'botchannel']);
    assert.match(replies.at(-1).content, /Setup Complete/i);
});
