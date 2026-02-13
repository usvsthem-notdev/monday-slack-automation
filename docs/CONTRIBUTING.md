# Contributing Guide

## Dev Setup

```bash
git clone https://github.com/usvsthem-notdev/monday-slack-automation.git
cd monday-slack-automation
npm install
cp .env.example .env
# Fill in MONDAY_API_KEY, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET
npm run dev
```

## Running Tests

```bash
npm test                 # run all tests
npm run test:watch       # watch mode
npm run test:coverage    # with coverage report (must be ≥ 80%)
```

## Test Requirements

- Every new command or webhook handler must have unit tests
- New utility functions must have property-based tests using `fast-check`
- All commands must call `ack()` synchronously — test this explicitly
- Coverage must remain ≥ 80% on all metrics after your change

## Commit Format

```
<type>(<scope>): <description>

Types: feat | fix | refactor | test | docs | chore | ci
Scope: asyncQueue | cache | webhook | commands | utils | ci | docs

Examples:
  feat(commands): add /status command
  fix(webhook): handle empty people column value
  test(asyncQueue): add DLQ persistence property tests
  chore: update dependencies
```

## Adding a New Slack Command

1. Create handler in `src/slackCommands.js` or a new `src/<name>Command.js`
2. Register in `src/unified-server.js` via `initializeSlackCommands()`
3. Call `ack()` synchronously at the top of the handler
4. Use `asyncQueue.add()` for all async work
5. Add unit tests in `src/__tests__/<name>Command.test.js`
6. Document in `docs/API_REFERENCE.md`

## Adding a New Webhook Event

1. Add event type handling in `src/webhookHandler.js`
2. Only process `people` column changes for assignment events
3. Return 200 immediately; process async
4. Add tests in `src/__tests__/webhookHandler.test.js`

## Cache Patterns

Use `cacheManager.cache.wrap()` for all API calls:

```js
const { cache } = require('./utils/cacheManager');

const boards = await cache.wrap(
  cache.generateKey('mondayBoards', { workspaceId }),
  () => fetchBoardsFromAPI(workspaceId)
);
```

Do NOT create local `boardsCache` or `usersCache` objects.
