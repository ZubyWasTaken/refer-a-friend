# Refer-a-Friend

A powerful Discord bot for managing server invites with role-based permissions, invite tracking, and comprehensive invite management features.

## Features

- **Role-Based Invite System**
  - Assign invite limits to specific roles
  - Set unlimited invites (-1) or specific invite counts
  - Automatic invite tracking per role
  - Hierarchical invite system based on highest role

- **Invite Management**
  - Create single-use invites
  - Track active/used invites
  - Add/remove invites from users
  - Check remaining invites
  - Server-wide invite limit (1000)

- **Administrative Controls**
  - Server setup configuration
  - Default role management
  - Logs channel configuration
  - Full server reset capability
  - Role permission management

## Commands

### Admin Commands

- `/setup` - Initial bot setup
- `/setrole <role> <maxinvites>` - Set invite limits for a role
- `/unsetrole <role>` - Remove invite configuration from a role
- `/changedefaults` - Modify bot default settings
- `/reset` - Reset all bot data for the server
- `/addinvites <user> <amount>` - Add invites to a user
- `/removeinvites <user> <amount>` - Remove invites from a user

### User Commands

- `/invites` - View your invite information
- `/createinvite` - Create a single-use invite
- `/checkinvites <user>` - Check invite status for a user

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with:

   ```env
    BOT_TOKEN=your_bot_token
    CLIENT_ID=your_client_id
    APPLICATION_ID=your_application_id
    GUILD_ID=your_guild_id # for testing in a server, use the server ID
    MONGODB_URI=your_mongodb_uri

    ```

4. Start the bot:

   ```bash
   npm start # this will deploy the commands to discord and start the bot

   ```

## Required Bot Permissions

- Manage Server
- Manage Channels
- Create Instant Invite
- View Channels
- Send Messages
- Send Messages in Threads
- Embed Links
- Read Message History
- Use Slash Commands

## Required Gateway Intents

- SERVER MEMBERS INTENT
- GUILD INVITES INTENT
- GUILDS INTENT
- MESSAGE CONTENT INTENT

## Database Schema

The bot uses MongoDB with the following main collections:

- ServerConfig: Server-specific settings
- Role: Role-based invite configurations
- User: User invite tracking
- Invite: Active invite tracking
- JoinTracking: Invite usage tracking

## Error Handling

The bot includes comprehensive error handling for:

- Missing permissions
- Invalid configurations
- Database errors
- Discord API limitations
- Channel/role hierarchy issues

## Support

For support, please:

1. Check existing issues on GitHub
2. Create a new issue with detailed information
3. Include relevant error messages and configurations

## Security

- Bot requires specific permissions
- Role hierarchy is respected
- Invite limits are enforced
- Admin-only commands are protected