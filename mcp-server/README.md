# multi-agent-ojousama MCP Server

MCP server for multi-agent-ojousama system. This server provides specialized tools to replace tmux commands with structured MCP queries.

## Features

- **Agent State Management**: Get agent status (idle/busy) and current task
- **YAML Caching**: Automatic file watching and cache invalidation
- **Tmux Integration**: Parse tmux capture-pane output for agent status
- **Structured Responses**: JSON responses instead of text parsing

## Installation

```bash
cd mcp-server
npm install
npm run build
```

## Configuration

Edit `config/mcp.yaml` to configure:

- Agent pane targets
- Cache settings
- Busy/idle patterns

## Usage

### As MCP Server

Add to Claude Desktop configuration:

```json
{
  "mcpServers": {
    "ojousama-mcp": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"]
    }
  }
}
```

### Available Tools

#### Agent State Management (Tools 1-2, 11)

1. **ojousama_get_agent_state**
   - Get status of a specific agent (idle/busy + current task)
   - Parameters: `agent_id` (butler, head_maid, secretary, maid1-6, inspector)
   - Returns: `{ agent_id, status, current_task, last_update, detected_by }`
   - Strategy: YAML first (<30s), tmux fallback
   - Replaces: `tmux display-message` + `tmux capture-pane`

2. **ojousama_list_all_agents**
   - Get status of all agents with optional filtering
   - Parameters: `filter` (idle, busy, all)
   - Returns: Agent states object
   - Use case: Find available maids for task assignment

3. **ojousama_update_agent_state** ⭐ NEW

- Update agent status (idle/busy) in YAML
- Parameters: `agent_id`, `status` (idle, busy)
- Returns: `{ success, agent_id, status, timestamp }`
- Use case: Agents update their status with minimal context pressure
- Benefit: 1 MCP call instead of Read→Edit YAML (saves ~1000 tokens per update)

#### Task Management (Tools 3-5)

3. **ojousama_get_task**
   - Get task details by agent_id or task_id
   - Parameters: `agent_id` or `task_id`
   - Returns: Task object
   - Replaces: Manual YAML file reading

4. **ojousama_list_tasks**
   - List all tasks with optional filtering
   - Parameters: `status` (pending, assigned, done, blocked), `priority` (urgent, high, medium, low), `project`
   - Returns: Array of tasks
   - Use case: Progress monitoring, blocked task detection

5. **ojousama_check_dependencies** ⭐
   - Check task dependencies recursively
   - Parameters: `task_id`
   - Returns: `{ task_id, can_execute, pending_dependencies, blocked_tasks }`
   - Use case: Determine if a task can be assigned (critical for head_maid and secretary)

#### Report Management (Tools 6-8)

6. **ojousama_get_report**
   - Get a specific report by worker_id or task_id
   - Parameters: `worker_id` or `task_id`
   - Returns: Report object
   - Replaces: `Read("queue/reports/maid{N}_report.yaml")`

7. **ojousama_list_reports**
   - List all reports with optional filtering
   - Parameters: `worker_id`, `status` (done, blocked, error), `ack` (boolean)
   - Returns: Array of reports

8. **ojousama_get_pending_reports** ⭐
   - Get all unacknowledged reports (secretary's most important tool)
   - Parameters: None
   - Returns: `{ count, pending: [reports] }`
   - Replaces: Manual reading of 7 report files
   - Use case: Secretary collects reports from all maids and inspector

#### Dashboard & Health Check (Tools 9-10)

9. **ojousama_get_dashboard_summary**
   - Parse dashboard.md and return structured data
   - Parameters: None
   - Returns: `{ requires_attention, in_progress, achievements, skill_candidates }`
   - Use case: Butler and head_maid check project status

10. **ojousama_check_communication_status**
    - Health check for communication system
    - Parameters: None
    - Returns: `{ stale_tasks, unacked_reports, blocked_tasks, circular_dependencies }`
    - Detects: Tasks assigned for >1 hour, unacked reports, blocked tasks, circular deps
    - Use case: Secretary's periodic health check

## Architecture

```
mcp-server/
├── src/
│   ├── index.ts                    # MCP server entry point (all 11 tools)
│   ├── types/
│   │   └── interfaces.ts           # TypeScript type definitions
│   ├── lib/
│   │   ├── config.ts               # Configuration loader
│   │   ├── yaml-cache.ts           # YAML reader (no caching)
│   │   ├── tmux.ts                 # Tmux command wrapper
│   │   └── dependency-resolver.ts  # Dependency resolution engine
│   └── tools/
│       ├── agent-state.ts          # Tools 1-2, 11: Agent state management
│       ├── tasks.ts                # Tools 3-5: Task management
│       ├── reports.ts              # Tools 6-8: Report management
│       ├── dashboard.ts            # Tool 9: Dashboard parsing
│       └── communication.ts        # Tool 10: Health check
├── dist/                           # Compiled JavaScript (generated)
├── package.json
└── tsconfig.json
```

### Key Components

- **YAML Reader**: **NO CACHING** - Always reads fresh data from disk to avoid stale cache
- **Dependency Resolver**: Recursive `blocked_by` analysis, circular dependency detection
- **Agent State**: **Hybrid approach** - YAML first (<30s), tmux fallback, with write capability
- **Agent States YAML**: `queue/agent_states.yaml` - Persistent storage for all agent statuses
- **Tmux Integration**: Busy/idle pattern detection from capture-pane output

### Design Principle: Minimal Caching with Write Capability

**Agent State Strategy**: YAML first, tmux fallback

**Reason**:

1. Agents can update status with 1 MCP call (saves ~1000 tokens per update)
2. YAML persists state (survives MCP restart)
3. 30-second freshness check prevents stale reads
4. Tmux capture-pane as backup detection

**Benefits**:

- ✅ Reduced context pressure (agents don't write YAML repeatedly)
- ✅ State persistence (not volatile like pure MCP cache)
- ✅ Backup detection (tmux as fallback)
- ✅ Correctness (30s freshness threshold)

**Performance**:

- Agent state update: 1 MCP call vs Read→Edit YAML (~1000 tokens saved)
- Agent state read: YAML first (<30s), tmux fallback (~50ms)
- No cache for tasks/reports (always fresh reads)

## Performance

| Operation                   | Before (tmux) | After (MCP, no cache) | Improvement |
| --------------------------- | ------------- | --------------------- | ----------- |
| Agent state check           | 220ms         | ~50ms                 | 77% ↑       |
| All agents check            | 1,540ms       | ~300ms                | 80% ↑       |
| Report collection (7 files) | 210ms         | ~210ms                | ≈同等       |

**Note**: Performance improvements come from structured queries, not caching.

## Development

```bash
# Watch mode
npm run watch

# Build
npm run build

# Run
npm start
```

## License

MIT
