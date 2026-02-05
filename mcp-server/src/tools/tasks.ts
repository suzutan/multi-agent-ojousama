/**
 * Task management tools (Tools 4-5)
 *
 * - ojousama_list_tasks: List all tasks with filtering
 * - ojousama_check_dependencies: Check task dependencies
 */

import fs from 'fs/promises';
import path from 'path';
import type { Task, TaskStatus, TaskPriority, AgentId, DependencyCheckResult } from '../types/interfaces.js';
import type { YamlCache } from '../lib/yaml-cache.js';
import { getDependencyResolver } from '../lib/dependency-resolver.js';

export interface TaskFilter {
  status?: TaskStatus;
  priority?: TaskPriority;
  project?: string;
  agent_id?: AgentId;
}

export class TaskManager {
  constructor(
    private queueDir: string,
    private yamlCache: YamlCache
  ) {}

  /**
   * Get task by agent_id
   */
  async getTaskByAgent(agentId: AgentId): Promise<Task | null> {
    const taskFile = path.join(this.queueDir, 'tasks', `${agentId}.yaml`);
    const data = await this.yamlCache.get<any>(taskFile);

    if (!data) {
      return null;
    }

    // Extract task from YAML structure
    if (data.task) {
      return data.task as Task;
    }

    return null;
  }

  /**
   * Get task by task_id (search all task files)
   */
  async getTaskById(taskId: string): Promise<Task | null> {
    const tasksDir = path.join(this.queueDir, 'tasks');

    try {
      const files = await fs.readdir(tasksDir);

      for (const file of files) {
        if (file.endsWith('.yaml')) {
          const taskFile = path.join(tasksDir, file);
          const data = await this.yamlCache.get<any>(taskFile);

          if (data && data.task && data.task.task_id === taskId) {
            return data.task as Task;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to search tasks:', error);
      return null;
    }
  }

  /**
   * List all tasks with optional filtering
   */
  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    const tasksDir = path.join(this.queueDir, 'tasks');
    const tasks: Task[] = [];

    try {
      const files = await fs.readdir(tasksDir);

      for (const file of files) {
        if (file.endsWith('.yaml')) {
          const taskFile = path.join(tasksDir, file);
          const data = await this.yamlCache.get<any>(taskFile);

          if (data && data.task) {
            const task = data.task as Task;

            if (this.matchesFilter(task, filter)) {
              tasks.push(task);
            }
          }
        }
      }

      return tasks;
    } catch (error) {
      console.error('Failed to list tasks:', error);
      return [];
    }
  }

  /**
   * Check task dependencies
   */
  async checkDependencies(taskId: string): Promise<DependencyCheckResult> {
    // Get all tasks
    const allTasks = await this.listTasks();

    // Find target task
    const task = allTasks.find(t => t.task_id === taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Use dependency resolver
    const resolver = getDependencyResolver();
    return await resolver.checkDependencies(taskId, allTasks);
  }

  /**
   * Get tasks by status
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return await this.listTasks({ status });
  }

  /**
   * Get tasks by priority
   */
  async getTasksByPriority(priority: TaskPriority): Promise<Task[]> {
    return await this.listTasks({ priority });
  }

  /**
   * Get tasks by project
   */
  async getTasksByProject(project: string): Promise<Task[]> {
    return await this.listTasks({ project });
  }

  /**
   * Get blocked tasks
   */
  async getBlockedTasks(): Promise<Task[]> {
    return await this.listTasks({ status: 'blocked' });
  }

  /**
   * Get pending tasks (can be assigned)
   */
  async getPendingTasks(): Promise<Task[]> {
    return await this.listTasks({ status: 'pending' });
  }

  /**
   * Get assigned tasks
   */
  async getAssignedTasks(): Promise<Task[]> {
    return await this.listTasks({ status: 'assigned' });
  }

  /**
   * Get completed tasks
   */
  async getCompletedTasks(): Promise<Task[]> {
    return await this.listTasks({ status: 'done' });
  }

  /**
   * Check if task matches filter
   */
  private matchesFilter(task: Task, filter?: TaskFilter): boolean {
    if (!filter) {
      return true;
    }

    if (filter.status && task.status !== filter.status) {
      return false;
    }

    if (filter.priority && task.priority !== filter.priority) {
      return false;
    }

    if (filter.project && task.project !== filter.project) {
      return false;
    }

    return true;
  }

  /**
   * Detect circular dependencies
   */
  async detectCircularDependencies(): Promise<string[][]> {
    const allTasks = await this.listTasks();
    const resolver = getDependencyResolver();
    return resolver.detectCircularDependencies(allTasks);
  }

  /**
   * Get tasks that are blocked by a specific task
   */
  async getTasksBlockedBy(taskId: string): Promise<Task[]> {
    const allTasks = await this.listTasks();
    const resolver = getDependencyResolver();
    return resolver.getBlockedByTask(taskId, allTasks);
  }

  /**
   * Build dependency graph
   */
  async buildDependencyGraph(): Promise<Map<string, string[]>> {
    const allTasks = await this.listTasks();
    const resolver = getDependencyResolver();
    return resolver.buildDependencyGraph(allTasks);
  }
}

export function createTaskManager(queueDir: string, yamlCache: YamlCache): TaskManager {
  return new TaskManager(queueDir, yamlCache);
}
