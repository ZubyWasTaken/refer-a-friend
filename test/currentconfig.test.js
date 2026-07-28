const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildRoleFields } = require('../src/commands/currentconfig');

test('role configuration fields stay within Discord embed limits', () => {
    const fields = buildRoleFields(
        Array.from(
            { length: 300 },
            (_, index) => `<@&role-${index}>: ${index} invites\n`
        )
    );

    assert.ok(fields.length <= 5);
    assert.ok(fields.every(field => field.value.length <= 1024));
    assert.match(fields.at(-1).value, /more configured role/);
});

test('no role lines produce no header-only embed field', () => {
    assert.deepEqual(buildRoleFields([]), []);
});
