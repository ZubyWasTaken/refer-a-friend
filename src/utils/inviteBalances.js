const mongoose = require('mongoose');
const { Invite, User } = require('../models/schemas');

function calculateInviteBalance(records) {
    const unlimited = records.some(record => record.invites_remaining === -1);
    return {
        unlimited,
        total: unlimited
            ? -1
            : records.reduce(
                (sum, record) => sum + record.invites_remaining,
                0
            )
    };
}

function planFiniteDeductions(records, amount) {
    let remaining = amount;
    const deductions = [];

    for (const record of records) {
        if (remaining === 0) break;

        const deduction = Math.min(record.invites_remaining, remaining);
        if (deduction > 0) {
            deductions.push({ _id: record._id, amount: deduction });
            remaining -= deduction;
        }
    }

    return remaining === 0 ? deductions : null;
}

async function consumeInviteCredit({ userId, guildId }) {
    return User.findOneAndUpdate(
        {
            user_id: userId,
            guild_id: guildId,
            invites_remaining: { $gt: 0 }
        },
        { $inc: { invites_remaining: -1 } },
        {
            sort: { invites_remaining: 1, created_at: 1, _id: 1 },
            returnDocument: 'after',
            runValidators: true
        }
    );
}

async function addInviteCredits({ userId, guildId, amount }) {
    return User.findOneAndUpdate(
        {
            user_id: userId,
            guild_id: guildId,
            invites_remaining: { $gte: 0 }
        },
        { $inc: { invites_remaining: amount } },
        {
            sort: { invites_remaining: 1, created_at: 1, _id: 1 },
            returnDocument: 'after',
            runValidators: true
        }
    );
}

async function refundInviteCredit({ userId, guildId, roleId }) {
    return User.findOneAndUpdate(
        {
            user_id: userId,
            guild_id: guildId,
            role_id: roleId,
            invites_remaining: { $gte: 0 }
        },
        { $inc: { invites_remaining: 1 } },
        {
            returnDocument: 'after',
            runValidators: true
        }
    );
}

async function removeInviteCredits({ userId, guildId, amount }) {
    return mongoose.connection.transaction(async session => {
        const records = await User.find(
            {
                user_id: userId,
                guild_id: guildId
            },
            null,
            {
                session,
                sort: { invites_remaining: 1, created_at: 1, _id: 1 }
            }
        );
        const balance = calculateInviteBalance(records);
        if (balance.unlimited) {
            return -1;
        }

        const deductions = planFiniteDeductions(
            records.filter(record => record.invites_remaining >= 0),
            amount
        );

        if (!deductions) {
            return null;
        }

        for (const deduction of deductions) {
            const result = await User.updateOne(
                {
                    _id: deduction._id,
                    user_id: userId,
                    guild_id: guildId,
                    invites_remaining: { $gte: deduction.amount }
                },
                { $inc: { invites_remaining: -deduction.amount } },
                { session, runValidators: true }
            );

            if (result.modifiedCount !== 1) {
                throw new Error('Invite balance changed during deduction');
            }
        }

        return balance.total - amount;
    });
}

async function finalizeInviteDeletion({
    inviteId,
    inviteCode,
    userId,
    guildId,
    isAdministrator
}) {
    return mongoose.connection.transaction(async session => {
        const claimedInvite = await Invite.findOneAndUpdate(
            {
                _id: inviteId,
                invite_code: inviteCode,
                user_id: userId,
                guild_id: guildId,
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
        );

        if (!claimedInvite) {
            return {
                claimed: false,
                refunded: false,
                unlimited: false
            };
        }

        if (isAdministrator) {
            return {
                claimed: true,
                refunded: false,
                unlimited: true
            };
        }

        const records = await User.find(
            {
                user_id: userId,
                guild_id: guildId
            },
            null,
            { session }
        );
        const balance = calculateInviteBalance(records);

        if (balance.unlimited) {
            return {
                claimed: true,
                refunded: false,
                unlimited: true
            };
        }

        const refundFilter = {
            user_id: userId,
            guild_id: guildId,
            invites_remaining: { $gte: 0 }
        };
        if (claimedInvite.debited_role_id) {
            refundFilter.role_id = claimedInvite.debited_role_id;
        }

        const refundedRecord = await User.findOneAndUpdate(
            refundFilter,
            { $inc: { invites_remaining: 1 } },
            {
                session,
                sort: { invites_remaining: 1, created_at: 1, _id: 1 },
                returnDocument: 'after',
                runValidators: true
            }
        );

        return {
            claimed: true,
            refunded: Boolean(refundedRecord),
            unlimited: false
        };
    });
}

module.exports = {
    addInviteCredits,
    calculateInviteBalance,
    consumeInviteCredit,
    finalizeInviteDeletion,
    planFiniteDeductions,
    refundInviteCredit,
    removeInviteCredits
};
