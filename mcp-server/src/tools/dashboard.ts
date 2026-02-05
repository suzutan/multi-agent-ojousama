/**
 * Dashboard management tool (Tool 9)
 *
 * - ojousama_get_dashboard_summary: Parse dashboard.md and return structured data
 */

import fs from 'fs/promises';
import type { DashboardSection, Task, SkillCandidate, AgentId } from '../types/interfaces.js';

export class DashboardManager {
  constructor(private dashboardPath: string) {}

  /**
   * Get dashboard summary (structured data from dashboard.md)
   */
  async getDashboardSummary(): Promise<DashboardSection> {
    try {
      const content = await fs.readFile(this.dashboardPath, 'utf-8');
      return this.parseDashboard(content);
    } catch (error) {
      console.error('Failed to read dashboard:', error);
      return {
        requires_attention: [],
        in_progress: [],
        achievements: [],
        skill_candidates: [],
      };
    }
  }

  /**
   * Parse dashboard.md content
   */
  private parseDashboard(content: string): DashboardSection {
    const sections = {
      requires_attention: [] as string[],
      in_progress: [] as Task[],
      achievements: [] as Array<{
        time: string;
        task_id: string;
        worker_id: AgentId;
        result: string;
      }>,
      skill_candidates: [] as SkillCandidate[],
    };

    // Split by sections
    const lines = content.split('\n');
    let currentSection: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect section headers
      if (line.startsWith('## 🚨 要対応') || line.startsWith('## 🚨 Requires Attention')) {
        currentSection = 'requires_attention';
        continue;
      } else if (line.startsWith('## 🔄 進行中') || line.startsWith('## 🔄 In Progress')) {
        currentSection = 'in_progress';
        continue;
      } else if (line.startsWith('## ✅ 本日の業務成果') || line.startsWith('## ✅ Today\'s Achievements')) {
        currentSection = 'achievements';
        continue;
      } else if (line.startsWith('## 🎯 スキル化候補') || line.startsWith('## 🎯 Skill Candidates')) {
        currentSection = 'skill_candidates';
        continue;
      } else if (line.startsWith('## ')) {
        // Other section - reset
        currentSection = null;
        continue;
      }

      // Parse section content
      if (currentSection === 'requires_attention' && line.startsWith('-')) {
        sections.requires_attention.push(line.substring(1).trim());
      } else if (currentSection === 'in_progress' && line.startsWith('-')) {
        // Parse: - **subtask_001** (maid1): Description [Status: assigned]
        const match = line.match(/\*\*(\w+)\*\*\s+\((\w+)\):\s+(.+?)\s+\[Status:\s+(\w+)\]/);
        if (match) {
          const [, taskId, agentId, description, status] = match;
          sections.in_progress.push({
            task_id: taskId,
            description,
            status: status as any,
            timestamp: new Date().toISOString(),
          });
        }
      } else if (currentSection === 'achievements' && line.startsWith('-')) {
        // Parse: - **12:34** - **subtask_001** (maid1): Result
        const match = line.match(/\*\*(\d{2}:\d{2})\*\*\s+-\s+\*\*(\w+)\*\*\s+\((\w+)\):\s+(.+)/);
        if (match) {
          const [, time, taskId, workerId, result] = match;
          sections.achievements.push({
            time,
            task_id: taskId,
            worker_id: workerId as AgentId,
            result,
          });
        }
      } else if (currentSection === 'skill_candidates' && line.startsWith('-')) {
        // Parse: - **skill_name** (score: 85, recommended: yes): Reason
        const match = line.match(/\*\*(.+?)\*\*\s+\(score:\s+(\d+),\s+recommended:\s+(yes|no)\):\s+(.+)/);
        if (match) {
          const [, name, score, recommended, reason] = match;
          sections.skill_candidates.push({
            name,
            score: parseInt(score, 10),
            recommended: recommended === 'yes',
            reason,
          });
        }
      }
    }

    return sections;
  }

  /**
   * Get requires attention items
   */
  async getRequiresAttention(): Promise<string[]> {
    const summary = await this.getDashboardSummary();
    return summary.requires_attention;
  }

  /**
   * Get in-progress tasks
   */
  async getInProgressTasks(): Promise<Task[]> {
    const summary = await this.getDashboardSummary();
    return summary.in_progress;
  }

  /**
   * Get today's achievements
   */
  async getTodayAchievements(): Promise<Array<{
    time: string;
    task_id: string;
    worker_id: AgentId;
    result: string;
  }>> {
    const summary = await this.getDashboardSummary();
    return summary.achievements;
  }

  /**
   * Get skill candidates
   */
  async getSkillCandidates(): Promise<SkillCandidate[]> {
    const summary = await this.getDashboardSummary();
    return summary.skill_candidates;
  }

  /**
   * Check if dashboard file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.dashboardPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get dashboard file path
   */
  getPath(): string {
    return this.dashboardPath;
  }
}

export function createDashboardManager(dashboardPath: string): DashboardManager {
  return new DashboardManager(dashboardPath);
}
