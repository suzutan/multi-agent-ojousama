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
   * Get agent state (NO CACHING - always fresh)
   *
   * Strategy: YAML first, tmux fallback
   * 1. Read agent_states.yaml
   * 2. If found and recent (<30s), use YAML
   * 3. Otherwise, detect from tmux and update YAML
   *
   * This design:
   * - Reduces context pressure (agents don't write YAML repeatedly)
   * - Maintains persistence (state survives MCP restart)
   * - Keeps tmux as backup detection
   */
  async getAgentState(agentId: AgentId): Promise<AgentState | null> {
    // Get agent config
    const agentConfig = this.agents[agentId];
    if (!agentConfig) {
      return null;
    }

    // Read agent_states.yaml
    const statesYaml = await this.readAgentStatesYaml();
    const yamlState = statesYaml.agents[agentId];

    let detectedStatus: AgentStatus;
    let detectedBy: 'yaml' | 'tmux';

    // Check if YAML state is recent (<30 seconds)
    if (yamlState) {
      const lastUpdate = new Date(yamlState.last_update);
      const now = new Date();
      const ageSec = (now.getTime() - lastUpdate.getTime()) / 1000;

      if (ageSec < 30) {
        // YAML state is recent - use it
        detectedStatus = yamlState.status;
        detectedBy = 'yaml';
      } else {
        // YAML state is stale - detect from tmux and update YAML
        const tmuxStatus = await this.tmuxClient.getAgentStatus(agentConfig.pane_target);
        if (!tmuxStatus) {
          return null;
        }
        detectedStatus = tmuxStatus.status;
        detectedBy = 'tmux';

        // Update YAML with fresh tmux detection
        await this.updateAgentState(agentId, detectedStatus);
      }
    } else {
      // No YAML state - detect from tmux and create YAML entry
      const tmuxStatus = await this.tmuxClient.getAgentStatus(agentConfig.pane_target);
      if (!tmuxStatus) {
        return null;
      }
      detectedStatus = tmuxStatus.status;
      detectedBy = 'tmux';

      // Update YAML with fresh tmux detection
      await this.updateAgentState(agentId, detectedStatus);
    }

    // Get current task from YAML (real-time, no cache)
    const taskFile = `${this.queueDir}/tasks/${agentId}.yaml`;
    const task = await this.yamlCache.get<Task>(taskFile);

    const state: AgentState = {
      agent_id: agentId,
      status: detectedStatus,
      current_task: task || null,
      last_update: new Date().toISOString(),
      detected_by: detectedBy,
    };

    return state;
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
