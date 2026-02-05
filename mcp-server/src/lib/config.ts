/**
 * Configuration loader for MCP server
 */

import fs from 'fs/promises';
import yaml from 'js-yaml';
import path from 'path';
import type { McpServerConfig } from '../types/interfaces.js';

let cachedConfig: McpServerConfig | null = null;

/**
 * Load MCP server configuration from YAML file
 */
export async function loadConfig(configPath?: string): Promise<McpServerConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const defaultPath = path.resolve(process.cwd(), 'config/mcp.yaml');
  const resolvedPath = configPath ? path.resolve(configPath) : defaultPath;

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    const config = yaml.load(content) as McpServerConfig;

    // Validate configuration
    validateConfig(config);

    cachedConfig = config;
    return config;
  } catch (error) {
    throw new Error(`Failed to load configuration from ${resolvedPath}: ${(error as Error).message}`);
  }
}

/**
 * Validate configuration structure
 */
function validateConfig(config: any): asserts config is McpServerConfig {
  if (!config.server || !config.server.name || !config.server.version) {
    throw new Error('Invalid configuration: missing server information');
  }

  if (!config.paths || !config.paths.queue_dir || !config.paths.dashboard) {
    throw new Error('Invalid configuration: missing paths information');
  }

  if (!config.agents || typeof config.agents !== 'object') {
    throw new Error('Invalid configuration: missing or invalid agents configuration');
  }

  if (!config.cache || typeof config.cache.agent_state_ttl_ms !== 'number' || typeof config.cache.yaml_max_entries !== 'number') {
    throw new Error('Invalid configuration: missing or invalid cache configuration');
  }

  if (!config.patterns || !Array.isArray(config.patterns.busy) || !Array.isArray(config.patterns.idle)) {
    throw new Error('Invalid configuration: missing or invalid patterns configuration');
  }
}

/**
 * Get agent configuration by agent ID
 */
export function getAgentConfig(config: McpServerConfig, agentId: string) {
  return config.agents[agentId as keyof typeof config.agents];
}

/**
 * Clear cached configuration
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
