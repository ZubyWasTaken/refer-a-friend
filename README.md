# Refer-a-Friend

A Discord bot for managing server invites through a role-based permission system. Control who can create invites, track invite usage, and automatically assign roles to new members.

## Features

### Role-Based Invite System
- Configure invite limits per role (specific number or unlimited)
- Automatic invite allocation when members receive configured roles
- Support for multiple roles with different invite limits per user
- Administrators automatically receive unlimited invites
- Invite limits persist across role changes

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
  - Automatically refunds one invite to your balance
  - Removes invite from Discord and database

- `/help` - Display command list and descriptions
  - Shows all commands available to you
  - Administrators see additional admin commands

## Setup

### Prerequisites
- Node.js (v16.9.0 or higher)
- MongoDB database (local or cloud instance)
- Discord Bot Application with necessary permissions and intents enabled

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
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
   APPLICATION_ID=your_application_id
   GUILD_ID=your_guild_id
   MONGODB_URI=your_mongodb_connection_string
   ```

   **Environment Variables:**
   - `BOT_TOKEN` - Your Discord bot token from the Developer Portal
   - `CLIENT_ID` - Your Discord application's client ID
   - `APPLICATION_ID` - Your Discord application ID (usually same as client ID)
   - `GUILD_ID` - Server ID for testing (optional, for development)
   - `MONGODB_URI` - MongoDB connection string

4. Deploy slash commands and start the bot:
   ```bash
   npm start
   ```

### First-Time Server Setup

After adding the bot to your Discord server:

1. Ensure the bot has all required permissions (see below)
2. Set up a system messages channel in Server Settings > Overview
3. Enable "Show Join Messages" for the system messages channel
4. Run `/setup` in your server to configure the bot
5. Use `/setrole` to configure which roles can create invites

## Required Bot Permissions

The bot requires the following permissions to function properly:

- **View Audit Log** - Track invite usage
- **Manage Server** - Required for invite management
- **Manage Roles** - Assign default roles to new members
- **Manage Channels** - Access channel configurations
- **Create Instant Invite** - Generate invite links
- **View Channels** - Access server channels
- **Send Messages** - Send responses and logs
- **Send Messages in Threads** - Thread support
- **Embed Links** - Format log messages
- **Read Message History** - Context for commands
- **Use Application Commands** - Slash command functionality

## Required Gateway Intents

Enable these intents in the Discord Developer Portal under Bot settings:

- **Server Members Intent** - Track member joins and role changes
- **Guild Invites Intent** - Monitor invite creation and usage
- **Guilds Intent** - Access server information

Note: Message Content Intent is not required for this bot.

## Database Schema

The bot uses MongoDB with the following collections:

### ServerConfig
Stores server-specific configuration settings.
- `guild_id` - Discord server ID
- `logs_channel_id` - Channel for bot logs
- `bot_channel_id` - Channel where bot commands can be used
- `system_channel_id` - Server's system messages channel
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
Tracks all active invite links created through the bot.
- `user_id` - Creator's Discord user ID
- `guild_id` - Discord server ID
- `link` - Full invite URL
- `invite_code` - Short invite code
- `max_uses` - Maximum uses (always 1 for single-use invites)
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
5. Invite balances persist even if roles are changed or removed

### Invite Creation and Usage
1. Members use `/createinvite` to generate a single-use invite link
2. The invite consumes one credit from their balance
3. When someone joins using the invite, the bot tracks who created it
4. The new member receives the default role if one is configured
5. Join is logged to the designated logs channel

### Invite Deletion
1. Members can delete their invites using `/deleteinvite`
2. The invite is removed from both Discord and the database
3. One invite credit is automatically refunded to the creator

## Error Handling

The bot includes comprehensive error handling:

- **Permission Checks** - Validates bot and user permissions before operations
- **Setup Validation** - Ensures server is properly configured before command execution
- **Database Errors** - Graceful handling of connection issues and query failures
- **Discord API Errors** - Proper handling of rate limits and API failures
- **Concurrent Operations** - Atomic database operations prevent race conditions
- **Channel Access** - Validates bot can access required channels
- **Graceful Shutdown** - Proper cleanup of database connections and bot client

All errors are logged to both console and log files for debugging.

## Logging

The bot maintains comprehensive logs:

- **File Logs** - JSON-formatted logs stored in `logs/` directory
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
- Bot respects Discord's role hierarchy
- Invite limits are strictly enforced with atomic database operations
- User permissions validated before each operation
- Sensitive operations logged for audit trail
- No data is shared between servers