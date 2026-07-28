# Repository Guidance

## Scope and authority

- This file applies to the entire repository.
- Follow explicit user instructions over this file. When requirements conflict
  or remain materially ambiguous, identify the conflict instead of guessing.
- Reading files, editing in-scope local files, and running non-destructive local
  checks are authorized for implementation requests. External writes,
  destructive actions, credential use, live deployment, and material scope
  expansion require explicit authorization.

## Project snapshot

- This is a single-package CommonJS Discord bot.
- Runtime: Node.js 24.17.0 or newer.
- Direct dependencies: discord.js 14.27.0, Mongoose 9.8.1, and dotenv 17.4.2.
- Persistence: MongoDB through Mongoose.
- `npm start` deploys application commands before starting the bot.
- `npm run deploy` registers application commands with Discord.
- No test, lint, format, or build script is currently defined.

## Repository map

- `src/index.js`: environment loading, Discord client construction, command and
  event loading, invite-cache initialization, interaction dispatch, startup,
  and shutdown.
- `src/deploy-commands.js`: guild or global slash-command registration.
- `src/commands/`: slash-command definitions and handlers.
- `src/events/`: guild-member join attribution and role-change handling.
- `src/models/schemas.js`: guild-scoped Mongoose schemas and indexes.
- `src/database/`: MongoDB connection lifecycle.
- `src/utils/`: invite cache, user initialization, setup checks, requirements,
  constants, and logging.
- `Dockerfile` and `entrypoint.sh`: container runtime and shutdown behavior.

## Source-of-truth protocol

Never guess library, framework, API, CLI, or cloud-service behavior.

Use evidence in this order:

1. Repository requirements, current code contracts, and explicitly pinned
   sources.
2. Official documentation for the exact dependency or API version.
3. The exact installed package's public exports, type declarations, and source.
4. A minimal executable reproduction or focused test.
5. If evidence is missing or contradictory, stop and report what could not be
   verified.

Context7 is optional. For discord.js 14.27.0, use
`/websites/discord_js_packages_discord_js_14_27_0`. If Context7 is unavailable
or quota-limited, immediately use the official links below; do not block the
task and do not fall back to memory.

Search snippets, forum answers, generated summaries, and unversioned examples
are discovery aids only. Do not depend on undocumented package internals when a
supported public API exists.

### Canonical documentation

- discord.js 14.27.0 API:
  <https://discord.js.org/docs/packages/discord.js/14.27.0>
- discord.js guide: <https://discordjs.guide/>
- Discord Developer Platform: <https://docs.discord.com/developers/intro>
- Mongoose: <https://mongoosejs.com/docs/>
- MongoDB manual: <https://www.mongodb.com/docs/manual/>
- Node.js 24 API: <https://nodejs.org/docs/latest-v24.x/api/>
- dotenv: <https://github.com/motdotla/dotenv>
- Official Node Docker image: <https://hub.docker.com/_/node>

The pinned discord.js API governs wrapper syntax and exports, while Discord's
developer documentation governs platform behavior such as intents, events,
interactions, permissions, and rate limits.

## Non-negotiable project invariants

- Every guild-scoped database filter and mutation includes `guild_id`.
- `invites_remaining === -1` means unlimited. Never decrement, refund, clamp,
  or treat it as a finite balance.
- Invite-credit mutations remain atomic under concurrent command handling.
- Multi-step Discord/database operations define failure and compensation
  behavior so credits, invites, cache entries, and database records cannot
  silently diverge.
- A Discord interaction is acknowledged once. Choose `reply`, `deferReply`,
  `editReply`, or `followUp` from its actual `deferred` and `replied` state.
- Slash-command default permissions do not replace runtime authorization,
  effective bot-permission checks, or Discord role-hierarchy checks.
- Invite-cache changes preserve join attribution, including the fact that a
  one-use invite may disappear after use.
- Command definitions, deployment serialization, help text, and README command
  descriptions remain synchronized.
- User-visible errors are safe. Never expose tokens, connection strings,
  environment contents, or sensitive Discord/MongoDB payloads.

## Implementation conventions

- Follow adjacent CommonJS and module-export patterns.
- Prefer the smallest coherent change; do not perform unrelated refactors.
- Do not change dependency versions or module systems without an explicit
  request and version-specific migration sources.
- Preserve public command names, option names, schema field names, index
  semantics, and environment-variable names unless the request includes a
  coordinated migration.
- Use `guild_id` in every relevant Mongoose filter, including update/delete
  paths.
- For `findOneAndUpdate` or related changes, verify return-document,
  validator, upsert, and atomicity semantics against Mongoose 9.8.1 docs.
- Validate permission-sensitive Discord operations against both discord.js
  14.27.0 and Discord platform documentation.

## Validation

Before claiming completion:

1. Inspect `package.json` and run `npm run` before citing available scripts.
2. Run `node --check <file>` for every changed JavaScript file.
3. Run the narrowest relevant automated checks if a test harness is present or
   added by the requested work.
4. Run `git diff --check` and review the full scoped diff.
5. Report exactly which checks ran and which live integrations did not run.

Do not use `npm start` as a generic test: it registers commands before logging
the bot into Discord. Do not use `npm run deploy`, live Discord credentials, or
live MongoDB as validation unless the user explicitly authorizes that external
effect. Never claim Discord or MongoDB integration coverage from syntax checks
alone.

## Secrets and generated state

- Do not read or print `.env` values. Use `.env.example` for variable names.
- Do not commit `.env`, logs, credentials, tokens, connection strings, or
  runtime-generated data.
- Do not alter or delete live guild, invite, role, user, or database state
  unless that exact mutation is requested and authorized.

## Definition of done

- The requested behavior and relevant failure paths are addressed.
- Guild isolation, invite accounting, interaction lifecycle, permissions,
  cache consistency, and secret handling remain correct.
- Relevant local checks pass and unrun live checks are disclosed.
- The scoped diff contains no accidental dependency, generated-file, or
  unrelated changes.
- User-visible command, setup, permission, environment, or operational changes
  are reflected in README and help text where applicable.
- If an implementation change causes `AGENTS.md` or `README.md` to drift from
  the repository, flag the drift and update the affected file in the same
  change without requesting separate permission.
