const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Role, User } = require('../src/models/schemas');

test('user balances reject values below the unlimited sentinel', async () => {
    const document = new User({
        user_id: 'user-1',
        guild_id: 'guild-1',
        role_id: 'role-1',
        invites_remaining: -2
    });

    await assert.rejects(document.validate(), /invites_remaining/);
});

test('role allocations reject zero while allowing the unlimited sentinel', async () => {
    const invalid = new Role({
        role_id: 'role-1',
        guild_id: 'guild-1',
        name: 'Role',
        max_invites: 0
    });
    const unlimited = new Role({
        role_id: 'role-1',
        guild_id: 'guild-1',
        name: 'Role',
        max_invites: -1
    });

    await assert.rejects(invalid.validate(), /max_invites/);
    await assert.doesNotReject(unlimited.validate());
});
