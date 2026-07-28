const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    deployCommands,
    loadCommandPayloads,
    validateDeploymentEnvironment
} = require('../src/deploy-commands');

test('command deployment payloads load deterministically', () => {
    const commands = loadCommandPayloads();
    const names = commands.map(command => command.name);

    assert.deepEqual(names, [...names].sort());
    assert.equal(new Set(names).size, names.length);
});

test('deployment rejects missing credentials before making a REST request', async () => {
    let putCalled = false;
    const rest = {
        put: async () => {
            putCalled = true;
        }
    };

    await assert.rejects(
        deployCommands({
            environment: {},
            commands: [],
            rest
        }),
        /BOT_TOKEN, CLIENT_ID/
    );
    assert.equal(putCalled, false);
});

test('deployment environment validation accepts an optional guild scope', () => {
    assert.deepEqual(validateDeploymentEnvironment({
        BOT_TOKEN: 'redacted',
        CLIENT_ID: 'client',
        GUILD_ID: 'guild'
    }), {
        BOT_TOKEN: 'redacted',
        CLIENT_ID: 'client',
        GUILD_ID: 'guild'
    });
});

test('deployment trims credentials and treats a blank guild scope as global', () => {
    assert.deepEqual(validateDeploymentEnvironment({
        BOT_TOKEN: '  redacted  ',
        CLIENT_ID: '  client  ',
        GUILD_ID: '   '
    }), {
        BOT_TOKEN: 'redacted',
        CLIENT_ID: 'client',
        GUILD_ID: undefined
    });
});

test('deployment refuses to overwrite commands with an empty payload', async () => {
    let putCalled = false;

    await assert.rejects(
        deployCommands({
            environment: {
                BOT_TOKEN: 'redacted',
                CLIENT_ID: 'client'
            },
            commands: [],
            rest: {
                put: async () => {
                    putCalled = true;
                }
            }
        }),
        /empty command set/
    );
    assert.equal(putCalled, false);
});
