const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startServices } = require('../src/utils/startup');

test('database initialization completes before Discord login starts', async () => {
    const calls = [];

    await startServices({
        initDatabase: async () => calls.push('database'),
        login: async () => calls.push('discord')
    });

    assert.deepEqual(calls, ['database', 'discord']);
});

test('Discord login is not attempted when database initialization fails', async () => {
    let loginCalled = false;

    await assert.rejects(
        startServices({
            initDatabase: async () => {
                throw new Error('database unavailable');
            },
            login: async () => {
                loginCalled = true;
            }
        }),
        /database unavailable/
    );

    assert.equal(loginCalled, false);
});
