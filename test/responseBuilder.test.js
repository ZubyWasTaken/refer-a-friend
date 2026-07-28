const assert = require('node:assert/strict');
const { test } = require('node:test');
const { appendNumberedLinks } = require('../src/utils/responseBuilder');

test('invite lists stay within Discord content limits and report omissions', () => {
    const links = Array.from(
        { length: 100 },
        (_, index) => `https://discord.gg/invite-${index}-${'x'.repeat(30)}`
    );

    const response = appendNumberedLinks(
        '**Active Invites:**\n',
        links,
        { maxLength: 300 }
    );

    assert.ok(response.length <= 300);
    assert.match(response, /more invite/);
    assert.match(response, /^1\. /m);
});
