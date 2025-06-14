import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { ImportResolver } from './import-resolver.js';
import { QuickCapture } from './quick-capture.js';
import { SemanticSearch } from './semantic-search.js';
import { MemoryLinter } from './memory-linter.js';
import type { MemoryConfig, Task, TaskResult } from '../types/index.js';

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, any>;
  timestamp: number;
  source: string;
  userId?: string;
}

export interface ContextResult {
  relevantMemories: MemoryEntry[];
  claudeInstructions: string;
  quickCaptureEntries: any[];
  totalContext: string;
}

/**
 * Enhanced Memory Manager with full mem0 integration
 * Combines CLAUDE.md, quick capture, semantic search, and validation
 */
export class MemoryManager extends EventEmitter {
  private config: MemoryConfig;
  private logger: Logger;
  private importResolver: ImportResolver;
  private quickCapture: QuickCapture;
  private semanticSearch: SemanticSearch;
  private memoryLinter: MemoryLinter;
  private isConnected = false;
  private memoryCache: Map<string, MemoryEntry> = new Map();
  
  constructor(config: MemoryConfig) {
    super();
    this.config = config;
    this.logger = new Logger('MemoryManager');
    
    // Initialize sub-components
    this.importResolver = new ImportResolver();
    this.quickCapture = new QuickCapture({
      autoSave: true,
      storageFile: './claude/quick-memories.json'
    });
    this.semanticSearch = new SemanticSearch();
    this.memoryLinter = new MemoryLinter();
    
    this.setupEventHandlers();
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.warn('Already connected to memory system');
      return;
    }

    try {
      this.logger.info('Connecting to memory system...');
      
      // Load quick capture memories
      await this.quickCapture.load();
      
      // Load and index CLAUDE.md files
      await this.loadClaudeInstructions();
      
      // Initialize semantic search index
      await this.initializeSemanticIndex();
      
      this.isConnected = true;
      this.logger.info('Memory system connected successfully');
      this.emit('connected');
    } catch (error) {
      this.logger.error('Failed to connect to memory system', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      this.logger.info('Disconnecting from memory system...');
      
      // Save quick capture data
      await this.quickCapture.save();
      
      // Cleanup resources
      this.quickCapture.dispose();
      this.importResolver.clearCache();
      this.memoryCache.clear();
      
      this.isConnected = false;
      this.logger.info('Memory system disconnected');
      this.emit('disconnected');
    } catch (error) {
      this.logger.error('Error during memory system disconnect', error);
      throw error;
    }
  }

  async getRelevantContext(description: string): Promise<ContextResult> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      // Search semantic memory
      const searchResults = await this.semanticSearch.search(description, {
        maxResults: 10,
        minRelevanceScore: 0.3,
        includeContext: true
      });

      // Get quick capture entries
      const quickEntries = this.quickCapture.search(description);

      // Get CLAUDE.md instructions
      const claudeInstructions = await this.getClaudeInstructions();

      // Build context
      const relevantMemories: MemoryEntry[] = searchResults.map(result => ({
        id: result.id,
        content: result.content,
        metadata: result.metadata,
        timestamp: result.timestamp,
        source: result.source
      }));

      const totalContext = this.buildContextString(
        claudeInstructions,
        relevantMemories,
        quickEntries.slice(0, 5) // Top 5 quick entries
      );

      const contextResult: ContextResult = {
        relevantMemories,
        claudeInstructions,
        quickCaptureEntries: quickEntries.slice(0, 5),
        totalContext
      };

      this.logger.debug('Retrieved relevant context', {
        description: description.substring(0, 50),
        memoriesFound: relevantMemories.length,
        quickEntriesFound: quickEntries.length,
        contextLength: totalContext.length
      });

      return contextResult;
    } catch (error) {
      this.logger.error('Failed to get relevant context', error);
      throw error;
    }
  }

  async storeResult(task: Task, result: TaskResult): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      const memoryEntry: MemoryEntry = {
        id: `task_${task.id}_${Date.now()}`,
        content: this.buildTaskResultMemory(task, result),
        metadata: {
          taskId: task.id,
          pattern: task.pattern,
          success: result.success,
          executionTime: result.executionTime,
          agentsUsed: result.agentsUsed,
          timestamp: Date.now(),
          ...task.metadata,
          ...result.metadata
        },
        timestamp: Date.now(),
        source: 'task_result',
        userId: this.config.userId
      };

      // Store in cache
      this.memoryCache.set(memoryEntry.id, memoryEntry);

      // Index for semantic search
      await this.semanticSearch.indexMemory(
        memoryEntry.id,
        memoryEntry.content,
        memoryEntry.metadata,
        memoryEntry.source
      );

      this.logger.info(`Stored task result in memory: ${task.id}`, {
        pattern: task.pattern,
        success: result.success,
        memoryId: memoryEntry.id
      });

      this.emit('resultStored', { task, result, memoryEntry });
    } catch (error) {
      this.logger.error('Failed to store task result', error);
      throw error;
    }
  }

  /**
   * Store arbitrary memory entry
   */
  async storeMemory(content: string, metadata: Record<string, any> = {}, source = 'manual'): Promise<string> {
    const memoryEntry: MemoryEntry = {
      id: `memory_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      content,
      metadata: {
        ...metadata,
        createdAt: Date.now()
      },
      timestamp: Date.now(),
      source,
      userId: this.config.userId
    };

    // Validate with linter
    const lintResult = await this.memoryLinter.lintMemory(content);
    if (lintResult.score < 50) {
      this.logger.warn(`Low quality memory entry (score: ${lintResult.score})`, {
        id: memoryEntry.id,
        issues: lintResult.issues.length
      });
    }

    // Store in cache
    this.memoryCache.set(memoryEntry.id, memoryEntry);

    // Index for semantic search
    await this.semanticSearch.indexMemory(
      memoryEntry.id,
      memoryEntry.content,
      memoryEntry.metadata,
      memoryEntry.source
    );

    this.logger.info(`Stored memory entry: ${memoryEntry.id}`);
    return memoryEntry.id;
  }

  /**
   * Quick capture with # prefix syntax
   */
  async quickCaptureMemory(input: string): Promise<string> {
    const entryId = await this.quickCapture.capture(input, 'cli');
    
    // Also store in semantic index for search
    const entry = this.quickCapture.getRecent(1)[0];
    if (entry) {
      await this.semanticSearch.indexMemory(
        entryId,
        entry.content,
        {
          quickCapture: true,
          priority: entry.priority,
          tags: entry.tags
        },
        'quick_capture'
      );
    }

    return entryId;
  }

  /**
   * Search memories using semantic search
   */
  async searchMemories(query: string, options: any = {}): Promise<any[]> {
    return await this.semanticSearch.search(query, options);
  }

  /**
   * Get memory quality analysis
   */
  async analyzeMemoryQuality(content: string): Promise<any> {
    const lintResult = await this.memoryLinter.lintMemory(content);
    const qualityMetrics = this.memoryLinter.calculateQualityMetrics(content);
    const suggestions = this.memoryLinter.getSuggestions(content);

    return {
      lintResult,
      qualityMetrics,
      suggestions
    };
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): any {
    return {
      totalEntries: this.memoryCache.size,
      quickCaptureStats: this.quickCapture.getStats(),
      semanticIndexStats: this.semanticSearch.getIndexStats(),
      cacheStats: this.importResolver.getCacheStats()
    };
  }

  /**
   * Export all memories
   */
  async exportMemories(format: 'json' | 'markdown' = 'json'): Promise<string> {
    const memories = Array.from(this.memoryCache.values());
    const quickCaptures = this.quickCapture.getRecent(1000);
    
    const exportData = {
      memories,
      quickCaptures,
      semanticIndex: this.semanticSearch.exportIndex(),
      metadata: {
        exported: Date.now(),
        version: '1.0.0',
        totalEntries: memories.length + quickCaptures.length
      }
    };

    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    } else {
      return this.generateMarkdownExport(exportData);
    }
  }

  private async loadClaudeInstructions(): Promise<void> {
    try {
      const claudePaths = [
        './CLAUDE.md',
        './.claude/CLAUDE.md',
        './claude/CLAUDE.md'
      ];

      for (const path of claudePaths) {
        try {
          const imports = await this.importResolver.resolveImports(path);
          
          for (const importedContent of imports) {
            await this.semanticSearch.indexMemory(
              `claude_${importedContent.path}`,
              importedContent.content,
              {
                filePath: importedContent.path,
                depth: importedContent.depth,
                importedAt: importedContent.timestamp
              },
              'claude_md'
            );
          }
          
          this.logger.info(`Loaded CLAUDE.md instructions from ${path}`, {
            imports: imports.length
          });
          
          return; // Success, exit
        } catch (error) {
          // Try next path
          continue;
        }
      }
      
      this.logger.warn('No CLAUDE.md file found in standard locations');
    } catch (error) {
      this.logger.error('Failed to load CLAUDE.md instructions', error);
    }
  }

  private async initializeSemanticIndex(): Promise<void> {
    // Index existing quick capture entries
    const quickEntries = this.quickCapture.getRecent(1000);
    
    for (const entry of quickEntries) {
      await this.semanticSearch.indexMemory(
        entry.id,
        entry.content,
        {
          quickCapture: true,
          priority: entry.priority,
          tags: entry.tags,
          timestamp: entry.timestamp
        },
        'quick_capture'
      );
    }

    this.logger.info('Initialized semantic search index', {
      quickEntries: quickEntries.length
    });
  }

  private async getClaudeInstructions(): Promise<string> {
    const claudeResults = this.semanticSearch.getByKeywords(['claude', 'instructions', 'commands']);
    
    return claudeResults
      .map(result => result.content)
      .join('\n\n---\n\n');
  }

  private buildContextString(
    claudeInstructions: string,
    memories: MemoryEntry[],
    quickEntries: any[]
  ): string {
    let context = '';

    if (claudeInstructions) {
      context += '# CLAUDE.md Instructions\n\n';
      context += claudeInstructions + '\n\n';
    }

    if (memories.length > 0) {
      context += '# Relevant Memories\n\n';
      for (const memory of memories) {
        context += `## ${memory.source} (${new Date(memory.timestamp).toISOString()})\n`;
        context += memory.content + '\n\n';
      }
    }

    if (quickEntries.length > 0) {
      context += '# Quick Captures\n\n';
      for (const entry of quickEntries) {
        context += `- ${entry.content} (${entry.priority})\n`;
      }
      context += '\n';
    }

    return context;
  }

  private buildTaskResultMemory(task: Task, result: TaskResult): string {
    let memory = `Task: ${task.description}\n`;
    memory += `Pattern: ${task.pattern}\n`;
    memory += `Success: ${result.success}\n`;
    memory += `Execution Time: ${result.executionTime}ms\n`;
    
    if (result.success && result.result) {
      memory += `Result: ${JSON.stringify(result.result, null, 2)}\n`;
    }
    
    if (result.error) {
      memory += `Error: ${result.error}\n`;
    }
    
    if (result.agentsUsed?.length > 0) {
      memory += `Agents Used: ${result.agentsUsed.join(', ')}\n`;
    }

    return memory;
  }

  private setupEventHandlers(): void {
    this.quickCapture.on('memoryCaptured', (entry) => {
      this.emit('memoryCaptured', entry);
    });

    this.semanticSearch.on('searchCompleted', (data) => {
      this.emit('searchCompleted', data);
    });

    this.importResolver.on('error', (error: Error) => {
      this.logger.error('Import resolver error', error);
    });
  }

  private generateMarkdownExport(exportData: any): string {
    let markdown = '# Memory Export\n\n';
    markdown += `Exported: ${new Date(exportData.metadata.exported).toISOString()}\n`;
    markdown += `Total Entries: ${exportData.metadata.totalEntries}\n\n`;

    markdown += '## Memories\n\n';
    for (const memory of exportData.memories) {
      markdown += `### ${memory.id}\n`;
      markdown += `Source: ${memory.source}\n`;
      markdown += `Date: ${new Date(memory.timestamp).toISOString()}\n\n`;
      markdown += memory.content + '\n\n---\n\n';
    }

    markdown += '## Quick Captures\n\n';
    for (const entry of exportData.quickCaptures) {
      markdown += `- **${entry.content}** (${entry.priority})\n`;
      markdown += `  - Tags: ${entry.tags.join(', ')}\n`;
      markdown += `  - Date: ${new Date(entry.timestamp).toISOString()}\n\n`;
    }

    return markdown;
  }
}