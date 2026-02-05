/**
 * Communication status checker (Tool 10)
 *
 * - ojousama_check_communication_status: Health check for communication
 */

import type { Task, Report, CommunicationStatus } from '../types/interfaces.js';
import type { TaskManager } from './tasks.js';
import type { ReportManager } from './reports.js';
import { getDependencyResolver } from '../lib/dependency-resolver.js';

export interface CommunicationConfig {
  staleTaskThresholdMs?: number; // Default: 1 hour
}

export class CommunicationChecker {
  private staleTaskThresholdMs: number;

  constructor(
    private taskManager: TaskManager,
    private reportManager: ReportManager,
    config?: CommunicationConfig
  ) {
    this.staleTaskThresholdMs = config?.staleTaskThresholdMs ?? 3600000; // 1 hour
  }

  /**
   * Check communication status (health check)
   */
  async checkCommunicationStatus(): Promise<CommunicationStatus> {
    const [staleTasks, unackedReports, blockedTasks, circularDeps] = await Promise.all([
      this.detectStaleTasks(),
      this.detectUnackedReports(),
      this.detectBlockedTasks(),
      this.detectCircularDependencies(),
    ]);

    return {
      stale_tasks: staleTasks,
      unacked_reports: unackedReports,
      blocked_tasks: blockedTasks,
      circular_dependencies: circularDeps,
    };
  }

  /**
   * Detect stale tasks (assigned for too long)
   */
  async detectStaleTasks(): Promise<Task[]> {
    const assignedTasks = await this.taskManager.getAssignedTasks();
    const staleTasks: Task[] = [];
    const now = Date.now();

    for (const task of assignedTasks) {
      const taskTime = new Date(task.timestamp).getTime();
      const elapsed = now - taskTime;

      if (elapsed > this.staleTaskThresholdMs) {
        staleTasks.push(task);
      }
    }

    return staleTasks;
  }

  /**
   * Detect unacknowledged reports
   */
  async detectUnackedReports(): Promise<Report[]> {
    return await this.reportManager.getUnackedReports();
  }

  /**
   * Detect blocked tasks
   */
  async detectBlockedTasks(): Promise<Task[]> {
    return await this.taskManager.getBlockedTasks();
  }

  /**
   * Detect circular dependencies
   */
  async detectCircularDependencies(): Promise<string[][]> {
    return await this.taskManager.detectCircularDependencies();
  }

  /**
   * Get communication health score (0-100)
   */
  async getHealthScore(): Promise<{
    score: number;
    breakdown: {
      stale_tasks: number;
      unacked_reports: number;
      blocked_tasks: number;
      circular_deps: number;
    };
  }> {
    const status = await this.checkCommunicationStatus();

    // Calculate penalty for each issue
    const stalePenalty = status.stale_tasks.length * 10;
    const unackedPenalty = status.unacked_reports.length * 5;
    const blockedPenalty = status.blocked_tasks.length * 3;
    const circularPenalty = status.circular_dependencies.length * 20;

    const totalPenalty = Math.min(100, stalePenalty + unackedPenalty + blockedPenalty + circularPenalty);
    const score = Math.max(0, 100 - totalPenalty);

    return {
      score,
      breakdown: {
        stale_tasks: stalePenalty,
        unacked_reports: unackedPenalty,
        blocked_tasks: blockedPenalty,
        circular_deps: circularPenalty,
      },
    };
  }

  /**
   * Get communication issues summary
   */
  async getIssuesSummary(): Promise<{
    total_issues: number;
    critical: number;
    warnings: number;
    details: string[];
  }> {
    const status = await this.checkCommunicationStatus();
    const issues: string[] = [];
    let critical = 0;
    let warnings = 0;

    // Stale tasks
    if (status.stale_tasks.length > 0) {
      const severity = status.stale_tasks.length > 3 ? 'critical' : 'warning';
      if (severity === 'critical') critical++;
      else warnings++;

      issues.push(`${status.stale_tasks.length} stale tasks detected (assigned for > 1 hour)`);
    }

    // Unacked reports
    if (status.unacked_reports.length > 0) {
      warnings++;
      issues.push(`${status.unacked_reports.length} unacknowledged reports`);
    }

    // Blocked tasks
    if (status.blocked_tasks.length > 0) {
      warnings++;
      issues.push(`${status.blocked_tasks.length} blocked tasks`);
    }

    // Circular dependencies
    if (status.circular_dependencies.length > 0) {
      critical++;
      issues.push(`${status.circular_dependencies.length} circular dependencies detected`);
    }

    return {
      total_issues: issues.length,
      critical,
      warnings,
      details: issues,
    };
  }

  /**
   * Check if system is healthy
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.getHealthScore();
    return health.score >= 80;
  }

  /**
   * Get stale task threshold in milliseconds
   */
  getStaleTaskThreshold(): number {
    return this.staleTaskThresholdMs;
  }

  /**
   * Set stale task threshold
   */
  setStaleTaskThreshold(ms: number): void {
    this.staleTaskThresholdMs = ms;
  }
}

export function createCommunicationChecker(
  taskManager: TaskManager,
  reportManager: ReportManager,
  config?: CommunicationConfig
): CommunicationChecker {
  return new CommunicationChecker(taskManager, reportManager, config);
}
