#!/usr/bin/env node
/**
 * Multi-agent-ojousama MCP Server
 *
 * This server provides specialized tools for the multi-agent-ojousama system,
 * replacing tmux commands with structured MCP queries.
 *
 * Implements 11 tools:
 * 1. ojousama_get_agent_state
 * 2. ojousama_list_all_agents
 * 3. ojousama_get_task
 * 4. ojousama_list_tasks
 * 5. ojousama_check_dependencies
 * 6. ojousama_get_report
 * 7. ojousama_list_reports
 * 8. ojousama_get_pending_reports
 * 9. ojousama_get_dashboard_summary
 * 10. ojousama_check_communication_status
 * 11. ojousama_update_agent_state (NEW)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from './lib/config.js';
import { getYamlCache } from './lib/yaml-cache.js';
import { getTmuxClient } from './lib/tmux.js';
import { createAgentStateManager } from './tools/agent-state.js';
import { createTaskManager } from './tools/tasks.js';
import { createReportManager } from './tools/reports.js';
import { createDashboardManager } from './tools/dashboard.js';
import { createCommunicationChecker } from './tools/communication.js';
import type { AgentId } from './types/interfaces.js';

/**
 * Initialize MCP server
 */
async function main() {
  try {
    // Load configuration
    const config = await loadConfig();
    console.error(`[ojousama-mcp] Loaded configuration: ${config.server.name} v${config.server.version}`);

    // Initialize caches
    const yamlCache = getYamlCache(config.cache.yaml_max_entries);
    const tmuxClient = getTmuxClient({
      busyPatterns: config.patterns.busy,
      idlePatterns: config.patterns.idle,
    });

    // Initialize tool managers
    const agentStateManager = createAgentStateManager(
      config.paths.queue_dir,
      config.agents,
      tmuxClient,
      yamlCache,
      config.cache.agent_state_ttl_ms
    );
    const taskManager = createTaskManager(config.paths.queue_dir, yamlCache);
    const reportManager = createReportManager(config.paths.queue_dir, yamlCache);
    const dashboardManager = createDashboardManager(config.paths.dashboard);
    const communicationChecker = createCommunicationChecker(taskManager, reportManager);

    // Create MCP server
    const server = new Server(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Tool 1: Get agent state
          {
            name: 'ojousama_get_agent_state',
            description: 'Get the current state of a specific agent (idle/busy + current task). Replaces tmux display-message and capture-pane commands.',
            inputSchema: {
              type: 'object',
              properties: {
                agent_id: {
                  type: 'string',
                  description: 'Agent ID (butler, head_maid, secretary, maid1-6, inspector)',
                  enum: Object.keys(config.agents),
                },
              },
              required: ['agent_id'],
            },
          },

          // Tool 2: List all agents
          {
            name: 'ojousama_list_all_agents',
            description: 'Get the status of all agents with optional filtering. Useful for finding available maids.',
            inputSchema: {
              type: 'object',
              properties: {
                filter: {
                  type: 'string',
                  description: 'Filter by status',
                  enum: ['idle', 'busy', 'all'],
                  default: 'all',
                },
              },
            },
          },

          // Tool 3: Get task
          {
            name: 'ojousama_get_task',
            description: 'Get task details by agent_id or task_id. Replaces manual YAML file reading.',
            inputSchema: {
              type: 'object',
              properties: {
                agent_id: {
                  type: 'string',
                  description: 'Agent ID to get task for',
                },
                task_id: {
                  type: 'string',
                  description: 'Task ID to get',
                },
              },
            },
          },

          // Tool 4: List tasks
          {
            name: 'ojousama_list_tasks',
            description: 'List all tasks with optional filtering by status, priority, or project.',
            inputSchema: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  description: 'Filter by status',
                  enum: ['pending', 'assigned', 'done', 'blocked'],
                },
                priority: {
                  type: 'string',
                  description: 'Filter by priority',
                  enum: ['urgent', 'high', 'medium', 'low'],
                },
                project: {
                  type: 'string',
                  description: 'Filter by project name',
                },
              },
            },
          },

          // Tool 5: Check dependencies
          {
            name: 'ojousama_check_dependencies',
            description: 'Check task dependencies recursively. Determines if a task can be executed and identifies pending dependencies. Critical for task assignment.',
            inputSchema: {
              type: 'object',
              properties: {
                task_id: {
                  type: 'string',
                  description: 'Task ID to check',
                },
              },
              required: ['task_id'],
            },
          },

          // Tool 6: Get report
          {
            name: 'ojousama_get_report',
            description: 'Get a specific report by worker_id or task_id.',
            inputSchema: {
              type: 'object',
              properties: {
                worker_id: {
                  type: 'string',
                  description: 'Worker ID (agent_id)',
                },
                task_id: {
                  type: 'string',
                  description: 'Task ID',
                },
              },
            },
          },

          // Tool 7: List reports
          {
            name: 'ojousama_list_reports',
            description: 'List all reports with optional filtering by worker_id, status, or ack.',
            inputSchema: {
              type: 'object',
              properties: {
                worker_id: {
                  type: 'string',
                  description: 'Filter by worker ID',
                },
                status: {
                  type: 'string',
                  description: 'Filter by status',
                  enum: ['done', 'blocked', 'error'],
                },
                ack: {
                  type: 'boolean',
                  description: 'Filter by acknowledgment status',
                },
              },
            },
          },

          // Tool 8: Get pending reports
          {
            name: 'ojousama_get_pending_reports',
            description: 'Get all unacknowledged reports. This is the secretary\'s most important tool for collecting reports from maids and inspector.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },

          // Tool 9: Get dashboard summary
          {
            name: 'ojousama_get_dashboard_summary',
            description: 'Parse dashboard.md and return structured data including requires_attention, in_progress, achievements, and skill_candidates.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },

          // Tool 10: Check communication status
          {
            name: 'ojousama_check_communication_status',
            description: 'Health check for communication system. Detects stale tasks (>1 hour), unacked reports, blocked tasks, and circular dependencies.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },

          // Tool 11: Update agent state (NEW)
          {
            name: 'ojousama_update_agent_state',
            description: 'Update agent status (idle/busy) in YAML. This tool reduces context pressure by allowing agents to update their status with a single MCP call instead of writing YAML directly.',
            inputSchema: {
              type: 'object',
              properties: {
                agent_id: {
                  type: 'string',
                  description: 'Agent ID (butler, head_maid, secretary, maid1-6, inspector)',
                  enum: Object.keys(config.agents),
                },
                status: {
                  type: 'string',
                  description: 'New status',
                  enum: ['idle', 'busy'],
                },
              },
              required: ['agent_id', 'status'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // Tool 1: Get agent state
          case 'ojousama_get_agent_state': {
            const { agent_id } = args as { agent_id: AgentId };
            const state = await agentStateManager.getAgentState(agent_id);

            if (!state) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ error: `Failed to get state for agent: ${agent_id}` }, null, 2),
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(state, null, 2),
                },
              ],
            };
          }

          // Tool 2: List all agents
          case 'ojousama_list_all_agents': {
            const { filter } = args as { filter?: 'idle' | 'busy' | 'all' };
            const agents = await agentStateManager.listAllAgents({ status: filter || 'all' });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(agents, null, 2),
                },
              ],
            };
          }

          // Tool 3: Get task
          case 'ojousama_get_task': {
            const { agent_id, task_id } = args as { agent_id?: AgentId; task_id?: string };

            if (!agent_id && !task_id) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ error: 'Either agent_id or task_id must be provided' }, null, 2),
                  },
                ],
              };
            }

            let task;
            if (agent_id) {
              task = await taskManager.getTaskByAgent(agent_id);
            } else if (task_id) {
              task = await taskManager.getTaskById(task_id);
            }

            if (!task) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ error: 'Task not found' }, null, 2),
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(task, null, 2),
                },
              ],
            };
          }

          // Tool 4: List tasks
          case 'ojousama_list_tasks': {
            const { status, priority, project } = args as {
              status?: 'pending' | 'assigned' | 'done' | 'blocked';
              priority?: 'urgent' | 'high' | 'medium' | 'low';
              project?: string;
            };

            const tasks = await taskManager.listTasks({ status, priority, project });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(tasks, null, 2),
                },
              ],
            };
          }

          // Tool 5: Check dependencies
          case 'ojousama_check_dependencies': {
            const { task_id } = args as { task_id: string };

            const result = await taskManager.checkDependencies(task_id);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          // Tool 6: Get report
          case 'ojousama_get_report': {
            const { worker_id, task_id } = args as { worker_id?: AgentId; task_id?: string };

            if (!worker_id && !task_id) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ error: 'Either worker_id or task_id must be provided' }, null, 2),
                  },
                ],
              };
            }

            let report;
            if (worker_id) {
              report = await reportManager.getReport(worker_id);
            } else if (task_id) {
              report = await reportManager.getReportByTaskId(task_id);
            }

            if (!report) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ error: 'Report not found' }, null, 2),
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(report, null, 2),
                },
              ],
            };
          }

          // Tool 7: List reports
          case 'ojousama_list_reports': {
            const { worker_id, status, ack } = args as {
              worker_id?: AgentId;
              status?: 'done' | 'blocked' | 'error';
              ack?: boolean;
            };

            const reports = await reportManager.listReports({ worker_id, status, ack });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(reports, null, 2),
                },
              ],
            };
          }

          // Tool 8: Get pending reports
          case 'ojousama_get_pending_reports': {
            const result = await reportManager.getPendingReports();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          // Tool 9: Get dashboard summary
          case 'ojousama_get_dashboard_summary': {
            const summary = await dashboardManager.getDashboardSummary();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(summary, null, 2),
                },
              ],
            };
          }

          // Tool 10: Check communication status
          case 'ojousama_check_communication_status': {
            const status = await communicationChecker.checkCommunicationStatus();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(status, null, 2),
                },
              ],
            };
          }

          // Tool 11: Update agent state
          case 'ojousama_update_agent_state': {
            const { agent_id, status } = args as { agent_id: AgentId; status: 'idle' | 'busy' };

            await agentStateManager.updateAgentState(agent_id, status);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ success: true, agent_id, status, timestamp: new Date().toISOString() }, null, 2),
                },
              ],
            };
          }

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
                },
              ],
            };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: (error as Error).message }, null, 2),
            },
          ],
        };
      }
    });

    // Start server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error(`[ojousama-mcp] Server started successfully`);
    console.error(`[ojousama-mcp] Tools available: 11`);

    // Cleanup on exit
    process.on('SIGINT', () => {
      console.error('[ojousama-mcp] Shutting down...');
      yamlCache.destroy();
      // No cache to clear - agent state manager has no cache
      process.exit(0);
    });

  } catch (error) {
    console.error('[ojousama-mcp] Failed to start server:', error);
    process.exit(1);
  }
}

main();
