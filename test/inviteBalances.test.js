const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    calculateInviteBalance,
    finalizeInviteDeletion,
    planFiniteDeductions,
    removeInviteCredits
} = require('../src/utils/inviteBalances');
const mongoose = require('mongoose');
const { Invite, User } = require('../src/models/schemas');

test('an unlimited record dominates every finite balance', () => {
    assert.deepEqual(
        calculateInviteBalance([
            { invites_remaining: 5 },
            { invites_remaining: -1 },
            { invites_remaining: 2 }
        ]),
        { unlimited: true, total: -1 }
    );
});

test('finite balances sum without treating the unlimited sentinel as credit', () => {
    assert.deepEqual(
        calculateInviteBalance([
            { invites_remaining: 5 },
            { invites_remaining: 2 }
        ]),
        { unlimited: false, total: 7 }
    );
});

test('deductions can span finite role records without making one negative', () => {
    assert.deepEqual(
        planFiniteDeductions([
            { _id: 'role-a', invites_remaining: 2 },
            { _id: 'role-b', invites_remaining: 3 }
        ], 4),
        [
            { _id: 'role-a', amount: 2 },
            { _id: 'role-b', amount: 2 }
        ]
    );
});

test('deduction planning refuses a request larger than the total balance', () => {
    assert.equal(
        planFiniteDeductions([
            { _id: 'role-a', invites_remaining: 2 },
            { _id: 'role-b', invites_remaining: 1 }
        ], 4),
        null
    );
});

test('credit removal never decrements finite rows while unlimited is present', async (t) => {
    const session = {};
    t.mock.method(mongoose.connection, 'transaction', async callback => (
        callback(session)
    ));
    t.mock.method(User, 'find', async () => [
        { _id: 'finite', invites_remaining: 3 },
        { _id: 'unlimited', invites_remaining: -1 }
    ]);
    t.mock.method(User, 'updateOne', async () => {
        throw new Error('no balance may be decremented');
    });

    const remaining = await removeInviteCredits({
        userId: 'user-1',
        guildId: 'guild-1',
        amount: 1
    });

    assert.equal(remaining, -1);
    assert.equal(User.updateOne.mock.callCount(), 0);
});

test('invite deletion and its finite refund share one transaction', async (t) => {
    const session = {};
    t.mock.method(mongoose.connection, 'transaction', async callback => (
        callback(session)
    ));
    t.mock.method(Invite, 'findOneAndUpdate', async () => ({
        _id: 'invite-1',
        debited_role_id: 'role-1'
    }));
    t.mock.method(User, 'find', async () => [
        { invites_remaining: 2 }
    ]);
    t.mock.method(User, 'findOneAndUpdate', async () => ({
        invites_remaining: 3
    }));

    const result = await finalizeInviteDeletion({
        inviteId: 'invite-1',
        inviteCode: 'code-1',
        userId: 'user-1',
        guildId: 'guild-1',
        isAdministrator: false
    });

    assert.deepEqual(result, {
        claimed: true,
        refunded: true,
        unlimited: false
    });
    assert.equal(mongoose.connection.transaction.mock.callCount(), 1);
    assert.deepEqual(
        Invite.findOneAndUpdate.mock.calls[0].arguments,
        [
            {
                _id: 'invite-1',
                invite_code: 'code-1',
                user_id: 'user-1',
                guild_id: 'guild-1',
                active: { $ne: false }
            },
            {
                $set: {
                    active: false,
                    deletion_requested_at: null
                }
            },
            {
                session,
                returnDocument: 'after',
                runValidators: true
            }
        ]
    );
    assert.deepEqual(
        User.findOneAndUpdate.mock.calls[0].arguments[0],
        {
            user_id: 'user-1',
            guild_id: 'guild-1',
            role_id: 'role-1',
            invites_remaining: { $gte: 0 }
        }
    );
    assert.equal(
        User.findOneAndUpdate.mock.calls[0].arguments[2].session,
        session
    );
});
