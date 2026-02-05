/**
 * Report management tools (Tools 6-8)
 *
 * - ojousama_get_report: Get specific report
 * - ojousama_list_reports: List all reports with filters
 * - ojousama_get_pending_reports: Get unacknowledged reports (secretary's key tool)
 */

import fs from 'fs/promises';
import path from 'path';
import type { Report, AgentId } from '../types/interfaces.js';
import type { YamlCache } from '../lib/yaml-cache.js';

export interface ReportFilter {
  worker_id?: AgentId;
  status?: 'done' | 'blocked' | 'error';
  ack?: boolean;
}

export class ReportManager {
  constructor(
    private queueDir: string,
    private yamlCache: YamlCache
  ) {}

  /**
   * Get report by worker_id
   */
  async getReport(workerId: AgentId): Promise<Report | null> {
    const reportFile = path.join(this.queueDir, 'reports', `${workerId}_report.yaml`);
    return await this.yamlCache.get<Report>(reportFile);
  }

  /**
   * Get report by task_id (search all report files)
   */
  async getReportByTaskId(taskId: string): Promise<Report | null> {
    const reportsDir = path.join(this.queueDir, 'reports');

    try {
      const files = await fs.readdir(reportsDir);

      for (const file of files) {
        if (file.endsWith('_report.yaml')) {
          const reportFile = path.join(reportsDir, file);
          const report = await this.yamlCache.get<Report>(reportFile);

          if (report && report.task_id === taskId) {
            return report;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to search reports:', error);
      return null;
    }
  }

  /**
   * List all reports with optional filtering
   */
  async listReports(filter?: ReportFilter): Promise<Report[]> {
    const reportsDir = path.join(this.queueDir, 'reports');
    const reports: Report[] = [];

    try {
      const files = await fs.readdir(reportsDir);

      for (const file of files) {
        if (file.endsWith('_report.yaml')) {
          const reportFile = path.join(reportsDir, file);
          const report = await this.yamlCache.get<Report>(reportFile);

          if (report && this.matchesFilter(report, filter)) {
            reports.push(report);
          }
        }
      }

      return reports;
    } catch (error) {
      console.error('Failed to list reports:', error);
      return [];
    }
  }

  /**
   * Get pending reports (ack: false or missing)
   * This is the secretary's most important tool
   */
  async getPendingReports(): Promise<{
    count: number;
    pending: Report[];
  }> {
    const reportsDir = path.join(this.queueDir, 'reports');
    const pending: Report[] = [];

    try {
      const files = await fs.readdir(reportsDir);

      for (const file of files) {
        if (file.endsWith('_report.yaml')) {
          const reportFile = path.join(reportsDir, file);
          const report = await this.yamlCache.get<Report>(reportFile);

          if (report && (report.ack === false || report.ack === undefined)) {
            pending.push(report);
          }
        }
      }

      // Sort by timestamp (oldest first)
      pending.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      return {
        count: pending.length,
        pending,
      };
    } catch (error) {
      console.error('Failed to get pending reports:', error);
      return {
        count: 0,
        pending: [],
      };
    }
  }

  /**
   * Get reports by status
   */
  async getReportsByStatus(status: 'done' | 'blocked' | 'error'): Promise<Report[]> {
    return await this.listReports({ status });
  }

  /**
   * Get unacknowledged reports
   */
  async getUnackedReports(): Promise<Report[]> {
    return await this.listReports({ ack: false });
  }

  /**
   * Check if report matches filter
   */
  private matchesFilter(report: Report, filter?: ReportFilter): boolean {
    if (!filter) {
      return true;
    }

    if (filter.worker_id && report.worker_id !== filter.worker_id) {
      return false;
    }

    if (filter.status && report.status !== filter.status) {
      return false;
    }

    if (filter.ack !== undefined) {
      const reportAck = report.ack ?? false;
      if (reportAck !== filter.ack) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get report file path
   */
  getReportFilePath(workerId: AgentId): string {
    return path.join(this.queueDir, 'reports', `${workerId}_report.yaml`);
  }

  /**
   * Check if report exists
   */
  async reportExists(workerId: AgentId): Promise<boolean> {
    const reportFile = this.getReportFilePath(workerId);
    try {
      await fs.access(reportFile);
      return true;
    } catch {
      return false;
    }
  }
}

export function createReportManager(queueDir: string, yamlCache: YamlCache): ReportManager {
  return new ReportManager(queueDir, yamlCache);
}
