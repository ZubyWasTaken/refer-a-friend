const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const fsPromises = require('node:fs').promises;
const Logger = require('../src/utils/logger');

test('log cleanup deletes only old regular .log files', async (t) => {
    const deleted = [];
    t.mock.method(console, 'log', () => {});
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    t.mock.method(fsPromises, 'readdir', async () => [
        'old.log',
        'notes.txt',
        'directory.log',
        'recent.log'
    ]);
    t.mock.method(fsPromises, 'stat', async filePath => ({
        isFile: () => path.basename(filePath) !== 'directory.log',
        mtime: path.basename(filePath) === 'recent.log'
            ? new Date()
            : oldDate
    }));
    t.mock.method(fsPromises, 'unlink', async filePath => {
        deleted.push(path.basename(filePath));
    });

    const logger = new Logger({});
    await logger.cleanOldLogs(30);

    assert.deepEqual(deleted, ['old.log']);
});

test('log metadata is allow-listed and circular values cannot break logging', async (t) => {
    const writes = [];
    const circular = {};
    circular.self = circular;
    t.mock.method(fsPromises, 'appendFile', async (_filePath, contents) => {
        writes.push(contents);
    });

    const logger = new Logger({});
    await logger.logToFile('message', 'test', {
        command: 'help',
        error: circular,
        secret: 'must-not-be-written',
        maxInvites: 3n
    });

    assert.equal(writes.length, 1);
    assert.match(writes[0], /unserializable metadata/);
    assert.doesNotMatch(writes[0], /must-not-be-written|secret/);
});
