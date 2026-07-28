# Multi-Server Web Dashboard Design

Date: 2026-07-28

Status: Approved for implementation planning

## Summary

Add an authenticated multi-server web dashboard to Refer-a-Friend. The
dashboard will run in the same Node.js process and Docker container as the
Discord bot. It will become the primary surface for server configuration,
member credit administration, invite oversight, and referral history, while
Discord retains a smaller set of convenient user and read-only administrator
commands.

The selected frontend stack is Vite, React, and TypeScript with TanStack
Router, TanStack Query, and TanStack Table. Fastify will expose a same-origin
JSON API, handle Discord OAuth2, and serve the compiled frontend. The existing
bot backend remains CommonJS.

The default visual direction is "Midnight utility": a dense, low-glare dark
interface with restrained color, strong alignment, real tables and lists,
subtle borders, and no decorative dashboard filler. Light and system themes
will use the same semantic token system.

## Goals

- Support every guild shared by the authenticated Discord user and the bot.
- Let regular members view balances, create and delete tracked invites, and
  see their successful referral history.
- Let Discord administrators complete all setup and management tasks on the
  website.
- Preserve one-use, non-expiring invites that consume one invite credit.
- Use one administrator-configured invite destination channel per guild.
- Keep selected quick actions available as Discord slash commands.
- Run the bot, API, OAuth flow, and production frontend in one Node.js process
  and one container.
- Reuse one set of domain services from both HTTP routes and Discord commands.
- Preserve guild isolation, atomic credit accounting, exact refunds, invite
  attribution, Discord permission checks, and compensation behavior.
- Provide optimistic, in-place UI updates without document reloads, blank
  screens, or route resets.
- Establish a deliberate product UI that does not look like a generic
  generated dashboard or imitate Discord's application chrome.

## Non-Goals

- Splitting the bot and website into separate containers or deployable
  services.
- Server-side rendering, TanStack Start, Astro, or a public content site.
- Variable invite expiry, multiple uses, or configurable credit cost.
- Custom website-manager roles in the first release; Discord Administrator
  remains the management boundary.
- WebSockets in the first release.
- A client-first replicated database, TanStack DB, or offline mutations.
- Replacing the existing CommonJS bot backend with TypeScript or ESM.
- Redesigning unrelated bot behavior.

## Current Repository Findings

The repository is a single-package CommonJS Discord bot using discord.js
14.27.0, Mongoose 9.8.1, MongoDB transactions, and Node.js 24.17.0 or newer.

The current command surface contains:

- Member commands: `/invites`, `/createinvite`, `/deleteinvite`, and `/help`.
- Administrator setup/configuration commands: `/setup`, `/changedefaults`,
  `/setrole`, `/unsetrole`, and `/currentconfig`.
- Administrator member-management commands: `/checkinvites`, `/addinvites`,
  and `/removeinvites`.
- Destructive administrator command: `/reset`.

Important existing behavior that must be retained:

- Every guild-scoped database operation includes `guild_id`.
- `invites_remaining === -1` is an unlimited capability, not a finite balance.
- Finite credits persist after their granting Discord role is removed.
- Unlimited access ends when the granting role is removed.
- Administrators have runtime-unlimited access without database sentinel
  records.
- Invite creation consumes credit atomically before creating the Discord
  invite and compensates Discord or database failures.
- Deletion records intent before deleting the Discord invite, refunds the
  exact debited role, and can be finalized by the invite event or a later
  reconciliation.
- One-use invites may disappear before `guildMemberAdd`, so the recent-deletion
  cache participates in join attribution.
- Default-role assignment is independent of referral logging failures.
- The current test suite contains 41 passing local tests.

The current `/createinvite` creates the invite on
`interaction.channel`. Because requirements constrain user commands to the
configured bot-command channel, that channel is also the current invite
destination. A website request has no Discord channel context, so destination
must become an explicit guild setting.

## Chosen Architecture

Production runs one Node.js process:

```text
src/index.js
├── MongoDB connection and indexes
├── discord.js gateway client and event handlers
├── Fastify HTTP server
│   ├── /auth/*
│   ├── /api/v1/*
│   ├── /health/live
│   ├── /health/ready
│   └── compiled Vite assets and SPA fallback
└── shared domain services
    ├── guild access and authorization
    ├── guild configuration
    ├── invite lifecycle
    ├── role allocations
    ├── credit adjustments
    ├── referral queries
    ├── audit history
    └── server reset
```

Fastify and Discord commands receive the same service instances. HTTP routes
must not implement parallel Mongoose or Discord workflows. Commands retain
interaction acknowledgement and Discord response formatting, while services
own validation, data mutations, Discord side effects, compensation, cache
updates, and safe structured outcomes.

The frontend source will live under `web/`. Vite compiles it during the
container build. Fastify serves the compiled assets in production. Local
development may use Vite's development server with `/api` and `/auth` proxied
to Fastify; the production container does not run Vite as a server.

## Startup and Shutdown

Startup order:

1. Load and validate environment configuration.
2. Connect to MongoDB and verify required indexes.
3. Construct the Discord client and shared services.
4. Log the bot into Discord and wait until guild state is usable.
5. Construct and start Fastify.
6. Mark readiness healthy.

`/health/live` reports that the HTTP process is running. `/health/ready`
reports success only when MongoDB, Discord, and Fastify are ready to serve
authenticated dashboard requests.

Shutdown is idempotent and ordered:

1. Stop accepting new HTTP requests and finish bounded in-flight work.
2. Close Fastify.
3. Destroy the Discord client.
4. Close Mongoose.
5. Exit with the appropriate status.

Failure of a required startup component prevents the website from accepting
traffic. An uncaught fatal error invokes the same shutdown path.

## Authentication and Session Design

Discord OAuth2 uses the authorization-code flow with `identify` and `guilds`
scopes.

Login flow:

1. `GET /auth/login` generates a cryptographically random OAuth `state`.
2. The state is bound to the initiating browser with a short-lived,
   `HttpOnly`, `Secure`, `SameSite=Lax` cookie and expires after ten minutes.
3. Discord redirects to the exact registered callback URI.
4. `GET /auth/callback` validates `state` using a constant-time comparison.
5. Fastify exchanges the code for a Discord access token using a
   form-encoded server-side request.
6. Fastify fetches `/users/@me` and `/users/@me/guilds`.
7. The application creates its own session containing the Discord identity
   snapshot and login-time guild IDs.
8. Discord access and refresh tokens are discarded.

The browser receives a cryptographically random, opaque session identifier.
MongoDB stores only its hash. Session records contain:

- Discord user ID.
- Display name, username, and avatar snapshot.
- Login-time Discord guild IDs.
- Session-bound CSRF material.
- Creation and expiry timestamps.

Sessions expire after 24 hours and use a TTL index. Production cookies use the
`__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/` with no
`Domain` attribute. Logout deletes the server-side session, expires the cookie,
and clears all TanStack Query data.

Logging in again refreshes the server list. The application does not retain
Discord user bearer tokens merely to refresh guild metadata.

## Guild Authorization

OAuth guild membership is discovery data, not authorization for a sensitive
request.

Every guild-scoped API request:

1. Requires a valid application session.
2. Confirms the route guild appeared in the login-time OAuth guild snapshot.
3. Confirms the bot is currently in the guild.
4. Fetches or resolves the requesting user as a live guild member.
5. Recalculates the member's current Discord permissions and roles.
6. Requires Discord Administrator for administrator routes.
7. Applies member eligibility and credit rules to invite mutations.
8. Includes `guild_id` in every database filter and mutation.

The server selector displays only the intersection of the session guild list
and the bot's current guilds. A guild can be displayed as configured,
requiring setup, unavailable to the bot, or no longer accessible. The API is
authoritative even when a stale browser view still displays a guild.

Regular members may access only their own balance, invite records, and
referral history. Hiding administrator navigation is presentation only and
never substitutes for API authorization.

## Web Security

- The production UI and API are same-origin.
- Cross-origin credentialed API access is not enabled.
- State-changing routes accept JSON and reject unexpected simple content
  types.
- A session-bound CSRF token is returned through authenticated application
  bootstrap data and sent in a custom header.
- Mutations validate the CSRF token, configured target origin, `Origin` or
  `Referer`, and Fetch Metadata where available.
- Safe HTTP methods never mutate state.
- Security headers include an explicit Content Security Policy,
  `frame-ancestors`, content-type protection, and a conservative referrer
  policy.
- Authentication, invite creation, credit adjustments, and reset have
  separate rate limits.
- Session cookies, OAuth state, tokens, connection strings, and raw
  third-party payloads are excluded from all logs and audit metadata.
- Invite URLs are excluded from file logs and `AuditEvent`. The existing
  configured Discord logs channel may continue to show an invite URL as an
  explicit administrator-visible product behavior.
- User-facing errors never contain stack traces or environment details.
- Trusted proxy behavior is explicit and disabled by default.

## Frontend Architecture

The frontend is a Vite-built React TypeScript SPA.

Selected TanStack libraries:

- TanStack Router for file-based, type-safe nested routing, route parameters,
  search parameters, route context, code splitting, and error boundaries.
- TanStack Query for server-state caching, cancellation, optimistic mutations,
  rollback, background reconciliation, and focus-aware updates.
- TanStack Table for headless member, invite, referral, and audit tables.

Deferred libraries:

- TanStack Form: current forms do not justify a second form abstraction.
- TanStack Virtual: cursor pagination keeps rendered tables bounded.
- TanStack DB: beta and unnecessary for a server-authoritative API.
- TanStack Start: conflicts with the selected Fastify architecture.
- TanStack Store, Pacer, Hotkeys, and other alpha/beta packages: no current
  requirement.

TanStack Devtools may be enabled in local development and must not ship in the
production bundle.

### Routing

```text
/
├── login
└── app
    ├── select-server
    └── $guildId
        ├── overview
        ├── invites
        ├── referrals
        └── admin
            ├── members
            ├── role-allocations
            ├── settings
            ├── activity
            └── danger-zone
```

The router context contains the Query client and the current session
bootstrap. Route guards control navigation and user experience, while
Fastify independently enforces access.

Route loaders call `queryClient.ensureQueryData`. Components subscribe to the
same cache. URL search parameters represent member search, filters, sorting,
and cursors so administrative list views are bookmarkable and restorable.

Every query key begins with the guild:

```text
["guild", guildId, "overview"]
["guild", guildId, "invites", filters]
["guild", guildId, "members", search, cursor, sort]
["guild", guildId, "config"]
```

This prevents data collisions between guilds. Query helpers centralize key
construction so invalidation cannot accidentally target another guild.

### No-Refresh Interaction Model

The application never calls `window.location.reload()` after an action.
Mutations do not reset navigation, blank the page, or replace existing content
with a full-page spinner.

- Invite creation renders a pending row, then inserts the canonical returned
  invite and balance.
- Invite deletion removes the row optimistically, snapshots the previous
  cache, and restores it with an inline error if deletion fails.
- Settings and role allocation changes update returned records in place.
- Member credit changes update the member row, detail data, and summary
  together.
- Pending state is scoped to the initiating control or row.
- Background verification never discards visible cached data.
- On-focus or low-frequency active-page reconciliation may update external
  Discord changes without a document refresh.
- Requests are cancelled when route context changes so stale guild responses
  cannot overwrite the active guild.

No optimistic UI may claim that Discord created a usable invite before the API
returns its URL.

## Visual and Interaction Design

The selected shell uses a compact workspace rail and a section sidebar. It is
an original multi-workspace pattern, not a copy of Discord's client.

Desktop:

- A narrow workspace rail establishes the active guild.
- A secondary sidebar separates member navigation from administrator tools.
- The main pane uses a compact title bar, page header, controls, and real
  tables or settings sections.

Mobile and narrow widths:

- The workspace rail becomes a guild selector.
- The secondary sidebar becomes a labelled navigation drawer.
- Tables expose essential columns and move secondary fields into a row detail
  sheet.

The default theme is Midnight utility:

- Near-black rail.
- Dark graphite sidebar and canvas.
- Slightly elevated panels differentiated by borders, not heavy shadows.
- Restrained indigo for primary actions and focus, not large surfaces.
- Green, amber, and red reserved for semantic state.
- System UI typography for body text.
- Monospaced typography only for invite codes and technical identifiers.
- Compact density with consistent 4/8 pixel spacing increments.
- Five to eight pixel control radii; larger radii only for dialogs.

The implementation will start from these approved directional tokens and
adjust them only as needed to pass contrast validation:

```text
rail       #0b0d11
sidebar    #17191f
canvas     #111318
panel      #15171c
border     #2a2d35
text       #edf0f5
muted      #9aa0aa
accent     #6974e8
```

The light and system themes use the same semantic tokens rather than separate
component styling.

The UI deliberately avoids:

- Gradients and glowing backgrounds.
- Glassmorphism.
- Giant marketing headings inside the application.
- Excessive rounded cards and pill-shaped controls.
- Decorative charts without a real user decision.
- Emoji as navigation or status icons.
- A grid of isolated metric cards when a compact summary strip is clearer.
- Generic filler copy, fake trends, or invented analytics.
- Copying Discord marks, type, color combinations, or application chrome.

Interaction requirements:

- Visible hover, active, disabled, pending, error, and focus states.
- Keyboard access to every action.
- Logical focus return after dialogs and row deletion.
- Focus enters confirmation dialogs and returns to the invoking control.
- Reduced-motion support.
- Short functional transitions only; no decorative page animations.
- Destructive actions use explicit wording and never depend on color alone.
- Toasts supplement, but do not replace, persistent inline error state when a
  row or form needs correction.

## Product Surface

### Regular Member Website

- Guild selector.
- Aggregate remaining balance and unlimited status.
- Per-role balance contribution.
- Create a one-use, non-expiring invite for the configured destination.
- List and copy active links.
- Delete an owned active invite.
- Referral history showing joined member, invite, and timestamp.
- Clear explanation when the member is in the guild but lacks invite
  eligibility.

### Administrator Website

- Setup wizard for unconfigured guilds.
- Configuration and bot-permission health.
- Logs channel.
- Bot-command channel.
- Invite destination channel.
- Default role for tracked joins.
- Role allocation list with finite or unlimited values.
- Role allocation create/update/remove and member synchronization.
- Searchable member list with balances, active links, and referral totals.
- Finite credit adjustments.
- Server-wide invite and referral views.
- Durable administrator activity history.
- Reset danger zone with typed guild name, a short-lived server challenge,
  and a final confirmation.

### Discord Commands Kept

- `/invites`
- `/createinvite`
- `/deleteinvite`
- `/help`
- `/checkinvites`
- `/currentconfig`
- New `/dashboard`, returning an ephemeral link to the website

`/createinvite` changes from the interaction channel to the configured invite
destination channel.

### Discord Commands Retired After Parity

- `/setup`
- `/changedefaults`
- `/setrole`
- `/unsetrole`
- `/addinvites`
- `/removeinvites`
- `/reset`

The first dashboard release retains these commands with migration notices.
They are removed from definitions, deployment, help, and README only after one
release of verified website parity.

## Domain Service Boundaries

### Guild Access Service

- Resolve current guild and member.
- Recalculate Discord permissions and roles.
- Expose member and administrator capabilities.
- Reject stale or cross-guild access.

### Guild Configuration Service

- Load setup state.
- Validate channels belong to the guild and are usable.
- Validate effective bot permissions on logs, command, and invite channels.
- Validate default-role hierarchy, editability, and integration-management
  restrictions.
- Apply setup and settings changes.

### Invite Service

- Initialize current role allocations.
- Calculate balance and eligibility.
- List and reconcile active invites.
- Create Discord invites and persist records.
- Delete Discord invites and finalize exact refunds.
- Update the shared invite cache.
- Preserve recent-deletion attribution.
- Return safe, interface-neutral outcomes.

### Role Allocation Service

- List configured guild roles.
- Create or update finite/unlimited allocations.
- Synchronize member allocation records transactionally.
- Remove configurations while preserving finite-credit semantics and removing
  unlimited capability records.

### Credit Service

- Calculate finite and unlimited balances.
- Add credits atomically to a finite record.
- Remove credits across finite records transactionally.
- Prevent underflow and mutation of unlimited capability.

### Referral Service

- Query owned referral history.
- Query administrator server-wide history.
- Join safe Discord display data without exposing records from another guild.

### Reset Service

- Validate a single-use reset challenge.
- Fetch and delete tracked Discord invites.
- Clear guild-scoped MongoDB data transactionally after Discord work reaches a
  defined state.
- Preserve explicit reporting for partial Discord deletion.
- Remove guild cache state.

### Audit Service

- Record actor, guild, source, action, target type and identifier, safe
  allow-listed metadata, outcome, request ID, and timestamp.
- Never store tokens, cookies, connection strings, full third-party payloads,
  or invite URLs.
- Audit failure is logged as an operational error. Database-only admin
  mutations include audit persistence in the same transaction where practical.

## Data Model Changes

### `ServerConfig`

Add `invite_channel_id`.

Existing records use `invite_channel_id ?? bot_channel_id` during migration.
The website identifies this fallback state. The next administrator settings
save writes an explicit destination. New setup requires the field.

### `WebSession`

- `token_hash`, unique.
- Discord identity snapshot.
- Login-time guild IDs.
- CSRF material.
- `created_at`.
- `expires_at`, TTL indexed.

### `AuditEvent`

- `guild_id`.
- `actor_user_id`.
- `source`.
- `action`.
- Safe target type and identifier.
- Allow-listed metadata.
- `outcome`.
- `request_id`.
- `created_at`.

Index by `guild_id` and descending creation order. The first release retains
audit records without automatic expiry.

### `MutationReceipt`

Used for non-idempotent website operations:

- `guild_id`.
- `actor_user_id`.
- `action`.
- `idempotency_key`.
- `status`: pending, succeeded, or failed.
- Safe resulting resource reference.
- Safe result summary or stable error code when needed to reproduce the
  original response.
- `created_at`.
- `expires_at`, TTL indexed for 24 hours.

Unique index:

```text
guild_id + actor_user_id + action + idempotency_key
```

Invite creation, credit adjustment, and reset use durable receipts. A duplicate
request returns the original result, reports that processing is in progress,
or returns the recorded safe failure without performing the mutation twice.

### `JoinTracking`

Enforce one join per single-use invite with a unique guild-scoped invite index.
The event handler writes with an idempotent upsert. Migration must inspect and
resolve any duplicate legacy rows before creating the unique index.

### Existing Models

Keep public names and semantics for `User`, `Invite`, `Role`, and
`ServerConfig`. Do not reinterpret the unlimited sentinel or remove the fields
that support deletion recovery and exact-role refunds.

## API Contract

All JSON endpoints are under `/api/v1`. Successful responses use:

```json
{
  "data": {},
  "meta": {}
}
```

`meta` is omitted when not needed.

Safe errors use:

```json
{
  "error": {
    "code": "INSUFFICIENT_INVITE_CREDITS",
    "message": "You do not have any invites remaining.",
    "requestId": "request-id"
  }
}
```

Validation errors may add field errors. Error codes are stable application
contracts; messages remain user-safe.

### Session and Guild Discovery

- `GET /api/v1/session`
- `GET /api/v1/guilds`
- `POST /auth/logout`

### Member Routes

- `GET /api/v1/guilds/:guildId/overview`
- `GET /api/v1/guilds/:guildId/invites`
- `POST /api/v1/guilds/:guildId/invites`
- `DELETE /api/v1/guilds/:guildId/invites/:inviteId`
- `GET /api/v1/guilds/:guildId/referrals`

### Administrator Routes

- `GET /api/v1/guilds/:guildId/admin/config`
- `PATCH /api/v1/guilds/:guildId/admin/config`
- `GET /api/v1/guilds/:guildId/admin/role-allocations`
- `PUT /api/v1/guilds/:guildId/admin/role-allocations/:roleId`
- `DELETE /api/v1/guilds/:guildId/admin/role-allocations/:roleId`
- `GET /api/v1/guilds/:guildId/admin/members`
- `GET /api/v1/guilds/:guildId/admin/members/:userId`
- `POST /api/v1/guilds/:guildId/admin/members/:userId/credit-adjustments`
- `GET /api/v1/guilds/:guildId/admin/invites`
- `GET /api/v1/guilds/:guildId/admin/referrals`
- `GET /api/v1/guilds/:guildId/admin/audit-events`
- `POST /api/v1/guilds/:guildId/admin/reset-challenges`
- `POST /api/v1/guilds/:guildId/admin/reset`

Fastify JSON schemas validate parameters, queries, bodies, and responses before
or after service execution as appropriate.

List endpoints use stable cursor pagination. Cursor ordering includes a
timestamp plus `_id`. Member search, sorting, and pagination are server-side;
TanStack Table renders and controls the current view but never treats an
incomplete page as the entire guild.

## Core Operation Flows

### Invite Creation

1. Authorize the live guild member.
2. Claim the idempotency receipt.
3. Load setup and explicit/fallback invite destination.
4. Validate destination type and effective bot permissions.
5. Initialize allocation records for the member's current configured roles.
6. Calculate administrator/unlimited/finite access.
7. Atomically consume one finite credit when required.
8. Create a Discord invite with `maxAge: 0`, `maxUses: 1`, and `unique: true`.
9. Persist the invite with guild, owner, code, URL, debited role, and active
   state.
10. Update cache, audit, logs, and receipt.
11. Return the invite, updated balance, and summary.

If Discord creation fails, refund the consumed finite credit. If persistence
fails, mark planned deletion, remove the Discord invite, then refund. If
rollback or refund fails, log a critical allow-listed error and return the
specific safe degraded outcome.

### Invite Deletion

1. Authorize the owner within the guild.
2. Resolve the invite by stable record ID plus owner and guild.
3. Mark `deletion_requested_at`.
4. Mark the Discord deletion as planned.
5. Delete the Discord invite.
6. Finalize inactive state and exact finite refund transactionally.
7. Remove cache state and record audit/log outcome.

Unknown Discord invite handling and event/refresh reconciliation retain the
current no-duplicate-refund behavior.

### Configuration

The service fetches live guild channels, roles, bot member, and effective
permissions before saving. A configuration record cannot claim setup is
complete unless logs, command, and invite channels are valid and any default
role is assignable.

### Role Allocation

Set/update retains the current transactional member synchronization semantics.
Removing an allocation preserves finite balances and removes only unlimited
sentinel records associated with the removed unlimited role.

### Credit Adjustment

A positive or negative integer delta is authorized, idempotently claimed, and
applied through atomic/transactional balance helpers. It cannot mutate an
administrator or unlimited balance and cannot reduce a finite total below
zero.

### Reset

1. Create a ten-minute, single-use challenge bound to actor and guild.
2. Require the exact current guild name in the final request.
3. Recheck live Administrator permission.
4. Claim idempotency receipt.
5. Delete tracked Discord invites with planned-deletion markers.
6. Delete `User`, `Role`, `Invite`, `JoinTracking`, `AuditEvent`, and
   `ServerConfig` documents for the guild in a transaction.
7. Retain the minimum receipt needed to prevent immediate duplicate execution.
8. Clear guild invite cache.
9. Return a precise success or partial-failure result.

The UI never describes reset as reversible.

## Error Handling

HTTP status mapping:

- `400`: malformed or invalid input.
- `401`: absent or expired application session.
- `403`: no current membership, insufficient eligibility, or no current
  Administrator permission.
- `404`: guild or resource unavailable within the authorized scope.
- `409`: conflicting or already-processing mutation.
- `422`: valid input that cannot satisfy Discord configuration or hierarchy.
- `429`: rate limit.
- `503`: bot, Discord, or MongoDB temporarily unavailable.

Service errors are typed domain outcomes. Route handlers translate them to HTTP
and command handlers translate them to Discord responses. Neither adapter
parses error-message strings to infer behavior.

Request IDs correlate API responses, file logs, channel logs where suitable,
audit events, and mutation receipts.

## Testing Strategy

### Existing Backend

- Preserve all current regression tests.
- Continue syntax checking every changed CommonJS JavaScript file.
- Add focused tests before or with each extracted service.

### Domain Services

- Guild isolation for every filter and mutation.
- Unlimited and finite balance semantics.
- Concurrent credit consumption and adjustment.
- Invite creation compensation branches.
- Invite deletion and exact refund.
- Cache updates and one-use attribution.
- Role synchronization.
- Default-role permission/hierarchy validation.
- Reset success and partial Discord failure.
- Idempotency receipt duplicate and in-progress behavior.

### Fastify

Use the Fastify application-factory pattern and request injection without
binding a port:

- OAuth state success, mismatch, expiry, and replay.
- Session creation, lookup, expiry, logout, and cookie flags.
- CSRF, Origin, Fetch Metadata, content-type, and rate-limit behavior.
- Live guild membership and Administrator rechecks.
- Cross-guild resource denial.
- JSON schema validation.
- Safe error shapes and request IDs.
- Readiness behavior.
- SPA fallback does not capture `/api` or `/auth` errors.

### Frontend

- Router guild parameter and search parameter behavior.
- Authentication and setup redirects.
- Query-key guild isolation.
- Query cancellation on guild switches.
- Optimistic delete and rollback.
- Pending invite creation and canonical insertion.
- In-place balance, member, configuration, and role updates.
- No document reloads after mutations.
- TanStack Table server-side pagination/filter/sort state.
- Responsive rail/sidebar behavior.
- Keyboard navigation and focus restoration.
- Light, dark, system, high-contrast, and reduced-motion behavior.

### Browser-Level Flows

Use mocked Discord boundaries and isolated test data:

- Login and multi-guild selection.
- New-guild setup.
- Invite create/copy/delete.
- Referral-history update.
- Role allocation.
- Member credit adjustment.
- Reset challenge and confirmation.

Local checks do not claim live Discord or MongoDB integration coverage. Live
validation requires explicit authorization and dedicated test credentials.

## Container and Deployment

Use a multi-stage Docker build:

1. Build stage installs all dependencies and compiles `web/`.
2. Runtime stage installs production dependencies only.
3. Copy CommonJS backend source and compiled frontend assets.
4. Preserve the current non-root runtime behavior.
5. Expose one configurable HTTP port.
6. Run one Node.js process.

The production container does not use a process supervisor and does not run a
second Vite or Astro process.

Required existing environment variables remain:

- `BOT_TOKEN`
- `CLIENT_ID`
- `MONGODB_URI`

New required variables:

- `CLIENT_SECRET`
- `WEB_BASE_URL`
- `SESSION_SECRET`

New runtime variables with documented defaults:

- `HOST=0.0.0.0`
- `PORT=3000`
- trusted-proxy setting disabled by default

`GUILD_ID` remains an optional command-deployment scope for development.

The Discord Developer Portal must register the exact
`WEB_BASE_URL` OAuth callback. Production requires HTTPS at the public URL.

Update:

- `package.json` scripts and dependencies.
- `package-lock.json`.
- `.env.example`.
- `Dockerfile`.
- `entrypoint.sh` only if required for signal or port behavior.
- `README.md`.
- `/help` and `/dashboard`.
- command definitions and deployment tests.

## Proposed Repository Shape

Exact file names may be adjusted during implementation planning while
preserving these boundaries:

```text
src/
├── index.js
├── app/
│   ├── createBotClient.js
│   ├── createWebServer.js
│   └── lifecycle.js
├── auth/
│   ├── discordOAuth.js
│   ├── sessions.js
│   └── csrf.js
├── http/
│   ├── plugins/
│   ├── routes/
│   ├── schemas/
│   └── errors.js
├── services/
│   ├── guildAccessService.js
│   ├── guildConfigService.js
│   ├── inviteService.js
│   ├── roleAllocationService.js
│   ├── creditService.js
│   ├── referralService.js
│   ├── resetService.js
│   └── auditService.js
├── commands/
├── events/
├── models/
└── utils/

web/
├── src/
│   ├── routes/
│   ├── api/
│   ├── queries/
│   ├── components/
│   ├── features/
│   ├── styles/
│   └── main.tsx
├── index.html
├── tsconfig.json
└── vite.config.ts
```

## Rollout

1. Extract and test domain services without changing user-visible behavior.
2. Add invite-destination fallback and new database models/index migrations.
3. Add application composition, Fastify, OAuth, sessions, security, and API.
4. Add the Vite React TypeScript frontend and TanStack integrations.
5. Apply the approved Midnight utility design and responsive shell.
6. Change both website and `/createinvite` to the shared destination service.
7. Add `/dashboard` and update help/documentation.
8. Release with legacy administrator commands displaying migration notices.
9. Verify dashboard parity, compensation behavior, permission health, and
   production observability.
10. Remove retired administrator commands in the next coordinated release.

## Acceptance Criteria

- One production container runs one Node.js process for bot and website.
- Authenticated users see every guild shared with the bot and no others.
- Every guild API operation rechecks live Discord membership.
- Administrator API routes recheck live Discord Administrator permission.
- New setup requires an explicit invite destination.
- Existing setup falls back safely to the bot-command channel until saved.
- Both website and Discord invite creation use the same destination and domain
  service.
- Invites remain single-use, non-expiring, and cost one credit.
- Existing unlimited, finite, atomicity, compensation, attribution, and refund
  invariants remain correct.
- Members can manage their own invites and view their own referrals.
- Administrators can perform the entire approved configuration and management
  surface on the website.
- Optimistic actions update in place and roll back safely without document
  reloads.
- TanStack caches are isolated by guild.
- The default UI matches the approved Midnight utility direction and avoids
  the listed generic-dashboard patterns.
- Session, OAuth, CSRF, authorization, idempotency, and safe-error tests pass.
- Current regression tests remain passing.
- Docker, README, help, deployment serialization, and environment
  documentation are synchronized.
- Unrun live Discord and MongoDB checks are reported explicitly.

## Research Basis

- Discord OAuth2:
  <https://docs.discord.com/developers/topics/oauth2>
- Discord user and guild discovery:
  <https://docs.discord.com/developers/resources/user>
- Discord channel invite creation:
  <https://docs.discord.com/developers/resources/channel>
- Discord permissions:
  <https://docs.discord.com/developers/topics/permissions>
- Discord brand guidelines:
  <https://discord.com/branding>
- Vite backend integration:
  <https://vite.dev/guide/backend-integration.html>
- Fastify documentation:
  <https://fastify.dev/docs/latest/>
- React documentation:
  <https://react.dev/>
- TanStack libraries:
  <https://tanstack.com/libraries>
- TanStack Router:
  <https://tanstack.com/router/latest/docs/framework/react/overview>
- TanStack Query optimistic updates:
  <https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates>
- TanStack Table:
  <https://tanstack.com/table/latest>
- Linear UI redesign:
  <https://linear.app/now/how-we-redesigned-the-linear-ui>
- Shopify Polaris index filters:
  <https://polaris-react.shopify.com/components/selection-and-input/index-filters>
- Shopify Polaris index table:
  <https://polaris-react.shopify.com/components/tables/index-table>
- GitHub Primer:
  <https://primer.style/>
- Primer focus management:
  <https://primer.style/accessibility/design-guidance/focus-management/>
- OWASP session management:
  <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- OWASP CSRF prevention:
  <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>
