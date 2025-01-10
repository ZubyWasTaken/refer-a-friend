require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Debug: Log the commands directory path
console.log('Commands directory:', commandsPath);

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Add your guild ID to .env file
    if (process.env.GUILD_ID) {
      // Deploy to specific guild (faster for testing)
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
    } else {
      // Deploy globally (can take up to an hour to update)
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
    }

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    // Debug: Log full error
    console.error('Error deploying commands:', error);
  }
})(); 