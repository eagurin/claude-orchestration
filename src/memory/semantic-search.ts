import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';

export interface SearchResult {
  id: string;
  content: string;
  relevanceScore: number;
  metadata: Record<string, any>;
  context?: string;
  source: string;
  timestamp: number;
}

export interface SearchOptions {
  maxResults: number;
  minRelevanceScore: number;
  includeContext: boolean;
  searchScope: 'all' | 'recent' | 'important';
  timeRange?: {
    start: number;
    end: number;
  };
}

export interface MemoryIndex {
  id: string;
  content: string;
  vectors: number[];
  keywords: string[];
  entities: string[];
  metadata: Record<string, any>;
  timestamp: number;
  source: string;
}

/**
 * Semantic Search for memory retrieval
 * Provides context-aware memory ranking and advanced search capabilities
 */
export class SemanticSearch extends EventEmitter {
  private logger: Logger;
  private memoryIndex: Map<string, MemoryIndex> = new Map();
  private keywordInvertedIndex: Map<string, Set<string>> = new Map();
  private entityIndex: Map<string, Set<string>> = new Map();
  private vectorDimensions = 384; // Common embedding dimension
  
  constructor() {
    super();
    this.logger = new Logger('SemanticSearch');
  }

  /**
   * Index memory content for semantic search
   */
  async indexMemory(
    id: string, 
    content: string, 
    metadata: Record<string, any> = {},
    source: string = 'unknown'
  ): Promise<void> {
    try {
      // Extract keywords and entities
      const keywords = this.extractKeywords(content);
      const entities = this.extractEntities(content);
      
      // Generate semantic vectors (simplified implementation)
      const vectors = await this.generateSemanticVectors(content);
      
      const memoryEntry: MemoryIndex = {
        id,
        content,
        vectors,
        keywords,
        entities,
        metadata,
        timestamp: Date.now(),
        source
      };

      // Store in main index
      this.memoryIndex.set(id, memoryEntry);
      
      // Update inverted indexes
      this.updateInvertedIndexes(id, keywords, entities);
      
      this.logger.debug(`Indexed memory: ${id}`, { 
        keywords: keywords.length, 
        entities: entities.length 
      });
      
      this.emit('memoryIndexed', { id, keywords, entities });
    } catch (error) {
      this.logger.error(`Failed to index memory ${id}`, error);
      throw error;
    }
  }

  /**
   * Search memories using semantic similarity and keyword matching
   */
  async search(query: string, options: Partial<SearchOptions> = {}): Promise<SearchResult[]> {
    const opts: SearchOptions = {
      maxResults: 20,
      minRelevanceScore: 0.1,
      includeContext: true,
      searchScope: 'all',
      ...options
    };

    this.logger.info(`Searching memories for: "${query}"`, opts);

    try {
      // Generate query vectors
      const queryVectors = await this.generateSemanticVectors(query);
      const queryKeywords = this.extractKeywords(query);
      const queryEntities = this.extractEntities(query);

      // Get candidate memories
      const candidates = this.getCandidateMemories(queryKeywords, queryEntities, opts);
      
      // Calculate relevance scores
      const scoredResults: SearchResult[] = [];
      
      for (const memory of candidates) {
        const relevanceScore = this.calculateRelevanceScore(
          query,
          queryVectors,
          queryKeywords,
          queryEntities,
          memory
        );

        if (relevanceScore >= opts.minRelevanceScore) {
          const result: SearchResult = {
            id: memory.id,
            content: memory.content,
            relevanceScore,
            metadata: memory.metadata,
            source: memory.source,
            timestamp: memory.timestamp
          };

          if (opts.includeContext) {
            result.context = this.generateContext(memory, query);
          }

          scoredResults.push(result);
        }
      }

      // Sort by relevance score
      scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      // Apply result limit
      const results = scoredResults.slice(0, opts.maxResults);
      
      this.logger.info(`Found ${results.length} relevant memories`, {
        query,
        totalCandidates: candidates.length,
        averageScore: results.length > 0 ? 
          results.reduce((sum, r) => sum + r.relevanceScore, 0) / results.length : 0
      });

      this.emit('searchCompleted', { query, results: results.length });
      
      return results;
    } catch (error) {
      this.logger.error(`Search failed for query: "${query}"`, error);
      throw error;
    }
  }

  /**
   * Find similar memories to a given memory
   */
  async findSimilar(memoryId: string, options: Partial<SearchOptions> = {}): Promise<SearchResult[]> {
    const memory = this.memoryIndex.get(memoryId);
    if (!memory) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    // Use the memory content as query
    return this.search(memory.content, {
      ...options,
      searchScope: 'all'
    });
  }

  /**
   * Get memories by keywords
   */
  getByKeywords(keywords: string[]): SearchResult[] {
    const memoryIds = new Set<string>();
    
    // Find memories containing any of the keywords
    for (const keyword of keywords) {
      const ids = this.keywordInvertedIndex.get(keyword.toLowerCase());
      if (ids) {
        ids.forEach(id => memoryIds.add(id));
      }
    }

    // Convert to search results
    const results: SearchResult[] = [];
    for (const id of memoryIds) {
      const memory = this.memoryIndex.get(id);
      if (memory) {
        results.push({
          id: memory.id,
          content: memory.content,
          relevanceScore: this.calculateKeywordRelevance(keywords, memory.keywords),
          metadata: memory.metadata,
          source: memory.source,
          timestamp: memory.timestamp
        });
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Get memories by entities (people, places, organizations)
   */
  getByEntities(entities: string[]): SearchResult[] {
    const memoryIds = new Set<string>();
    
    for (const entity of entities) {
      const ids = this.entityIndex.get(entity.toLowerCase());
      if (ids) {
        ids.forEach(id => memoryIds.add(id));
      }
    }

    const results: SearchResult[] = [];
    for (const id of memoryIds) {
      const memory = this.memoryIndex.get(id);
      if (memory) {
        results.push({
          id: memory.id,
          content: memory.content,
          relevanceScore: this.calculateEntityRelevance(entities, memory.entities),
          metadata: memory.metadata,
          source: memory.source,
          timestamp: memory.timestamp
        });
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Get trending keywords
   */
  getTrendingKeywords(timeWindow: number = 7 * 24 * 60 * 60 * 1000): Array<{ keyword: string; count: number; trend: number }> {
    const now = Date.now();
    const windowStart = now - timeWindow;
    
    const keywordCounts = new Map<string, { total: number; recent: number }>();
    
    for (const memory of this.memoryIndex.values()) {
      const isRecent = memory.timestamp >= windowStart;
      
      for (const keyword of memory.keywords) {
        const current = keywordCounts.get(keyword) || { total: 0, recent: 0 };
        current.total++;
        if (isRecent) {
          current.recent++;
        }
        keywordCounts.set(keyword, current);
      }
    }

    // Calculate trend scores
    const trending: Array<{ keyword: string; count: number; trend: number }> = [];
    
    for (const [keyword, counts] of keywordCounts.entries()) {
      if (counts.total >= 3) { // Minimum threshold
        const trend = counts.recent / Math.max(counts.total - counts.recent, 1);
        trending.push({
          keyword,
          count: counts.total,
          trend
        });
      }
    }

    return trending.sort((a, b) => b.trend - a.trend).slice(0, 20);
  }

  /**
   * Update memory index
   */
  async updateMemory(id: string, newContent: string, metadata: Record<string, any> = {}): Promise<void> {
    const existingMemory = this.memoryIndex.get(id);
    if (!existingMemory) {
      throw new Error(`Memory not found: ${id}`);
    }

    // Remove from old indexes
    this.removeFromInvertedIndexes(id, existingMemory.keywords, existingMemory.entities);
    
    // Re-index with new content
    await this.indexMemory(id, newContent, {
      ...existingMemory.metadata,
      ...metadata,
      lastModified: Date.now()
    }, existingMemory.source);
  }

  /**
   * Remove memory from index
   */
  removeMemory(id: string): boolean {
    const memory = this.memoryIndex.get(id);
    if (!memory) {
      return false;
    }

    // Remove from inverted indexes
    this.removeFromInvertedIndexes(id, memory.keywords, memory.entities);
    
    // Remove from main index
    this.memoryIndex.delete(id);
    
    this.logger.debug(`Removed memory from index: ${id}`);
    this.emit('memoryRemoved', id);
    
    return true;
  }

  /**
   * Get index statistics
   */
  getIndexStats(): {
    totalMemories: number;
    totalKeywords: number;
    totalEntities: number;
    averageVectorSize: number;
    indexSize: number;
  } {
    const totalKeywords = this.keywordInvertedIndex.size;
    const totalEntities = this.entityIndex.size;
    const memories = Array.from(this.memoryIndex.values());
    
    const averageVectorSize = memories.length > 0 ? 
      memories.reduce((sum, m) => sum + m.vectors.length, 0) / memories.length : 0;
    
    // Estimate index size in bytes
    const indexSize = JSON.stringify(Array.from(this.memoryIndex.values())).length;

    return {
      totalMemories: this.memoryIndex.size,
      totalKeywords,
      totalEntities,
      averageVectorSize,
      indexSize
    };
  }

  /**
   * Export search index
   */
  exportIndex(): {
    memories: MemoryIndex[];
    keywords: Record<string, string[]>;
    entities: Record<string, string[]>;
    metadata: {
      exported: number;
      version: string;
    };
  } {
    const memories = Array.from(this.memoryIndex.values());
    
    const keywords: Record<string, string[]> = {};
    for (const [keyword, ids] of this.keywordInvertedIndex.entries()) {
      keywords[keyword] = Array.from(ids);
    }
    
    const entities: Record<string, string[]> = {};
    for (const [entity, ids] of this.entityIndex.entries()) {
      entities[entity] = Array.from(ids);
    }

    return {
      memories,
      keywords,
      entities,
      metadata: {
        exported: Date.now(),
        version: '1.0.0'
      }
    };
  }

  /**
   * Import search index
   */
  importIndex(indexData: ReturnType<typeof this.exportIndex>): number {
    this.memoryIndex.clear();
    this.keywordInvertedIndex.clear();
    this.entityIndex.clear();

    // Import memories
    for (const memory of indexData.memories) {
      this.memoryIndex.set(memory.id, memory);
    }

    // Import keyword index
    for (const [keyword, ids] of Object.entries(indexData.keywords)) {
      this.keywordInvertedIndex.set(keyword, new Set(ids));
    }

    // Import entity index
    for (const [entity, ids] of Object.entries(indexData.entities)) {
      this.entityIndex.set(entity, new Set(ids));
    }

    this.logger.info(`Imported search index`, {
      memories: indexData.memories.length,
      keywords: Object.keys(indexData.keywords).length,
      entities: Object.keys(indexData.entities).length
    });

    return indexData.memories.length;
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction (can be enhanced with NLP libraries)
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Remove common stop words
    const stopWords = new Set(['the', 'and', 'but', 'for', 'are', 'with', 'his', 'they', 'this', 'have', 'from', 'not', 'been', 'that', 'will', 'what', 'can', 'all']);
    
    return words.filter(word => !stopWords.has(word));
  }

  private extractEntities(text: string): string[] {
    // Simplified entity extraction (can be enhanced with NER models)
    const entities: string[] = [];
    
    // Detect potential names (capitalized words)
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^\w]/g, '');
      if (word.length > 2 && word[0] === word[0].toUpperCase()) {
        entities.push(word);
      }
    }

    // Detect common patterns
    const patterns = [
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // Names like "John Smith"
      /\b[A-Z]{2,}\b/g, // Acronyms like "API", "URL"
      /\b\w+\.com\b/g, // Domains
      /\b\w+@\w+\.\w+\b/g // Emails
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        entities.push(...matches);
      }
    }

    return [...new Set(entities)]; // Remove duplicates
  }

  private async generateSemanticVectors(text: string): Promise<number[]> {
    // Simplified vector generation (in production, use proper embedding models)
    // This is a basic implementation for demonstration
    
    const words = this.extractKeywords(text);
    const vector = new Array(this.vectorDimensions).fill(0);
    
    // Simple hash-based vector generation
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = this.simpleHash(word);
      const index = Math.abs(hash) % this.vectorDimensions;
      vector[index] += 1 / (i + 1); // Position weighting
    }

    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  private updateInvertedIndexes(id: string, keywords: string[], entities: string[]): void {
    // Update keyword index
    for (const keyword of keywords) {
      const key = keyword.toLowerCase();
      if (!this.keywordInvertedIndex.has(key)) {
        this.keywordInvertedIndex.set(key, new Set());
      }
      this.keywordInvertedIndex.get(key)!.add(id);
    }

    // Update entity index
    for (const entity of entities) {
      const key = entity.toLowerCase();
      if (!this.entityIndex.has(key)) {
        this.entityIndex.set(key, new Set());
      }
      this.entityIndex.get(key)!.add(id);
    }
  }

  private removeFromInvertedIndexes(id: string, keywords: string[], entities: string[]): void {
    // Remove from keyword index
    for (const keyword of keywords) {
      const key = keyword.toLowerCase();
      const ids = this.keywordInvertedIndex.get(key);
      if (ids) {
        ids.delete(id);
        if (ids.size === 0) {
          this.keywordInvertedIndex.delete(key);
        }
      }
    }

    // Remove from entity index
    for (const entity of entities) {
      const key = entity.toLowerCase();
      const ids = this.entityIndex.get(key);
      if (ids) {
        ids.delete(id);
        if (ids.size === 0) {
          this.entityIndex.delete(key);
        }
      }
    }
  }

  private getCandidateMemories(
    queryKeywords: string[], 
    queryEntities: string[], 
    options: SearchOptions
  ): MemoryIndex[] {
    const candidateIds = new Set<string>();

    // Add memories matching keywords
    for (const keyword of queryKeywords) {
      const ids = this.keywordInvertedIndex.get(keyword.toLowerCase());
      if (ids) {
        ids.forEach(id => candidateIds.add(id));
      }
    }

    // Add memories matching entities
    for (const entity of queryEntities) {
      const ids = this.entityIndex.get(entity.toLowerCase());
      if (ids) {
        ids.forEach(id => candidateIds.add(id));
      }
    }

    // If no keyword/entity matches, include all memories for semantic search
    if (candidateIds.size === 0) {
      this.memoryIndex.forEach((_, id) => candidateIds.add(id));
    }

    // Convert to memory objects and apply scope filter
    const candidates: MemoryIndex[] = [];
    const now = Date.now();
    
    for (const id of candidateIds) {
      const memory = this.memoryIndex.get(id);
      if (!memory) continue;

      // Apply time range filter
      if (options.timeRange) {
        if (memory.timestamp < options.timeRange.start || 
            memory.timestamp > options.timeRange.end) {
          continue;
        }
      }

      // Apply scope filter
      switch (options.searchScope) {
        case 'recent':
          if (now - memory.timestamp > 7 * 24 * 60 * 60 * 1000) continue; // 7 days
          break;
        case 'important':
          if (memory.metadata.priority !== 'high' && 
              !memory.metadata.important) continue;
          break;
      }

      candidates.push(memory);
    }

    return candidates;
  }

  private calculateRelevanceScore(
    query: string,
    queryVectors: number[],
    queryKeywords: string[],
    queryEntities: string[],
    memory: MemoryIndex
  ): number {
    // Semantic similarity (cosine similarity)
    const semanticScore = this.cosineSimilarity(queryVectors, memory.vectors);
    
    // Keyword matching score
    const keywordScore = this.calculateKeywordRelevance(queryKeywords, memory.keywords);
    
    // Entity matching score
    const entityScore = this.calculateEntityRelevance(queryEntities, memory.entities);
    
    // Exact phrase matching
    const phraseScore = memory.content.toLowerCase().includes(query.toLowerCase()) ? 1.0 : 0.0;
    
    // Recency boost
    const age = Date.now() - memory.timestamp;
    const recencyScore = Math.exp(-age / (30 * 24 * 60 * 60 * 1000)); // 30 days decay
    
    // Priority boost
    const priorityBoost = memory.metadata.priority === 'high' ? 1.2 : 1.0;
    
    // Weighted combination
    const finalScore = (
      semanticScore * 0.4 +
      keywordScore * 0.3 +
      entityScore * 0.15 +
      phraseScore * 0.1 +
      recencyScore * 0.05
    ) * priorityBoost;

    return Math.min(finalScore, 1.0);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private calculateKeywordRelevance(queryKeywords: string[], memoryKeywords: string[]): number {
    if (queryKeywords.length === 0 || memoryKeywords.length === 0) return 0;
    
    const querySet = new Set(queryKeywords.map(k => k.toLowerCase()));
    const memorySet = new Set(memoryKeywords.map(k => k.toLowerCase()));
    
    const intersection = new Set(Array.from(querySet).filter(k => memorySet.has(k)));
    const union = new Set([...querySet, ...memorySet]);
    
    return intersection.size / union.size; // Jaccard similarity
  }

  private calculateEntityRelevance(queryEntities: string[], memoryEntities: string[]): number {
    if (queryEntities.length === 0 || memoryEntities.length === 0) return 0;
    
    const querySet = new Set(queryEntities.map(e => e.toLowerCase()));
    const memorySet = new Set(memoryEntities.map(e => e.toLowerCase()));
    
    const intersection = new Set(Array.from(querySet).filter(e => memorySet.has(e)));
    
    return intersection.size / querySet.size; // Precision
  }

  private generateContext(memory: MemoryIndex, query: string): string {
    const content = memory.content;
    const queryLower = query.toLowerCase();
    
    // Find best matching sentence
    const sentences = content.split(/[.!?]+/);
    let bestSentence = sentences[0];
    let bestScore = 0;
    
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      const words = this.extractKeywords(sentenceLower);
      const queryWords = this.extractKeywords(queryLower);
      
      const matches = words.filter(w => queryWords.includes(w)).length;
      const score = matches / Math.max(queryWords.length, 1);
      
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence;
      }
    }
    
    return bestSentence.trim();
  }
}