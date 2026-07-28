const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PermissionFlagsBits } = require('discord.js');
const { ServerConfig } = require('../src/models/schemas');
const checkRequirements = require('../src/utils/checkRequirements');

function createInteraction({ administrator = true } = {}) {
    const replies = [];
    return {
        replies,
        interaction: {
            guildId: 'guild-1',
            channelId: 'commands-1',
            deferred: true,
            replied: false,
            member: {
                permissions: {
                    has: permission => (
                        permission === PermissionFlagsBits.Administrator &&
                        administrator
                    )
                }
            },
            guild: {
                channels: {
                    cache: new Map([['commands-1', '<#commands-1>']])
                }
            },
            editReply: async reply => replies.push(reply)
        }
    };
}

test('runtime authorization rejects a non-admin before loading configuration', async (t) => {
    const fixture = createInteraction({ administrator: false });
    t.mock.method(ServerConfig, 'findOne', async () => {
        throw new Error('configuration must not be queried for unauthorized users');
    });

    const result = await checkRequirements(fixture.interaction);

    assert.equal(result, false);
    assert.match(fixture.replies.at(-1).content, /Administrator/i);
    assert.equal(ServerConfig.findOne.mock.callCount(), 0);
});

test('user commands can opt out of the admin check while retaining setup and channel checks', async (t) => {
    const fixture = createInteraction({ administrator: false });
    const config = {
        guild_id: 'guild-1',
        bot_channel_id: 'commands-1',
        setup_completed: true
    };
    t.mock.method(ServerConfig, 'findOne', async filter => {
        assert.deepEqual(filter, { guild_id: 'guild-1' });
        return config;
    });

    const result = await checkRequirements(fixture.interaction, {
        requireAdministrator: false
    });

    assert.equal(result, config);
    assert.equal(fixture.replies.length, 0);
});

test('an incomplete configuration is treated as not set up', async (t) => {
    const fixture = createInteraction();
    t.mock.method(ServerConfig, 'findOne', async () => ({
        guild_id: 'guild-1',
        bot_channel_id: 'commands-1',
        setup_completed: false
    }));

    const result = await checkRequirements(fixture.interaction);

    assert.equal(result, false);
    assert.match(fixture.replies.at(-1).content, /not set up/i);
});
