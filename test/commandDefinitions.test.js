const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
    InteractionContextType,
    PermissionFlagsBits
} = require('discord.js');

const commandsDirectory = path.join(__dirname, '..', 'src', 'commands');
const commandFiles = fs.readdirSync(commandsDirectory)
    .filter(file => file.endsWith('.js'))
    .sort();

test('every command is registered for guild interactions only', () => {
    for (const commandFile of commandFiles) {
        const command = require(path.join(commandsDirectory, commandFile));
        const json = command.data.toJSON();

        assert.deepEqual(
            json.contexts,
            [InteractionContextType.Guild],
            `${commandFile} must not be available in DMs`
        );
    }
});

test('administrator command definitions retain Administrator defaults', () => {
    const adminCommands = [
        'addinvites',
        'changedefaults',
        'checkinvites',
        'currentconfig',
        'removeinvites',
        'reset',
        'setrole',
        'setup',
        'unsetrole'
    ];

    for (const commandName of adminCommands) {
        const command = require(path.join(commandsDirectory, `${commandName}.js`));
        assert.equal(
            command.data.toJSON().default_member_permissions,
            PermissionFlagsBits.Administrator.toString(),
            `${commandName} must default to Administrator`
        );
    }
});

test('addinvites rejects non-positive amounts at command validation', () => {
    const command = require('../src/commands/addinvites');
    const amountOption = command.data.toJSON().options
        .find(option => option.name === 'amount');

    assert.equal(amountOption.min_value, 1);
});
