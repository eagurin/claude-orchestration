import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { Logger } from '../utils/logger.js';

export interface QuickCaptureEntry {
  id: string;
  content: string;
  timestamp: number;
  source: 'cli' | 'agent' | 'system';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  metadata?: Record<string, any>;
}

export interface QuickCaptureOptions {
  autoSave: boolean;
  storageFile: string;
  maxEntries: number;
  enableTagging: boolean;
}

/**
 * Quick Memory Capture system with # prefix syntax
 * Enables rapid knowledge capture during CLI sessions and agent interactions
 */
export class QuickCapture extends EventEmitter {
  private logger: Logger;
  private entries: Map<string, QuickCaptureEntry> = new Map();
  private options: QuickCaptureOptions;
  private saveQueue: QuickCaptureEntry[] = [];
  private saveTimer?: NodeJS.Timeout;

  constructor(options: Partial<QuickCaptureOptions> = {}) {
    super();
    this.logger = new Logger('QuickCapture');
    this.options = {
      autoSave: true,
      storageFile: resolve(process.cwd(), '.claude', 'quick-memories.json'),
      maxEntries: 1000,
      enableTagging: true,
      ...options
    };

    this.setupAutoSave();
  }

  /**
   * Capture memory entry with # prefix syntax
   * Examples: 
   *   #Remember: Use 2-space indentation
   *   #Important: Database migrations at 2AM UTC
   *   #Bug: Issue with authentication timeout
   */
  async capture(input: string, source: QuickCaptureEntry['source'] = 'cli'): Promise<string> {
    // Parse # prefix syntax
    const parsed = this.parseQuickSyntax(input);
    if (!parsed) {
      throw new Error('Invalid quick capture syntax. Use #text or #tag: text');
    }

    const entry: QuickCaptureEntry = {
      id: this.generateId(),
      content: parsed.content,
      timestamp: Date.now(),
      source,
      priority: parsed.priority,
      tags: parsed.tags,
      metadata: {
        originalInput: input,
        sessionId: process.env.CLAUDE_SESSION_ID || 'unknown'
      }
    };

    // Store entry
    this.entries.set(entry.id, entry);
    this.logger.info(`Memory captured: ${entry.content.substring(0, 50)}...`, {
      id: entry.id,
      tags: entry.tags,
      priority: entry.priority
    });

    // Queue for saving
    if (this.options.autoSave) {
      this.queueForSave(entry);
    }

    // Emit event
    this.emit('memoryCaptured', entry);

    // Cleanup old entries if needed
    await this.cleanupOldEntries();

    return entry.id;
  }

  /**
   * Batch capture multiple entries
   */
  async captureMultiple(inputs: string[], source: QuickCaptureEntry['source'] = 'cli'): Promise<string[]> {
    const ids: string[] = [];
    
    for (const input of inputs) {
      try {
        const id = await this.capture(input, source);
        ids.push(id);
      } catch (error) {
        this.logger.warn(`Failed to capture: ${input}`, error);
      }
    }

    return ids;
  }

  /**
   * Search captured memories
   */
  search(query: string): QuickCaptureEntry[] {
    const lowercaseQuery = query.toLowerCase();
    const results: QuickCaptureEntry[] = [];

    for (const entry of this.entries.values()) {
      // Content search
      if (entry.content.toLowerCase().includes(lowercaseQuery)) {
        results.push(entry);
        continue;
      }

      // Tag search
      if (entry.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))) {
        results.push(entry);
        continue;
      }
    }

    // Sort by relevance and timestamp
    return results.sort((a, b) => {
      // Priority weight
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      const aScore = priorityWeight[a.priority];
      const bScore = priorityWeight[b.priority];
      
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      
      // Recent first
      return b.timestamp - a.timestamp;
    });
  }

  /**
   * Get entries by tag
   */
  getByTag(tag: string): QuickCaptureEntry[] {
    const results: QuickCaptureEntry[] = [];
    
    for (const entry of this.entries.values()) {
      if (entry.tags.includes(tag)) {
        results.push(entry);
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get recent entries
   */
  getRecent(limit: number = 10): QuickCaptureEntry[] {
    const entries = Array.from(this.entries.values());
    return entries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Delete entry
   */
  async delete(id: string): Promise<boolean> {
    const deleted = this.entries.delete(id);
    if (deleted) {
      this.logger.info(`Memory deleted: ${id}`);
      this.emit('memoryDeleted', id);
      
      if (this.options.autoSave) {
        await this.save();
      }
    }
    return deleted;
  }

  /**
   * Update entry content
   */
  async update(id: string, newContent: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) {
      return false;
    }

    const oldContent = entry.content;
    entry.content = newContent;
    entry.metadata = {
      ...entry.metadata,
      lastModified: Date.now(),
      previousContent: oldContent
    };

    this.logger.info(`Memory updated: ${id}`);
    this.emit('memoryUpdated', entry);

    if (this.options.autoSave) {
      this.queueForSave(entry);
    }

    return true;
  }

  /**
   * Export memories to file
   */
  async export(filePath: string, format: 'json' | 'markdown' | 'csv' = 'json'): Promise<void> {
    const entries = Array.from(this.entries.values());
    
    switch (format) {
      case 'json':
        await fs.writeFile(filePath, JSON.stringify(entries, null, 2));
        break;
        
      case 'markdown':
        const markdown = this.generateMarkdown(entries);
        await fs.writeFile(filePath, markdown);
        break;
        
      case 'csv':
        const csv = this.generateCSV(entries);
        await fs.writeFile(filePath, csv);
        break;
    }

    this.logger.info(`Memories exported to ${filePath}`, { format, count: entries.length });
  }

  /**
   * Import memories from file
   */
  async import(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const imported: QuickCaptureEntry[] = JSON.parse(content);
      
      let importedCount = 0;
      for (const entry of imported) {
        // Validate entry structure
        if (this.validateEntry(entry)) {
          this.entries.set(entry.id, entry);
          importedCount++;
        }
      }

      this.logger.info(`Imported ${importedCount} memories from ${filePath}`);
      this.emit('memoriesImported', importedCount);

      if (this.options.autoSave) {
        await this.save();
      }

      return importedCount;
    } catch (error) {
      this.logger.error(`Failed to import memories from ${filePath}`, error);
      throw error;
    }
  }

  /**
   * Load memories from storage
   */
  async load(): Promise<void> {
    try {
      await fs.access(this.options.storageFile);
      const content = await fs.readFile(this.options.storageFile, 'utf-8');
      const stored: QuickCaptureEntry[] = JSON.parse(content);
      
      this.entries.clear();
      for (const entry of stored) {
        if (this.validateEntry(entry)) {
          this.entries.set(entry.id, entry);
        }
      }

      this.logger.info(`Loaded ${this.entries.size} memories from storage`);
    } catch (error) {
      this.logger.info('No existing storage file found, starting fresh');
    }
  }

  /**
   * Save memories to storage
   */
  async save(): Promise<void> {
    try {
      const entries = Array.from(this.entries.values());
      const storageDir = dirname(this.options.storageFile);
      
      // Ensure directory exists
      await fs.mkdir(storageDir, { recursive: true });
      
      // Write to file
      await fs.writeFile(this.options.storageFile, JSON.stringify(entries, null, 2));
      
      this.logger.debug(`Saved ${entries.length} memories to storage`);
    } catch (error) {
      this.logger.error('Failed to save memories to storage', error);
      throw error;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalEntries: number;
    entriesBySource: Record<string, number>;
    entriesByPriority: Record<string, number>;
    topTags: Array<{ tag: string; count: number }>;
    recentActivity: { day: string; count: number }[];
  } {
    const entries = Array.from(this.entries.values());
    
    // Count by source
    const entriesBySource: Record<string, number> = {};
    const entriesByPriority: Record<string, number> = {};
    const tagCounts = new Map<string, number>();
    
    for (const entry of entries) {
      entriesBySource[entry.source] = (entriesBySource[entry.source] || 0) + 1;
      entriesByPriority[entry.priority] = (entriesByPriority[entry.priority] || 0) + 1;
      
      for (const tag of entry.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    // Top tags
    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recent activity (last 7 days)
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const recentActivity: { day: string; count: number }[] = [];
    
    for (let i = 6; i >= 0; i--) {
      const dayStart = now - (i * dayMs);
      const dayEnd = dayStart + dayMs;
      const day = new Date(dayStart).toISOString().split('T')[0];
      
      const count = entries.filter(entry => 
        entry.timestamp >= dayStart && entry.timestamp < dayEnd
      ).length;
      
      recentActivity.push({ day, count });
    }

    return {
      totalEntries: entries.length,
      entriesBySource,
      entriesByPriority,
      topTags,
      recentActivity
    };
  }

  private parseQuickSyntax(input: string): {
    content: string;
    priority: QuickCaptureEntry['priority'];
    tags: string[];
  } | null {
    // Must start with #
    if (!input.startsWith('#')) {
      return null;
    }

    const withoutHash = input.substring(1);
    
    // Parse priority keywords
    let priority: QuickCaptureEntry['priority'] = 'medium';
    let content = withoutHash;
    let tags: string[] = [];

    // Priority detection
    if (withoutHash.toLowerCase().startsWith('important:') || 
        withoutHash.toLowerCase().startsWith('urgent:')) {
      priority = 'high';
      content = withoutHash.substring(withoutHash.indexOf(':') + 1).trim();
      tags.push('important');
    } else if (withoutHash.toLowerCase().startsWith('note:') ||
               withoutHash.toLowerCase().startsWith('remember:')) {
      priority = 'medium';
      content = withoutHash.substring(withoutHash.indexOf(':') + 1).trim();
      tags.push('note');
    } else if (withoutHash.toLowerCase().startsWith('todo:') ||
               withoutHash.toLowerCase().startsWith('task:')) {
      priority = 'high';
      content = withoutHash.substring(withoutHash.indexOf(':') + 1).trim();
      tags.push('todo');
    } else if (withoutHash.toLowerCase().startsWith('bug:') ||
               withoutHash.toLowerCase().startsWith('issue:')) {
      priority = 'high';
      content = withoutHash.substring(withoutHash.indexOf(':') + 1).trim();
      tags.push('bug');
    }

    // Auto-tag based on content
    if (this.options.enableTagging) {
      tags.push(...this.extractAutoTags(content));
    }

    return {
      content: content.trim(),
      priority,
      tags: [...new Set(tags)] // Remove duplicates
    };
  }

  private extractAutoTags(content: string): string[] {
    const tags: string[] = [];
    const lowerContent = content.toLowerCase();

    // Technology tags
    const techKeywords = ['npm', 'git', 'docker', 'api', 'database', 'config', 'test', 'deploy'];
    for (const keyword of techKeywords) {
      if (lowerContent.includes(keyword)) {
        tags.push(keyword);
      }
    }

    // Pattern tags
    if (lowerContent.includes('error') || lowerContent.includes('fail')) {
      tags.push('error');
    }
    if (lowerContent.includes('fix') || lowerContent.includes('solve')) {
      tags.push('solution');
    }
    if (lowerContent.includes('perf') || lowerContent.includes('slow')) {
      tags.push('performance');
    }

    return tags;
  }

  private generateId(): string {
    return `qc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private setupAutoSave(): void {
    if (this.options.autoSave) {
      // Save every 30 seconds if there are pending changes
      this.saveTimer = setInterval(() => {
        if (this.saveQueue.length > 0) {
          this.save().catch(error => {
            this.logger.error('Auto-save failed', error);
          });
          this.saveQueue = [];
        }
      }, 30000);
    }
  }

  private queueForSave(entry: QuickCaptureEntry): void {
    this.saveQueue.push(entry);
  }

  private async cleanupOldEntries(): Promise<void> {
    if (this.entries.size > this.options.maxEntries) {
      const entries = Array.from(this.entries.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toDelete = entries.slice(0, entries.length - this.options.maxEntries);
      for (const [id] of toDelete) {
        this.entries.delete(id);
      }
      
      this.logger.info(`Cleaned up ${toDelete.length} old entries`);
    }
  }

  private validateEntry(entry: any): entry is QuickCaptureEntry {
    return (
      typeof entry.id === 'string' &&
      typeof entry.content === 'string' &&
      typeof entry.timestamp === 'number' &&
      ['cli', 'agent', 'system'].includes(entry.source) &&
      ['low', 'medium', 'high'].includes(entry.priority) &&
      Array.isArray(entry.tags)
    );
  }

  private generateMarkdown(entries: QuickCaptureEntry[]): string {
    let markdown = '# Quick Captured Memories\n\n';
    
    const sortedEntries = entries.sort((a, b) => b.timestamp - a.timestamp);
    
    for (const entry of sortedEntries) {
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      const time = new Date(entry.timestamp).toTimeString().split(' ')[0];
      const tags = entry.tags.length > 0 ? ` Tags: ${entry.tags.join(', ')}` : '';
      
      markdown += `## ${entry.content}\n\n`;
      markdown += `- **ID**: ${entry.id}\n`;
      markdown += `- **Date**: ${date} ${time}\n`;
      markdown += `- **Source**: ${entry.source}\n`;
      markdown += `- **Priority**: ${entry.priority}\n`;
      if (tags) {
        markdown += `- **Tags**: ${entry.tags.join(', ')}\n`;
      }
      markdown += '\n---\n\n';
    }
    
    return markdown;
  }

  private generateCSV(entries: QuickCaptureEntry[]): string {
    const headers = ['ID', 'Content', 'Timestamp', 'Date', 'Source', 'Priority', 'Tags'];
    let csv = headers.join(',') + '\n';
    
    for (const entry of entries) {
      const date = new Date(entry.timestamp).toISOString();
      const tags = entry.tags.join(';');
      const content = entry.content.replace(/"/g, '""'); // Escape quotes
      
      const row = [
        entry.id,
        `"${content}"`,
        entry.timestamp,
        date,
        entry.source,
        entry.priority,
        `"${tags}"`
      ];
      
      csv += row.join(',') + '\n';
    }
    
    return csv;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    
    // Final save if auto-save is enabled
    if (this.options.autoSave && this.saveQueue.length > 0) {
      this.save().catch(error => {
        this.logger.error('Final save failed', error);
      });
    }
  }
}