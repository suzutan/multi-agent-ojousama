/**
 * YAML Reader - NO CACHING
 *
 * This module reads YAML files directly from disk without any caching.
 * Every read operation fetches fresh data to avoid stale cache issues.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
}

export class YamlCache {
  // NO cache, watchers, or maxEntries - always read fresh from disk
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
  };

  constructor(maxEntries?: number) {
    // maxEntries ignored - no caching
  }

  /**
   * Get YAML data - ALWAYS load from file (NO CACHING)
   *
   * Critical: We NEVER cache YAML data because:
   * 1. Agents write to YAML files directly
   * 2. Cache can become stale between write and read
   * 3. fs.watch has latency (milliseconds delay)
   * 4. Stale cache causes incorrect task assignments
   */
  async get<T>(filePath: string): Promise<T | null> {
    const absolutePath = path.resolve(filePath);

    // ALWAYS load from file - NO cache check
    this.stats.misses++;
    try {
      const data = await this.loadYaml<T>(absolutePath);
      // NEVER cache - always return fresh data
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File not found - return null
        return null;
      }
      throw error;
    }
  }

  /**
   * Load YAML file
   */
  private async loadYaml<T>(filePath: string): Promise<T> {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = yaml.load(content) as T;
    return data;
  }

  // Cache methods removed - no caching implementation
  // All data is read fresh from disk on every request

  /**
   * Get statistics (no cache, but kept for compatibility)
   */
  getStats(): CacheStats & { size: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = 0; // Always 0 since we never cache

    return {
      ...this.stats,
      size: 0,  // No cache
      hitRate,
    };
  }

  /**
   * Cleanup resources (no-op, no cache to clean)
   */
  destroy(): void {
    // No cache to clean - no-op
  }
}

// Singleton instance
let instance: YamlCache | null = null;

export function getYamlCache(maxEntries?: number): YamlCache {
  if (!instance) {
    instance = new YamlCache(maxEntries);
  }
  return instance;
}
