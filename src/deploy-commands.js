require('dotenv').config({ quiet: true });
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

function loadCommandPayloads(
  commandsPath = path.join(__dirname, 'commands')
) {
  return fs.readdirSync(commandsPath)
    .filter(file => file.endsWith('.js'))
    .sort()
    .map(file => {
      const command = require(path.join(commandsPath, file));
      if (
        !command ||
        typeof command.data?.toJSON !== 'function' ||
        typeof command.execute !== 'function'
      ) {
        throw new TypeError(`Invalid command module: ${file}`);
      }
      return command.data.toJSON();
    });
}

function validateDeploymentEnvironment(environment) {
  const required = ['BOT_TOKEN', 'CLIENT_ID'];
  const normalized = {
    ...environment,
    BOT_TOKEN: typeof environment.BOT_TOKEN === 'string'
      ? environment.BOT_TOKEN.trim()
      : '',
    CLIENT_ID: typeof environment.CLIENT_ID === 'string'
      ? environment.CLIENT_ID.trim()
      : '',
    GUILD_ID: typeof environment.GUILD_ID === 'string'
      ? environment.GUILD_ID.trim() || undefined
      : undefined
  };
  const missing = required.filter(name => !normalized[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
  return normalized;
}

async function deployCommands({
  environment = process.env,
  commands,
  rest
} = {}) {
  const normalizedEnvironment = validateDeploymentEnvironment(environment);
  const commandPayloads = commands === undefined
    ? loadCommandPayloads()
    : commands;
  if (!Array.isArray(commandPayloads) || commandPayloads.length === 0) {
    throw new Error('Refusing to deploy an empty command set');
  }

  const restClient = rest ??
    new REST({ version: '10' }).setToken(normalizedEnvironment.BOT_TOKEN);

  const route = normalizedEnvironment.GUILD_ID
    ? Routes.applicationGuildCommands(
        normalizedEnvironment.CLIENT_ID,
        normalizedEnvironment.GUILD_ID
      )
    : Routes.applicationCommands(normalizedEnvironment.CLIENT_ID);

  console.log(
    `Refreshing ${commandPayloads.length} application commands ` +
    `${normalizedEnvironment.GUILD_ID
      ? `for guild ${normalizedEnvironment.GUILD_ID}`
      : 'globally'}.`
  );
  await restClient.put(route, { body: commandPayloads });
  console.log('Successfully reloaded application commands.');
}

if (require.main === module) {
  deployCommands().catch(error => {
    console.error(
      `Failed to deploy application commands: ${error.name}: ${error.message}`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  deployCommands,
  loadCommandPayloads,
  validateDeploymentEnvironment
};
