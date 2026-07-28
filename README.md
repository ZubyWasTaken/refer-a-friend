# Refer-a-Friend

A Discord bot for managing server invites through a role-based permission system. Control who can create invites, track invite usage, and automatically assign roles to new members.

## Features

### Role-Based Invite System
- Configure invite limits per role (specific number or unlimited)
- Automatic invite allocation when members receive configured roles
- Support for multiple roles with different invite limits per user
- Administrators automatically receive unlimited invites
- Finite credits persist after a configured role is removed; unlimited access
  ends when the role that granted it is removed

### Invite Creation and Tracking
- Create single-use invite links that automatically track usage
- View all active invites and remaining invite balance
- Delete invites with automatic refund of invite credits
- Track which invite was used when members join
- Automatic assignment of default role to members joining via tracked invites

### Administrative Controls
- Initial server setup with logs channel and bot commands channel configuration
- Configure invite limits for specific roles
- Add or remove invites from individual users
- View current server configuration and all role invite limits
- Check any user's invite balance and active invites
- Complete server data reset capability
- Modify server settings after initial setup

### Logging and Monitoring
- Comprehensive logging to designated logs channel
- Track member joins with invite attribution
- Log invite creation, usage, and deletion
- File-based logging system with automatic cleanup
- Error tracking and reporting

## Commands

### Setup Commands (Administrator Only)

- `/setup` - Initial bot configuration
  - Set logs channel for bot activity tracking
  - Set bot commands channel where commands can be used
  - Optionally set default role for new members joining via invites
  - The default role must be below the bot's highest role and must not be
    managed by another integration

- `/currentconfig` - View current server configuration
  - Display configured channels
  - Show all roles with invite limits
  - Quick reference for modification commands

### Invite Configuration Commands (Administrator Only)

- `/setrole <role> <maxinvites>` - Configure invite limits for a role
  - Set specific number of invites (1 or higher)
  - Set unlimited invites using -1
  - Automatically updates existing members with the role

- `/unsetrole <role>` - Remove invite permissions from a role
  - Removes invite limit configuration
  - Does not affect invites already created by users with that role

- `/changedefaults` - Modify server settings
  - Change logs channel
  - Change bot commands channel
  - Change or remove default invite role

### Invite Management Commands (Administrator Only)

- `/addinvites <user> <amount>` - Grant invites to a specific user
  - Add to user's existing invite balance
  - Requires user to have at least one configured role

- `/removeinvites <user> <amount>` - Remove invites from a specific user
  - Deduct from user's existing invite balance
  - Cannot reduce below zero

- `/checkinvites <user>` - View another user's invite information
  - Check invite balance
  - View active invite links

- `/reset` - Reset all bot data for the server
  - Clears all configuration, roles, users, and invites
  - Cannot be undone

### User Commands

- `/invites` - View your invite information
  - Display remaining invite balance
  - List all active invite links you created

- `/createinvite` - Create a new single-use invite link
  - Consumes one invite from your balance
  - Invite link never expires but can only be used once
  - Links are automatically tracked

- `/deleteinvite <number>` - Delete a specific invite link
  - Reference invite by number from your `/invites` list
  - Refunds the exact role balance originally charged
  - Removes the Discord invite and retains an inactive database record for
    attribution history

- `/help` - Display command list and descriptions
  - Shows all commands available to you
  - Administrators see additional admin commands

## Setup

### Prerequisites
- Node.js 24.17.0 or newer
- MongoDB replica set or sharded cluster with transaction support (for example,
  MongoDB Atlas)
- Discord Bot Application with necessary permissions and intents enabled

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ZubyWasTaken/refer-a-friend.git
   cd refer-a-friend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```env
   BOT_TOKEN=your_bot_token
   CLIENT_ID=your_client_id
   GUILD_ID=your_guild_id
   MONGODB_URI=your_mongodb_connection_string
   ```

   **Environment Variables:**
   - `BOT_TOKEN` - Your Discord bot token from the Developer Portal
   - `CLIENT_ID` - Your Discord application's client ID
   - `GUILD_ID` - Server ID for testing (optional, for development)
   - `MONGODB_URI` - MongoDB connection string

4. Deploy slash commands and start the bot:
   ```bash
   npm start
   ```

`npm start` first registers slash commands and then starts the bot. When
`GUILD_ID` is set, commands are registered to that development guild for
faster iteration. Without `GUILD_ID`, commands are registered globally and may
take longer to propagate.

### Available Scripts

- `npm start` - Register slash commands, then start the Discord bot.
- `npm run deploy` - Register slash commands without starting the bot.
- `npm test` - Run the local Node.js regression suite without contacting
  Discord or MongoDB.

The `start` and `deploy` scripts call the live Discord API and require valid
Discord credentials. They are operational commands, not local tests.

### First-Time Server Setup

After adding the bot to your Discord server:

1. Ensure the bot has all required permissions (see below)
2. Run `/setup` in your server to configure the bot
3. Use `/setrole` to configure which roles can create invites

## Development References

- [discord.js 14.27.0 API](https://discord.js.org/docs/packages/discord.js/14.27.0)
- [discord.js guide](https://discordjs.guide/)
- [Discord Developer Platform](https://docs.discord.com/developers/intro)
- [Mongoose documentation](https://mongoosejs.com/docs/)
- [MongoDB manual](https://www.mongodb.com/docs/manual/)
- [Node.js 24 API](https://nodejs.org/docs/latest-v24.x/api/)
- [dotenv documentation](https://github.com/motdotla/dotenv)

Use the version-pinned discord.js API for library syntax and Discord's
developer documentation for platform behavior such as permissions, intents,
interactions, and rate limits.

## Required Bot Permissions

The bot requires:

- **Manage Server** at guild level to fetch the server invite list.
- **Manage Channels**, **Create Instant Invite**, **View Channel**, and
  **Send Messages** in the configured bot-command channel. Discord only sends
  invite create/delete gateway events to bots with effective Manage Channels
  permission on the invite's channel.
- **View Channel**, **Send Messages**, and **Embed Links** in the configured
  logs channel.
- **Manage Roles** only when a default invite role is configured. The bot's
  highest role must be above that role.

## Required Gateway Intents

Enable **Server Members Intent** under Privileged Gateway Intents in the
Discord Developer Portal. The bot configures the standard **Guilds** and
**Guild Invites** intents in code; they do not require a portal toggle.

Note: Message Content Intent is not required for this bot.

## Database Schema

The bot uses MongoDB with the following collections:

### ServerConfig
Stores server-specific configuration settings.
- `guild_id` - Discord server ID
- `logs_channel_id` - Channel for bot logs
- `bot_channel_id` - Channel where bot commands can be used
- `default_invite_role` - Role assigned to members joining via tracked invites
- `setup_completed` - Boolean indicating if initial setup is complete

### Role
Stores role-based invite configurations.
- `role_id` - Discord role ID
- `guild_id` - Discord server ID
- `name` - Role name
- `max_invites` - Maximum invites for this role (-1 for unlimited)

### User
Tracks user invite balances per role.
- `user_id` - Discord user ID
- `guild_id` - Discord server ID
- `role_id` - Associated role ID
- `invites_remaining` - Current invite balance
- `created_at` - Record creation timestamp

### Invite
Tracks invite links created through the bot, including inactive records kept
for join attribution.
- `user_id` - Creator's Discord user ID
- `guild_id` - Discord server ID
- `link` - Full invite URL
- `invite_code` - Short invite code
- `max_uses` - Maximum uses (always 1 for single-use invites)
- `debited_role_id` - Role balance charged when the invite was created
- `active` - Whether the invite is still active on Discord
- `deletion_requested_at` - Durable marker used to finish an interrupted
  deletion and refund exactly once
- `created_at` - Invite creation timestamp

### JoinTracking
Records member joins via tracked invites.
- `invite_id` - Reference to Invite document
- `guild_id` - Discord server ID
- `joined_user_id` - ID of user who joined
- `joined_at` - Join timestamp

## How It Works

### Role-Based Invite System
1. Administrator configures roles with invite limits using `/setrole`
2. When a member receives a configured role, they automatically get the specified invite allocation
3. If a member has multiple configured roles, they receive invites for each role
4. Members with Administrator permission automatically get unlimited invites
5. Finite credits persist when roles are removed; unlimited sentinel records
   are removed with their granting role

### Invite Creation and Usage
1. Members use `/createinvite` to generate a single-use invite link
2. The invite consumes one credit from their balance
3. When someone joins using the invite, the bot tracks who created it
4. The new member receives the default role if one is configured
5. Join is logged to the designated logs channel

### Invite Deletion
1. Members can delete their invites using `/deleteinvite`
2. The deletion intent is recorded before the Discord invite is removed
3. The database record becomes inactive; interrupted finalization is retried
   by the invite event or the next `/invites` refresh
4. One credit is refunded to the exact finite role balance originally charged

## Error Handling

The bot includes comprehensive error handling:

- **Permission Checks** - Validates bot and user permissions before operations
- **Setup Validation** - Ensures server is properly configured before command execution
- **Database Errors** - Graceful handling of connection issues and query failures
- **Discord API Errors** - Proper handling of rate limits and API failures
- **Concurrent Operations** - Atomic updates and MongoDB transactions prevent
  race conditions and partial multi-record changes
- **Channel Access** - Validates bot can access required channels
- **Graceful Shutdown** - Proper cleanup of database connections and bot client

All errors are logged to both console and log files for debugging.

## Logging

The bot maintains comprehensive logs:

- **File Logs** - Timestamped text logs with structured JSON metadata stored in
  `logs/`
- **Channel Logs** - Important events posted to designated logs channel
- **Automatic Cleanup** - Old log files automatically deleted after retention period
- **Event Types** - Setup, invite creation/usage/deletion, role changes, errors, and more

## Support

For support:

1. Check existing issues on GitHub
2. Create a new issue with detailed information including:
   - Bot version
   - Error messages from logs
   - Steps to reproduce the issue
   - Server configuration

## Security and Permissions

- All administrative commands require Administrator permission
- Default invite roles are validated against Discord permissions, managed-role
  restrictions, and the bot's role hierarchy
- Invite limits are strictly enforced with atomic database operations
- User permissions validated before each operation
- Sensitive operations logged for audit trail
- No data is shared between servers
