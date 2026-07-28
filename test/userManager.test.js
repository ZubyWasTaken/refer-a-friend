const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Role, User } = require('../src/models/schemas');
const { initializeUser } = require('../src/utils/userManager');

test('user initialization uses one guild-scoped atomic upsert', async (t) => {
    t.mock.method(Role, 'findOne', async filter => {
        assert.deepEqual(filter, {
            role_id: 'role-1',
            guild_id: 'guild-1'
        });
        return { max_invites: 3 };
    });
    t.mock.method(User, 'findOne', async () => null);
    t.mock.method(User, 'create', async () => ({}));
    t.mock.method(User, 'updateOne', async () => ({ upsertedCount: 1 }));

    await initializeUser('user-1', 'role-1', 'guild-1');

    assert.equal(User.findOne.mock.callCount(), 0);
    assert.equal(User.create.mock.callCount(), 0);
    assert.equal(User.updateOne.mock.callCount(), 1);
    assert.deepEqual(User.updateOne.mock.calls[0].arguments, [
        {
            user_id: 'user-1',
            role_id: 'role-1',
            guild_id: 'guild-1'
        },
        {
            $setOnInsert: {
                user_id: 'user-1',
                role_id: 'role-1',
                guild_id: 'guild-1',
                invites_remaining: 3
            }
        },
        {
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true
        }
    ]);
});
