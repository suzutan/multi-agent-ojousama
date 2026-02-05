/**
 * Dependency resolver for task dependencies
 *
 * Recursively analyzes blocked_by fields to determine:
 * - Whether a task can be executed
 * - Which tasks are still pending
 * - Circular dependency detection
 */

import type { Task, DependencyCheckResult } from '../types/interfaces.js';

export class DependencyResolver {
  /**
   * Check if a task can be executed (all dependencies resolved)
   */
  async checkDependencies(
    taskId: string,
    allTasks: Task[]
  ): Promise<DependencyCheckResult> {
    const task = allTasks.find(t => t.task_id === taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // If no blocked_by field, task can execute
    if (!task.blocked_by || task.blocked_by.length === 0) {
      return {
        task_id: taskId,
        can_execute: true,
        pending_dependencies: [],
        blocked_tasks: [],
      };
    }

    // Recursively check dependencies
    const pendingDeps: string[] = [];
    const blockedTasks: Task[] = [];
    const visited = new Set<string>();

    await this.resolveDependencies(
      task.blocked_by,
      allTasks,
      pendingDeps,
      blockedTasks,
      visited
    );

    return {
      task_id: taskId,
      can_execute: pendingDeps.length === 0,
      pending_dependencies: pendingDeps,
      blocked_tasks: blockedTasks,
    };
  }

  /**
   * Recursively resolve dependencies
   */
  private async resolveDependencies(
    dependencies: string[],
    allTasks: Task[],
    pendingDeps: string[],
    blockedTasks: Task[],
    visited: Set<string>
  ): Promise<void> {
    for (const depId of dependencies) {
      // Check for circular dependency
      if (visited.has(depId)) {
        continue;
      }
      visited.add(depId);

      const depTask = allTasks.find(t => t.task_id === depId);

      if (!depTask) {
        // Dependency not found - might be from different source
        continue;
      }

      // Check if dependency is resolved
      if (depTask.status !== 'done') {
        pendingDeps.push(depId);
        blockedTasks.push(depTask);
      }

      // Recursively check nested dependencies
      if (depTask.blocked_by && depTask.blocked_by.length > 0) {
        await this.resolveDependencies(
          depTask.blocked_by,
          allTasks,
          pendingDeps,
          blockedTasks,
          visited
        );
      }
    }
  }

  /**
   * Detect circular dependencies in task graph
   */
  detectCircularDependencies(allTasks: Task[]): string[][] {
    const circular: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const task of allTasks) {
      if (!visited.has(task.task_id)) {
        const cycle = this.detectCycle(
          task.task_id,
          allTasks,
          visited,
          recursionStack,
          []
        );
        if (cycle.length > 0) {
          circular.push(cycle);
        }
      }
    }

    return circular;
  }

  /**
   * DFS-based cycle detection
   */
  private detectCycle(
    taskId: string,
    allTasks: Task[],
    visited: Set<string>,
    recursionStack: Set<string>,
    path: string[]
  ): string[] {
    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);

    const task = allTasks.find(t => t.task_id === taskId);

    if (task && task.blocked_by) {
      for (const depId of task.blocked_by) {
        if (!visited.has(depId)) {
          const cycle = this.detectCycle(
            depId,
            allTasks,
            visited,
            recursionStack,
            [...path]
          );
          if (cycle.length > 0) {
            return cycle;
          }
        } else if (recursionStack.has(depId)) {
          // Circular dependency detected
          const cycleStart = path.indexOf(depId);
          return path.slice(cycleStart);
        }
      }
    }

    recursionStack.delete(taskId);
    return [];
  }

  /**
   * Get all tasks that depend on a given task (reverse lookup)
   */
  getBlockedByTask(taskId: string, allTasks: Task[]): Task[] {
    return allTasks.filter(task =>
      task.blocked_by && task.blocked_by.includes(taskId)
    );
  }

  /**
   * Build dependency graph (adjacency list)
   */
  buildDependencyGraph(allTasks: Task[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const task of allTasks) {
      if (!graph.has(task.task_id)) {
        graph.set(task.task_id, []);
      }

      if (task.blocked_by) {
        for (const depId of task.blocked_by) {
          if (!graph.has(depId)) {
            graph.set(depId, []);
          }
          graph.get(depId)!.push(task.task_id);
        }
      }
    }

    return graph;
  }

  /**
   * Calculate task fingerprint (for caching)
   */
  calculateFingerprint(task: Task, allTasks: Task[]): string {
    const depStatuses = (task.blocked_by || [])
      .map(depId => {
        const depTask = allTasks.find(t => t.task_id === depId);
        return depTask ? `${depId}:${depTask.status}` : `${depId}:unknown`;
      })
      .sort()
      .join(',');

    return `${task.task_id}:${task.status}:${depStatuses}`;
  }
}

// Singleton instance
let instance: DependencyResolver | null = null;

export function getDependencyResolver(): DependencyResolver {
  if (!instance) {
    instance = new DependencyResolver();
  }
  return instance;
}
