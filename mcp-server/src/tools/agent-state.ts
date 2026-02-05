/**
 * Agent state management tools (Tools 1-2, 11)
 *
 * - ojousama_get_agent_state: Get specific agent state
 * - ojousama_list_all_agents: List all agents with filtering
 * - ojousama_update_agent_state: Update agent state (NEW)
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import type { AgentId, AgentStatus, AgentState, AgentConfig, Task, AgentStatesYaml } from '../types/interfaces.js';
import type { TmuxClient } from '../lib/tmux.js';
import type { YamlCache } from '../lib/yaml-cache.js';

export interface AgentFilter {
  status?: AgentStatus | 'all';
}

export class AgentStateManager {
  // NO CACHING - always fetch fresh data
  // Reason: Task assignments change frequently, cache causes stale data

  private agentStatesPath: string;

  constructor(
    private queueDir: string,
    private agents: Record<AgentId, AgentConfig>,
    private tmuxClient: TmuxClient,
    private yamlCache: YamlCache,
    private stateTtlMs: number = 0  // Unused, kept for compatibility
  ) {
    this.agentStatesPath = path.join(queueDir, 'agent_states.yaml');
  }

  /**
   * Read agent_states.yaml
   */
  private async readAgentStatesYaml(): Promise<AgentStatesYaml> {
    try {
      const content = await fs.readFile(this.agentStatesPath, 'utf-8');
      const data = yaml.load(content) as AgentStatesYaml;
      return data;
    } catch (error) {
      // File not found - return empty structure
      return { agents: {} as Record<AgentId, { status: AgentStatus; last_update: string; detected_by: 'yaml' | 'tmux' }> };
    }
  }

  /**
   * Write agent_states.yaml
   */
  private async writeAgentStatesYaml(data: AgentStatesYaml): Promise<void> {
    const yamlContent = yaml.dump(data, { indent: 2 });
    await fs.writeFile(this.agentStatesPath, yamlContent, 'utf-8');
  }

  /**
   * Get agent state from YAML
   * Agents are responsible for updating their status via update_agent_state
   */
  async getAgentState(agentId: AgentId): Promise<AgentState | null> {
    const agentConfig = this.agents[agentId];
    if (!agentConfig) {
      return null;
    }

    const statesYaml = await this.readAgentStatesYaml();
    const yamlState = statesYaml.agents[agentId];

    // Get status from YAML (default: idle)
    const status: AgentStatus = yamlState?.status || 'idle';

    // Get current task
    const taskFile = `${this.queueDir}/tasks/${agentId}.yaml`;
    const task = await this.yamlCache.get<Task>(taskFile);

    return {
      agent_id: agentId,
      status,
      current_task: task || null,
      last_update: yamlState?.last_update || new Date().toISOString(),
      detected_by: 'yaml',
    };
  }

  /**
   * Update agent state in YAML
   *
   * This method allows agents to update their status with minimal context pressure.
   * Instead of agents writing YAML directly (bloats context), they call this MCP tool.
   */
  async updateAgentState(agentId: AgentId, status: AgentStatus): Promise<void> {
    const statesYaml = await this.readAgentStatesYaml();

    // Initialize agents object if missing
    if (!statesYaml.agents) {
      statesYaml.agents = {} as Record<AgentId, { status: AgentStatus; last_update: string; detected_by: 'yaml' | 'tmux' }>;
    }

    // Update state
    statesYaml.agents[agentId] = {
      status,
      last_update: new Date().toISOString(),
      detected_by: 'yaml',
    };

    // Write back to file
    await this.writeAgentStatesYaml(statesYaml);
  }

  /**
   * List all agents with optional filtering
   */
  async listAllAgents(filter?: AgentFilter): Promise<Record<string, AgentState>> {
    const agentStates: Record<string, AgentState> = {};
    const filterStatus = filter?.status ?? 'all';

    for (const agentId of Object.keys(this.agents) as AgentId[]) {
      const state = await this.getAgentState(agentId);

      if (state) {
        // Apply filter
        if (filterStatus === 'all' || state.status === filterStatus) {
          agentStates[agentId] = state;
        }
      }
    }

    return agentStates;
  }

  /**
   * Get idle agents (available for work)
   */
  async getIdleAgents(): Promise<AgentState[]> {
    const allStates = await this.listAllAgents({ status: 'idle' });
    return Object.values(allStates);
  }

  /**
   * Get busy agents
   */
  async getBusyAgents(): Promise<AgentState[]> {
    const allStates = await this.listAllAgents({ status: 'busy' });
    return Object.values(allStates);
  }

  /**
   * Get agents by role (maids, inspector, etc.)
   */
  async getAgentsByRole(role: 'maid' | 'inspector' | 'head_maid' | 'secretary' | 'butler'): Promise<AgentState[]> {
    const allStates = await this.listAllAgents();
    const agents: AgentState[] = [];

    for (const [agentId, state] of Object.entries(allStates)) {
      if (role === 'maid' && agentId.startsWith('maid')) {
        agents.push(state);
      } else if (agentId === role) {
        agents.push(state);
      }
    }

    return agents;
  }

  // Cache methods removed - no caching implementation
}

export function createAgentStateManager(
  queueDir: string,
  agents: Record<AgentId, AgentConfig>,
  tmuxClient: TmuxClient,
  yamlCache: YamlCache,
  stateTtlMs?: number
): AgentStateManager {
  return new AgentStateManager(queueDir, agents, tmuxClient, yamlCache, stateTtlMs);
}
