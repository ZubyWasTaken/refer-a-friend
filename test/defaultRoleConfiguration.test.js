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
        default_invite_role: null
    };
    t.mock.method(console, 'error', () => {});
    t.mock.method(ServerConfig, 'findOne', async () => config);
    t.mock.method(ServerConfig, 'findOneAndUpdate', async () => ({}));

    const interaction = {
        guildId: 'guild-1',
        channelId: 'bot-channel-1',
        deferred: false,
        replied: false,
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
