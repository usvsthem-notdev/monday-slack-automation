# Architecture Diagrams

## v6.0 Unified Server Architecture

### High-Level System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Slack Workspace                        │
│                                                               │
│  👤 Users                                                      │
│   │                                                           │
│   ├─ /tasks ─────────────────┐                               │
│   ├─ /create-task ────────────┤                               │
│   ├─ /quick-task ─────────────┤ Slash Commands               │
│   ├─ /monday-help ────────────┤                               │
│   └─ /task-complete ──────────┘                               │
│                                                               │
│  🔘 Interactive Components                                     │
│   ├─ Mark Complete buttons                                    │
│   ├─ Update Task modals                                       │
│   ├─ Postpone actions                                         │
│   └─ View Details                                             │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     │ HTTPS (Instant ACK)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              🚀 Unified Server (v6.0)                        │
│              unified-server.js                               │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           Express Receiver + Slack Bolt                 │ │
│  │                                                          │ │
│  │  • Receives all Slack events                            │ │
│  │  • ACKs instantly (< 1ms)                               │ │
│  │  • Routes to handlers                                   │ │
│  └───────────┬──────────────────────────────────────────────┘ │
│              │                                                 │
│              ↓                                                 │
│  ┌──────────────────────────────────────────────────────────┐│
│  │               🔄 AsyncQueue System                        ││
│  │                                                           ││
│  │  ┌─────────────────────────────────────────────────┐    ││
│  │  │  Job Queue (FIFO)                                │    ││
│  │  │  ├─ Button action handlers                       │    ││
│  │  │  ├─ Modal submission processors                  │    ││
│  │  │  ├─ Daily automation tasks                       │    ││
│  │  │  ├─ Monday.com API calls                         │    ││
│  │  │  └─ Slack message operations                     │    ││
│  │  └─────────────────────────────────────────────────┘    ││
│  │                                                           ││
│  │  Features:                                                ││
│  │  • Non-blocking processing                               ││
│  │  • Automatic error handling                              ││
│  │  • Queue monitoring                                      ││
│  │  • Backpressure protection                               ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  📦 Shared Resources:                                         │
│  ├─ Monday.com API Client                                    │
│  ├─ Slack Web Client                                         │
│  ├─ Message Store (daily updates)                            │
│  ├─ Task Metadata Cache                                      │
│  └─ Metrics & Monitoring                                     │
│                                                               │
│  📡 API Endpoints:                                            │
│  ├─ GET  /              (Server info)                        │
│  ├─ GET  /health        (Health + queue status)             │
│  ├─ GET  /metrics       (Detailed metrics)                   │
│  ├─ POST /trigger       (Daily automation)                   │
│  ├─ POST /slack/events  (Slack interactions)                 │
│  └─ POST /webhook/monday (Monday.com webhooks)               │
└─────────┬────────────────────────────┬────────────────────────┘
          │                            │
          ↓                            ↓
    ┌──────────┐              ┌─────────────────┐
    │ Monday   │              │ Slack API       │
    │   API    │              │                 │
    │          │              │ • Send messages │
    │ • Boards │              │ • Open modals   │
    │ • Tasks  │              │ • Update msgs   │
    │ • Users  │              │ • Ephemeral     │
    └────┬─────┘              └─────────────────┘
         │
         │ Webhooks (async)
         └──────────┐
                    ↓
         ┌──────────────────┐
         │ Monday.com       │
         │ Webhook Events   │
         │                  │
         │ • Task assigned  │
         │ • Status changed │
         │ • Due date set   │
         └──────────────────┘
```

### Request Flow: Async Command Processing

```
┌────────────┐
│  User      │
│  Types     │
│  /tasks    │
└─────┬──────┘
      │
      ↓
┌─────────────────────────────────────────┐
│  Slack sends POST to /slack/events      │
└─────┬───────────────────────────────────┘
      │
      ↓
┌─────────────────────────────────────────┐
│  Server receives request                │
│  ⏱️  Timestamp: T+0ms                    │
└─────┬───────────────────────────────────┘
      │
      ↓
┌─────────────────────────────────────────┐
│  ✅ ACK() called immediately             │
│  ⏱️  Timestamp: T+1ms                    │
│  👤 User sees "Loading..." in Slack     │
└─────┬───────────────────────────────────┘
      │
      ├──────────────────────────────────────────┐
      │                                          │
      ↓ (Slack response sent)                   ↓ (Background)
┌──────────────┐                    ┌───────────────────────┐
│  Slack UI    │                    │  AsyncQueue.add()     │
│  shows       │                    │  ⏱️  T+2ms             │
│  "Loading"   │                    └───────┬───────────────┘
└──────────────┘                            │
                                            ↓
                              ┌─────────────────────────────┐
                              │  Queue starts processing    │
                              │  ⏱️  T+5ms                   │
                              └──────┬──────────────────────┘
                                     │
                                     ↓
                              ┌─────────────────────────────┐
                              │  Fetch boards from Monday   │
                              │  ⏱️  T+505ms (500ms API call)│
                              └──────┬──────────────────────┘
                                     │
                                     ↓
                              ┌─────────────────────────────┐
                              │  Filter user's tasks        │
                              │  ⏱️  T+805ms (300ms process) │
                              └──────┬──────────────────────┘
                                     │
                                     ↓
                              ┌─────────────────────────────┐
                              │  Organize by priority       │
                              │  ⏱️  T+855ms (50ms)          │
                              └──────┬──────────────────────┘
                                     │
                                     ↓
                              ┌─────────────────────────────┐
                              │  Format Slack message       │
                              │  ⏱️  T+905ms (50ms)          │
                              └──────┬──────────────────────┘
                                     │
                                     ↓
                              ┌─────────────────────────────┐
                              │  Send to Slack              │
                              │  ⏱️  T+1105ms (200ms)        │
                              └──────┬──────────────────────┘
                                     │
      ┌──────────────────────────────┘
      ↓
┌──────────────────────┐
│  👤 User sees        │
│  complete task list  │
│  in Slack            │
│  ⏱️  T+1105ms         │
└──────────────────────┘

Total perceived latency: ~1ms (ACK)
Total actual processing: ~1105ms (background)
```

### Queue Processing Flow

```
┌─────────────────────────────────────┐
│         AsyncQueue Class             │
│                                      │
│  Properties:                         │
│  • queue: []  (FIFO array)          │
│  • processing: false                 │
│                                      │
│  Methods:                            │
│  • add(task)                         │
│  • process()                         │
└─────────────────────────────────────┘
           │
           │ Multiple tasks added
           ↓
┌─────────────────────────────────────┐
│  Queue State:                        │
│  queue = [task1, task2, task3]      │
│  processing = false                  │
└─────────┬───────────────────────────┘
          │
          │ add() calls process()
          ↓
┌─────────────────────────────────────┐
│  Queue State:                        │
│  queue = [task1, task2, task3]      │
│  processing = true ← Lock acquired   │
└─────────┬───────────────────────────┘
          │
          │ while (queue.length > 0)
          ↓
┌─────────────────────────────────────┐
│  Execute task1                       │
│  • Fetch Monday.com data             │
│  • Update Slack                      │
│  • Handle errors                     │
└─────────┬───────────────────────────┘
          │
          │ task1 complete
          ↓
┌─────────────────────────────────────┐
│  Queue State:                        │
│  queue = [task2, task3]              │
│  processing = true                   │
└─────────┬───────────────────────────┘
          │
          │ Continue processing
          ↓
┌─────────────────────────────────────┐
│  Execute task2                       │
└─────────┬───────────────────────────┘
          │
          ↓
┌─────────────────────────────────────┐
│  Execute task3                       │
└─────────┬───────────────────────────┘
          │
          │ queue.length === 0
          ↓
┌─────────────────────────────────────┐
│  Queue State:                        │
│  queue = []                          │
│  processing = false ← Lock released  │
└─────────────────────────────────────┘
```

### Daily Automation Flow

```
┌──────────────────┐
│  Trigger Source  │
│                  │
│  • Cron job      │
│  • Manual POST   │
│  • Scheduled     │
└────────┬─────────┘
         │
         ↓
┌────────────────────────────────┐
│  POST /trigger                 │
│  ⏱️  Instant 200 OK response    │
│  📝 "Automation started"        │
└────────┬───────────────────────┘
         │
         │ Background processing
         ↓
┌────────────────────────────────┐
│  runDailyAutomation()          │
│                                │
│  1. Get active users           │
│  2. Get all boards             │
│  3. For each user:             │
│     • Get user's tasks         │
│     • Organize by priority     │
│     • Format message           │
│     • Send/update in Slack    │
└────────┬───────────────────────┘
         │
         ↓
┌────────────────────────────────┐
│  Metrics updated:              │
│  • usersProcessed              │
│  • tasksFound                  │
│  • messagesUpdated             │
│  • messagesSent                │
│  • lastRun timestamp           │
└────────────────────────────────┘
```

### Monitoring & Metrics Flow

```
┌─────────────────┐
│  External       │
│  Monitoring     │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────┐
│  GET /health                    │
│                                 │
│  Response:                      │
│  {                              │
│    status: "ok",                │
│    uptime: 12345,               │
│    queueLength: 0,              │
│    queueProcessing: false,      │
│    metrics: {...}               │
│  }                              │
└─────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────┐
│  GET /metrics                   │
│                                 │
│  Response:                      │
│  {                              │
│    commandsProcessed: 150,      │
│    asyncTasksQueued: 45,        │
│    webhooksReceived: 23,        │
│    notificationsSent: 23,       │
│    queueStats: {                │
│      queueLength: 0,            │
│      isProcessing: false        │
│    }                            │
│  }                              │
└─────────────────────────────────┘
```

## Comparison: v5.0 vs v6.0

### v5.0 Architecture (Split)

```
┌──────────────┐     ┌──────────────┐
│  server.js   │     │automation.js │
│              │     │              │
│ Commands     │     │ Daily tasks  │
│ Interactive  │     │ (duplicate   │
│ Webhooks     │     │  code)       │
│              │     │              │
│ ❌ Sync only │     │ ❌ Sync only │
└──────┬───────┘     └──────┬───────┘
       │                    │
       │                    │
       ↓                    ↓
    Monday.com           Slack API
```

### v6.0 Architecture (Unified)

```
┌─────────────────────────────┐
│   unified-server.js         │
│                             │
│  ┌───────────────────────┐  │
│  │   AsyncQueue          │  │
│  │   • Non-blocking      │  │
│  │   • Error handling    │  │
│  │   • Monitoring        │  │
│  └───────────────────────┘  │
│                             │
│  Everything in one place:   │
│  • Commands                 │
│  • Interactive components   │
│  • Daily automation         │
│  • Webhooks                 │
│  • Shared utilities         │
│                             │
│  ✅ Async processing        │
│  ✅ Zero duplication        │
└──────┬──────────────────────┘
       │
       ↓
  Monday.com + Slack API
```

---

**Key Takeaway:** v6.0 provides the same features with better performance, simpler architecture, and async processing—all in one unified server.
