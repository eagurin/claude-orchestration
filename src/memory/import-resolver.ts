import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { resolve, dirname, isAbsolute } from 'path';
import { Logger } from '../utils/logger.js';

export interface ImportedContent {
  path: string;
  content: string;
  depth: number;
  timestamp: number;
}

export interface ImportOptions {
  maxDepth: number;
  allowedExtensions: string[];
  followSymlinks: boolean;
  basePath?: string;
}

/**
 * Handles recursive importing of CLAUDE.md files and related documentation
 * Supports @path/to/import syntax with configurable depth limits
 */
export class ImportResolver extends EventEmitter {
  private logger: Logger;
  private importCache = new Map<string, ImportedContent>();
  private importGraph = new Map<string, Set<string>>();
  
  constructor() {
    super();
    this.logger = new Logger('ImportResolver');
  }

  /**
   * Resolve all imports in a CLAUDE.md file recursively
   */
  async resolveImports(
    filePath: string, 
    options: Partial<ImportOptions> = {}
  ): Promise<ImportedContent[]> {
    const opts: ImportOptions = {
      maxDepth: 5,
      allowedExtensions: ['.md', '.txt', '.yaml', '.yml', '.json'],
      followSymlinks: false,
      basePath: dirname(filePath),
      ...options
    };

    this.logger.info(`Resolving imports for ${filePath}`, { maxDepth: opts.maxDepth });
    
    try {
      const results = await this.resolveRecursive(filePath, opts, 0, new Set());
      this.logger.info(`Resolved ${results.length} imports`, { filePath });
      return results;
    } catch (error) {
      this.logger.error(`Failed to resolve imports for ${filePath}`, error);
      throw error;
    }
  }

  /**
   * Get import dependencies for a file
   */
  getDependencies(filePath: string): string[] {
    const deps = this.importGraph.get(filePath);
    return deps ? Array.from(deps) : [];
  }

  /**
   * Clear import cache
   */
  clearCache(): void {
    this.importCache.clear();
    this.importGraph.clear();
    this.logger.debug('Import cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; files: string[] } {
    return {
      size: this.importCache.size,
      files: Array.from(this.importCache.keys())
    };
  }

  private async resolveRecursive(
    filePath: string,
    options: ImportOptions,
    currentDepth: number,
    visited: Set<string>
  ): Promise<ImportedContent[]> {
    // Prevent infinite recursion
    if (currentDepth > options.maxDepth) {
      this.logger.warn(`Max depth ${options.maxDepth} reached for ${filePath}`);
      return [];
    }

    // Prevent circular imports
    const normalizedPath = resolve(filePath);
    if (visited.has(normalizedPath)) {
      this.logger.warn(`Circular import detected: ${normalizedPath}`);
      return [];
    }

    visited.add(normalizedPath);

    try {
      // Check cache first
      const cached = this.importCache.get(normalizedPath);
      if (cached) {
        this.logger.debug(`Using cached import: ${normalizedPath}`);
        return [cached];
      }

      // Read file content
      const content = await fs.readFile(normalizedPath, 'utf-8');
      const importedContent: ImportedContent = {
        path: normalizedPath,
        content,
        depth: currentDepth,
        timestamp: Date.now()
      };

      // Cache the content
      this.importCache.set(normalizedPath, importedContent);

      // Find import statements
      const imports = this.extractImports(content);
      const results: ImportedContent[] = [importedContent];

      // Track dependencies
      if (imports.length > 0) {
        this.importGraph.set(normalizedPath, new Set(imports));
      }

      // Process each import
      for (const importPath of imports) {
        try {
          const resolvedPath = this.resolveImportPath(importPath, options.basePath || dirname(normalizedPath));
          
          // Validate file extension
          if (!this.isAllowedExtension(resolvedPath, options.allowedExtensions)) {
            this.logger.warn(`Skipping file with disallowed extension: ${resolvedPath}`);
            continue;
          }

          // Check if file exists
          await fs.access(resolvedPath);

          // Recursively resolve imports
          const nestedResults = await this.resolveRecursive(
            resolvedPath,
            options,
            currentDepth + 1,
            new Set(visited) // Create new visited set for each branch
          );
          
          results.push(...nestedResults);
        } catch (error) {
          this.logger.warn(`Failed to resolve import ${importPath}`, error);
        }
      }

      return results;
    } catch (error) {
      this.logger.error(`Failed to process file ${filePath}`, error);
      throw error;
    }
  }

  /**
   * Extract import statements from content
   * Supports formats: @./path/to/file.md, @../relative/path.md, @/absolute/path.md
   */
  private extractImports(content: string): string[] {
    const importRegex = /@([^\s\n\r]+)/g;
    const imports: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath && !importPath.startsWith('http')) {
        imports.push(importPath);
      }
    }

    return imports;
  }

  /**
   * Resolve import path relative to base path
   */
  private resolveImportPath(importPath: string, basePath: string): string {
    if (isAbsolute(importPath)) {
      return importPath;
    }
    return resolve(basePath, importPath);
  }

  /**
   * Check if file extension is allowed
   */
  private isAllowedExtension(filePath: string, allowedExtensions: string[]): boolean {
    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    return allowedExtensions.includes(ext);
  }

  /**
   * Validate import syntax in content
   */
  validateImportSyntax(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const importRegex = /@([^\s\n\r]+)/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      // Check for common errors
      if (importPath.includes('..\\') || importPath.includes('..\\\\')) {
        errors.push(`Invalid Windows path separator in import: ${importPath}`);
      }
      
      if (importPath.includes(' ')) {
        errors.push(`Import path contains spaces: ${importPath}`);
      }
      
      if (importPath.startsWith('http') && !importPath.startsWith('https')) {
        errors.push(`Insecure HTTP import detected: ${importPath}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate import dependency graph
   */
  generateDependencyGraph(): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    
    for (const [file, deps] of this.importGraph.entries()) {
      graph[file] = Array.from(deps);
    }
    
    return graph;
  }
}