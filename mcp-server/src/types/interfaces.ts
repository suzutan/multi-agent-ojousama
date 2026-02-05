/**
 * Type definitions for multi-agent-ojousama MCP server
 */

/**
 * Agent status
 */
export type AgentStatus = 'idle' | 'busy';

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'assigned' | 'done' | 'blocked';

/**
 * Task priority
 */
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

/**
 * Agent ID
 */
export type AgentId =
  | 'butler'
  | 'head_maid'
  | 'secretary'
  | 'maid1'
  | 'maid2'
  | 'maid3'
  | 'maid4'
  | 'maid5'
  | 'maid6'
  | 'inspector';

/**
 * Agent configuration
 */
export interface AgentConfig {
  pane_target: string;
  session: string;
}

/**
 * Task definition
 */
export interface Task {
  task_id: string;
  parent_cmd?: string;
  description: string;
  target_path?: string;
  project?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  timestamp: string;
  completed_at?: string;
  blocked_by?: string[];
}

/**
 * Agent state
 */
export interface AgentState {
  agent_id: AgentId;
  status: AgentStatus;
  current_task: Task | null;
  last_update: string;
  detected_by?: 'yaml' | 'tmux';  // どこから検出したか
}

/**
 * Agent states YAML structure
 */
export interface AgentStatesYaml {
  agents: Record<AgentId, {
    status: AgentStatus;
    last_update: string;
    detected_by: 'yaml' | 'tmux';
  }>;
}

/**
 * Report definition
 */
export interface Report {
  worker_id: AgentId;
  task_id: string;
  status: 'done' | 'blocked' | 'error';
  result?: string;
  error?: string;
  skill_candidate?: SkillCandidate;
  timestamp: string;
  ack?: boolean;
}

/**
 * Skill candidate
 */
export interface SkillCandidate {
  name: string;
  score: number;
  recommended: boolean;
  reason: string;
}

/**
 * Dependency check result
 */
export interface DependencyCheckResult {
  task_id: string;
  can_execute: boolean;
  pending_dependencies: string[];
  blocked_tasks: Task[];
}

/**
 * Dashboard section
 */
export interface DashboardSection {
  requires_attention: string[];
  in_progress: Task[];
  achievements: Array<{
    time: string;
    task_id: string;
    worker_id: AgentId;
    result: string;
  }>;
  skill_candidates: SkillCandidate[];
}

/**
 * Communication status
 */
export interface CommunicationStatus {
  stale_tasks: Task[];
  unacked_reports: Report[];
  blocked_tasks: Task[];
  circular_dependencies: string[][];
}

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  server: {
    name: string;
    version: string;
  };
  paths: {
    queue_dir: string;
    dashboard: string;
  };
  agents: Record<AgentId, AgentConfig>;
  cache: {
    agent_state_ttl_ms: number;
    yaml_max_entries: number;
  };
  patterns: {
    busy: string[];
    idle: string[];
  };
}
