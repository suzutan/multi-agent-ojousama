/**
 * Tmux command wrapper with error handling
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AgentId, AgentStatus } from '../types/interfaces.js';

const execFileAsync = promisify(execFile);

/**
 * Tmux execution result
 */
export interface TmuxResult {
  stdout: string;
  stderr: string;
}

/**
 * Tmux configuration
 */
interface TmuxConfig {
  timeout?: number;
  busyPatterns: string[];
  idlePatterns: string[];
}

export class TmuxClient {
  private config: TmuxConfig;

  constructor(config: Partial<TmuxConfig> = {}) {
    this.config = {
      timeout: 5000,
      busyPatterns: config.busyPatterns || ['thinking', 'Esc to interrupt', 'Effecting…', 'Boondoggling…', 'Puzzling…'],
      idlePatterns: config.idlePatterns || ['❯ ', 'bypass permissions on'],
    };
  }

  /**
   * Execute tmux command
   */
  async exec(args: string[]): Promise<TmuxResult> {
    try {
      const { stdout, stderr } = await execFileAsync('tmux', args, {
        timeout: this.config.timeout,
      });

      return { stdout, stderr };
    } catch (error: any) {
      throw new Error(`Tmux command failed: ${error.message}`);
    }
  }

  /**
   * Get agent ID from pane
   */
  async getAgentId(paneTarget: string): Promise<AgentId | null> {
    try {
      const result = await this.exec([
        'display-message',
        '-t',
        paneTarget,
        '-p',
        '#{@agent_id}',
      ]);

      const agentId = result.stdout.trim();
      if (!agentId) {
        return null;
      }

      return agentId as AgentId;
    } catch (error) {
      return null;
    }
  }

  /**
   * Send keys to pane
   */
  async sendKeys(paneTarget: string, keys: string): Promise<void> {
    await this.exec(['send-keys', '-t', paneTarget, keys]);
  }

  /**
   * Send Enter to pane
   */
  async sendEnter(paneTarget: string): Promise<void> {
    await this.exec(['send-keys', '-t', paneTarget, 'Enter']);
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<string[]> {
    try {
      const result = await this.exec(['list-sessions', '-F', '#{session_name}']);
      return result.stdout.trim().split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  /**
   * List all panes in a session
   */
  async listPanes(session: string): Promise<string[]> {
    try {
      const result = await this.exec([
        'list-panes',
        '-t',
        session,
        '-F',
        '#{pane_id}',
      ]);
      return result.stdout.trim().split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if session exists
   */
  async sessionExists(session: string): Promise<boolean> {
    try {
      await this.exec(['has-session', '-t', session]);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
let instance: TmuxClient | null = null;

export function getTmuxClient(config?: Partial<TmuxConfig>): TmuxClient {
  if (!instance) {
    instance = new TmuxClient(config);
  }
  return instance;
}
