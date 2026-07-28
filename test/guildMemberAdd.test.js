const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Collection } = require('discord.js');
const { Invite, JoinTracking, ServerConfig } = require('../src/models/schemas');
const guildMemberAdd = require('../src/events/guildMemberAdd');

function createMemberFixture() {
    const calls = [];
    const guildId = 'guild-1';
    const role = {
        id: 'role-1',
        name: 'Member',
        editable: true
    };
    const recentInvite = {
        _id: 'invite-document-1',
        code: 'used-code',
        guildId,
        timestamp: Date.now(),
        user_id: 'inviter-1'
    };
    const client = {
        invites: new Collection([[guildId, new Collection()]]),
        recentlyDeletedInvites: new Collection([
            [recentInvite.code, recentInvite]
        ]),
        users: {
            fetch: async () => ({ tag: 'inviter' })
        },
        logger: {
            logToChannel: async () => {},
            logToFile: async (message) => calls.push(['log', message])
        }
    };
    const member = {
        id: 'member-1',
        user: { tag: 'new-member' },
        client,
        guild: {
            id: guildId,
            name: 'Guild',
            invites: {
                fetch: async () => new Collection()
            },
            roles: {
                cache: new Collection([[role.id, role]])
            }
        },
        roles: {
            add: async (assignedRole) => {
                calls.push([
                    'add',
                    typeof assignedRole === 'string'
                        ? assignedRole
                        : assignedRole.id
                ]);
            }
        }
    };

    return { calls, client, member };
}

test('assigns the default role when inviteDelete removed the consumed invite first', async (t) => {
    const fixture = createMemberFixture();
    t.mock.method(Invite, 'findOne', async () => {
        throw new Error('database fallback should not be needed');
    });
    t.mock.method(JoinTracking, 'create', async () => ({}));
    t.mock.method(ServerConfig, 'findOne', async (filter) => {
        assert.deepEqual(filter, { guild_id: 'guild-1' });
        return { default_invite_role: 'role-1' };
    });

    await guildMemberAdd.execute(fixture.member);

    assert.deepEqual(
        fixture.calls.filter(([type]) => type === 'add'),
        [['add', 'role-1']]
    );
    assert.equal(
        fixture.client.recentlyDeletedInvites.has('used-code'),
        false
    );
});

test('tracking failure does not prevent default role assignment', async (t) => {
    const fixture = createMemberFixture();
    t.mock.method(console, 'error', () => {});
    t.mock.method(Invite, 'findOne', async () => null);
    t.mock.method(JoinTracking, 'create', async () => {
        throw new Error('tracking unavailable');
    });
    t.mock.method(ServerConfig, 'findOne', async () => ({
        default_invite_role: 'role-1'
    }));

    await guildMemberAdd.execute(fixture.member);

    assert.equal(
        fixture.calls.some(([type]) => type === 'add'),
        true
    );
});

test('logs role assignment only after Discord confirms the role addition', async (t) => {
    const fixture = createMemberFixture();
    t.mock.method(Invite, 'findOne', async () => null);
    t.mock.method(JoinTracking, 'create', async () => ({}));
    t.mock.method(ServerConfig, 'findOne', async () => ({
        default_invite_role: 'role-1'
    }));

    await guildMemberAdd.execute(fixture.member);

    const addIndex = fixture.calls.findIndex(([type]) => type === 'add');
    const successLogIndex = fixture.calls.findIndex(
        ([type, message]) => (
            type === 'log' &&
            message.includes('Default invite role')
        )
    );

    assert.ok(addIndex >= 0);
    assert.ok(successLogIndex > addIndex);
});
