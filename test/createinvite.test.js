const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    Collection,
    PermissionFlagsBits
} = require('discord.js');
const { Invite, Role, ServerConfig, User } = require('../src/models/schemas');
const createinvite = require('../src/commands/createinvite');

function createInteraction({ administrator = false } = {}) {
    const replies = [];
    const invite = {
        code: 'code-1',
        url: 'https://discord.gg/code-1',
        delete: async () => {}
    };
    const configuredRole = {
        _id: 'balance-1',
        role_id: 'role-1',
        max_invites: 2,
        invites_remaining: 2
    };
    const memberRoles = new Collection([
        [
            'role-1',
            {
                id: 'role-1',
                name: 'Inviter',
                permissions: {
                    has: permission => (
                        permission === PermissionFlagsBits.Administrator &&
                        administrator
                    )
                }
            }
        ]
    ]);
    const interaction = {
        guildId: 'guild-1',
        channelId: 'commands-1',
        deferred: false,
        replied: false,
        user: {
            id: 'user-1',
            tag: 'user'
        },
        member: {
            id: 'user-1',
            permissions: {
                has: permission => (
                    permission === PermissionFlagsBits.Administrator &&
                    administrator
                )
            },
            roles: {
                cache: memberRoles
            }
        },
        guild: {
            id: 'guild-1',
            name: 'Guild',
            channels: {
                cache: new Collection([['commands-1', '<#commands-1>']])
            },
            members: {
                me: {
                    id: 'bot-1'
                }
            }
        },
        channel: {
            permissionsFor: () => ({
                has: () => true
            }),
            createInvite: async () => invite
        },
        client: {
            invites: new Collection(),
            plannedInviteDeletions: new Collection(),
            logger: {
                logToChannel: async () => {},
                logToFile: async () => {}
            }
        },
        deferReply: async function () {
            this.deferred = true;
        },
        editReply: async reply => {
            replies.push(reply);
            return reply;
        }
    };

    return {
        configuredRole,
        interaction,
        invite,
        replies
    };
}

test('administrators receive runtime unlimited access without database role mutations', async (t) => {
    const fixture = createInteraction({ administrator: true });
    t.mock.method(ServerConfig, 'findOne', async () => ({
        bot_channel_id: 'commands-1',
        setup_completed: true
    }));
    t.mock.method(Role, 'find', async () => []);
    t.mock.method(Role, 'findOneAndUpdate', async () => ({}));
    t.mock.method(User, 'find', async () => []);
    t.mock.method(User, 'findOneAndUpdate', async () => {
        throw new Error('administrator credits must not be decremented');
    });
    t.mock.method(Invite, 'create', async () => ({}));

    await createinvite.execute(fixture.interaction);

    assert.equal(Role.findOneAndUpdate.mock.callCount(), 0);
    assert.equal(User.findOneAndUpdate.mock.callCount(), 0);
    assert.match(fixture.replies.at(-1).content, /unlimited invites remaining/);
});

test('database persistence failure deletes the Discord invite before refunding credit', async (t) => {
    const fixture = createInteraction();
    const calls = [];
    fixture.invite.delete = async () => calls.push('delete');
    t.mock.method(console, 'error', () => {});

    t.mock.method(ServerConfig, 'findOne', async () => ({
        bot_channel_id: 'commands-1',
        setup_completed: true
    }));
    t.mock.method(Role, 'find', async () => [fixture.configuredRole]);
    t.mock.method(Role, 'findOne', async () => fixture.configuredRole);
    t.mock.method(User, 'updateOne', async () => ({}));
    t.mock.method(User, 'find', async () => [fixture.configuredRole]);
    t.mock.method(User, 'findOneAndUpdate', async (filter, update) => {
        if (update.$inc.invites_remaining === -1) {
            return { ...fixture.configuredRole, invites_remaining: 1 };
        }
        calls.push('refund');
        return { ...fixture.configuredRole, invites_remaining: 2 };
    });
    t.mock.method(Invite, 'create', async () => {
        throw new Error('database unavailable');
    });

    await createinvite.execute(fixture.interaction);

    assert.deepEqual(calls, ['delete', 'refund']);
    assert.equal(
        Invite.create.mock.calls[0].arguments[0].debited_role_id,
        'role-1'
    );
    assert.equal(
        fixture.interaction.client.plannedInviteDeletions.size,
        1
    );
});
