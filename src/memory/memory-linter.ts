import { promises as fs } from 'fs';
import { Logger } from '../utils/logger.js';

export interface LintRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  category: 'structure' | 'content' | 'style' | 'performance';
  enabled: boolean;
}

export interface LintIssue {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  column?: number;
  context?: string;
  suggestion?: string;
}

export interface LintResult {
  filePath: string;
  content: string;
  issues: LintIssue[];
  score: number;
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

export interface MemoryQualityMetrics {
  specificity: number;
  clarity: number;
  completeness: number;
  relevance: number;
  overall: number;
}

/**
 * Memory Validation and Linting System
 * Ensures high-quality memory entries following best practices
 */
export class MemoryLinter {
  private logger: Logger;
  private rules: Map<string, LintRule> = new Map();
  
  constructor() {
    this.logger = new Logger('MemoryLinter');
    this.initializeDefaultRules();
  }

  /**
   * Lint memory content and provide quality assessment
   */
  async lintMemory(content: string, filePath?: string): Promise<LintResult> {
    const issues: LintIssue[] = [];
    
    // Run all enabled rules
    for (const rule of this.rules.values()) {
      if (rule.enabled) {
        const ruleIssues = await this.applyRule(rule, content);
        issues.push(...ruleIssues);
      }
    }

    // Calculate quality score
    const score = this.calculateQualityScore(content, issues);
    
    const summary = {
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      infos: issues.filter(i => i.severity === 'info').length,
    };

    const result: LintResult = {
      filePath: filePath || 'unknown',
      content,
      issues,
      score,
      summary
    };

    this.logger.debug(`Linted memory content`, {
      filePath,
      score,
      issues: issues.length,
      summary
    });

    return result;
  }

  /**
   * Lint CLAUDE.md file with import resolution
   */
  async lintClaudeFile(filePath: string): Promise<LintResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const result = await this.lintMemory(content, filePath);
      
      // Additional rules for CLAUDE.md files
      const claudeIssues = await this.applyClaudeFileRules(content, filePath);
      result.issues.push(...claudeIssues);
      
      // Recalculate score with additional issues
      result.score = this.calculateQualityScore(content, result.issues);
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to lint CLAUDE.md file: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * Batch lint multiple memory entries
   */
  async lintBatch(entries: Array<{ id: string; content: string }>): Promise<Map<string, LintResult>> {
    const results = new Map<string, LintResult>();
    
    for (const entry of entries) {
      try {
        const result = await this.lintMemory(entry.content);
        results.set(entry.id, result);
      } catch (error) {
        this.logger.warn(`Failed to lint memory entry: ${entry.id}`, error);
      }
    }

    this.logger.info(`Batch linted ${results.size} memory entries`);
    return results;
  }

  /**
   * Calculate detailed quality metrics
   */
  calculateQualityMetrics(content: string): MemoryQualityMetrics {
    const specificity = this.measureSpecificity(content);
    const clarity = this.measureClarity(content);
    const completeness = this.measureCompleteness(content);
    const relevance = this.measureRelevance(content);
    
    const overall = (specificity + clarity + completeness + relevance) / 4;

    return {
      specificity,
      clarity,
      completeness,
      relevance,
      overall
    };
  }

  /**
   * Get suggestions for improving memory quality
   */
  getSuggestions(content: string): string[] {
    const suggestions: string[] = [];
    const metrics = this.calculateQualityMetrics(content);

    if (metrics.specificity < 0.6) {
      suggestions.push("Be more specific: Include exact values, commands, or paths instead of general descriptions");
    }

    if (metrics.clarity < 0.6) {
      suggestions.push("Improve clarity: Use simpler language and shorter sentences");
    }

    if (metrics.completeness < 0.6) {
      suggestions.push("Add more context: Include why this information is important or when it applies");
    }

    if (content.length < 20) {
      suggestions.push("Add more detail: Very short entries may lack important context");
    }

    if (content.length > 500) {
      suggestions.push("Consider breaking this into smaller, focused entries");
    }

    if (!this.hasExamples(content) && this.shouldHaveExamples(content)) {
      suggestions.push("Add examples: Include code snippets or concrete examples");
    }

    return suggestions;
  }

  /**
   * Enable or disable a linting rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.logger.debug(`Rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }
    return false;
  }

  /**
   * Add custom linting rule
   */
  addRule(rule: LintRule): void {
    this.rules.set(rule.id, rule);
    this.logger.debug(`Added custom rule: ${rule.id}`);
  }

  /**
   * Get all available rules
   */
  getRules(): LintRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): LintRule | undefined {
    return this.rules.get(ruleId);
  }

  private initializeDefaultRules(): void {
    const defaultRules: LintRule[] = [
      {
        id: 'specificity-check',
        name: 'Specificity Check',
        description: 'Ensures memory entries are specific rather than general',
        severity: 'warning',
        category: 'content',
        enabled: true
      },
      {
        id: 'length-check',
        name: 'Length Check',
        description: 'Checks if memory entry length is appropriate',
        severity: 'info',
        category: 'content',
        enabled: true
      },
      {
        id: 'clarity-check',
        name: 'Clarity Check',
        description: 'Ensures memory entries are clear and understandable',
        severity: 'warning',
        category: 'content',
        enabled: true
      },
      {
        id: 'import-syntax',
        name: 'Import Syntax Check',
        description: 'Validates @import syntax in CLAUDE.md files',
        severity: 'error',
        category: 'structure',
        enabled: true
      },
      {
        id: 'duplicate-content',
        name: 'Duplicate Content Check',
        description: 'Identifies potentially duplicate memory entries',
        severity: 'warning',
        category: 'content',
        enabled: true
      },
      {
        id: 'command-format',
        name: 'Command Format Check',
        description: 'Validates command and code formatting',
        severity: 'info',
        category: 'style',
        enabled: true
      },
      {
        id: 'context-completeness',
        name: 'Context Completeness',
        description: 'Ensures entries have sufficient context',
        severity: 'warning',
        category: 'content',
        enabled: true
      }
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  private async applyRule(rule: LintRule, content: string): Promise<LintIssue[]> {
    const issues: LintIssue[] = [];

    switch (rule.id) {
      case 'specificity-check':
        issues.push(...this.checkSpecificity(content, rule));
        break;
      case 'length-check':
        issues.push(...this.checkLength(content, rule));
        break;
      case 'clarity-check':
        issues.push(...this.checkClarity(content, rule));
        break;
      case 'import-syntax':
        issues.push(...this.checkImportSyntax(content, rule));
        break;
      case 'duplicate-content':
        issues.push(...this.checkDuplicateContent(content, rule));
        break;
      case 'command-format':
        issues.push(...this.checkCommandFormat(content, rule));
        break;
      case 'context-completeness':
        issues.push(...this.checkContextCompleteness(content, rule));
        break;
    }

    return issues;
  }

  private checkSpecificity(content: string, rule: LintRule): LintIssue[] {
    const issues: LintIssue[] = [];
    const vaguePhrases = [
      'format code properly',
      'do it right',
      'make it better',
      'fix the issue',
      'handle this',
      'improve performance',
      'optimize this'
    ];

    for (const phrase of vaguePhrases) {
      if (content.toLowerCase().includes(phrase)) {
        issues.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Vague phrase detected: "${phrase}". Be more specific.`,
          suggestion: `Instead of "${phrase}", specify exact actions, values, or methods.`
        });
      }
    }

    return issues;
  }

  private checkLength(content: string, rule: LintRule): LintIssue[] {
    const issues: LintIssue[] = [];
    
    if (content.length < 10) {
      issues.push({
        ruleId: rule.id,
        severity: 'warning',
        message: 'Memory entry is very short and may lack context',
        suggestion: 'Add more detail to provide sufficient context'
      });
    } else if (content.length > 1000) {
      issues.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: 'Memory entry is very long and may be hard to process',
        suggestion: 'Consider breaking this into smaller, focused entries'
      });
    }

    return issues;
  }

  private checkClarity(content: string, rule: LintRule): LintIssue[] {
    const issues: LintIssue[] = [];
    
    // Check for overly complex sentences
    const sentences = content.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.trim().length > 150) {
        issues.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: 'Long sentence detected that may be hard to understand',
          context: sentence.trim().substring(0, 100) + '...',
          suggestion: 'Break long sentences into shorter, clearer ones'
        });
      }
    }

    // Check for unclear pronouns
    const unclearPronouns = ['this', 'that', 'it', 'they'];
    for (const pronoun of unclearPronouns) {
      const regex = new RegExp(`\\b${pronoun}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches && matches.length > 3) {
        issues.push({
          ruleId: rule.id,
          severity: 'info',
          message: `Frequent use of pronoun "${pronoun}" may reduce clarity`,
          suggestion: 'Replace some pronouns with specific nouns for clarity'
        });
      }
    }

    return issues;
  }

  private checkImportSyntax(content: string, rule: LintRule): LintIssue[] {
    const issues: LintIssue[] = [];
    const importRegex = /@([^\s\n\r]+)/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      
      // Check for common syntax errors
      if (importPath.includes(' ')) {
        issues.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Import path contains spaces: ${importPath}`,
          suggestion: 'Remove spaces from import paths or use quotes if necessary'
        });
      }

      if (importPath.includes('\\')) {
        issues.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Import path uses backslashes: ${importPath}`,
          suggestion: 'Use forward slashes for import paths'
        });
      }

      if (importPath.startsWith('http:')) {
        issues.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Insecure HTTP import: ${importPath}`,
          suggestion: 'Use HTTPS for external imports'
        });
      }
    }

    return issues;
  }

  private checkDuplicateContent(content: string, rule: LintRule): LintIssue[] {
    const issues: LintIssue[] = [];
    
    // Check for repeated phrases within the same content
    const words = content.toLowerCase().split(/\s+/);
    const phrases = new Map<string, number>();
    
    // Check 3-word phrases
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }

    for (const [phrase, count] of phrases.entries()) {
      if (count > 2 && phrase.length > 10) {
        issues.push({
          ruleId: rule.id,
          severity: rule.severity,
          message: `Repeated phrase detected: "${phrase}"`,
          suggestion: 'Remove or rephrase repeated content'
        });
      }
    }

    return issues;
  }

  private checkCommandFormat(content: string, rule: LintRule): LintIssue[] {
    const issues: LintIssue[] = [];
    
    // Check for commands without proper formatting
    const commandPattern = /^[a-z]+\s+[a-z]+/gm;
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Potential command line without code formatting
      if (commandPattern.test(line) && !line.includes('`') && !line.startsWith('```')) {
        if (line.includes('npm') || line.includes('git') || line.includes('node')) {
          issues.push({
            ruleId: rule.id,
            severity: rule.severity,
            message: 'Command should be formatted with backticks',
            line: i + 1,
            context: line,
            suggestion: `Use \`${line}\` for inline commands or \`\`\`bash\n${line}\n\`\`\` for code blocks`
          });
        }
      }
    }

    return issues;
  }

  private checkContextCompleteness(content: string, rule: LintRule): LintIssue[] {
    const issues: LintIssue[] = [];
    
    // Check if entry provides enough context
    const hasWhen = /when|if|while|during|after|before/i.test(content);
    const hasWhy = /because|since|due to|reason|purpose/i.test(content);
    const hasHow = /how|method|way|process|step/i.test(content);
    
    const contextScore = [hasWhen, hasWhy, hasHow].filter(Boolean).length;
    
    if (contextScore === 0 && content.length > 50) {
      issues.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: 'Entry lacks context about when, why, or how this applies',
        suggestion: 'Add context about when to use this information, why it\'s important, or how to apply it'
      });
    }

    return issues;
  }

  private async applyClaudeFileRules(content: string, filePath: string): Promise<LintIssue[]> {
    const issues: LintIssue[] = [];
    
    // Check for required sections in CLAUDE.md
    const requiredSections = ['Build and Development Commands', 'Core Architecture'];
    const hasSection = (section: string) => content.includes(`## ${section}`) || content.includes(`# ${section}`);
    
    for (const section of requiredSections) {
      if (!hasSection(section)) {
        issues.push({
          ruleId: 'claude-structure',
          severity: 'warning',
          message: `Missing recommended section: ${section}`,
          suggestion: `Add a "## ${section}" section to improve guidance`
        });
      }
    }

    // Check for proper markdown structure
    if (!content.startsWith('# CLAUDE.md')) {
      issues.push({
        ruleId: 'claude-header',
        severity: 'error',
        message: 'CLAUDE.md file should start with "# CLAUDE.md" header',
        suggestion: 'Add "# CLAUDE.md" as the first line'
      });
    }

    return issues;
  }

  private calculateQualityScore(content: string, issues: LintIssue[]): number {
    let score = 100;
    
    // Deduct points for issues
    for (const issue of issues) {
      switch (issue.severity) {
        case 'error':
          score -= 10;
          break;
        case 'warning':
          score -= 5;
          break;
        case 'info':
          score -= 1;
          break;
      }
    }

    // Bonus for good practices
    const metrics = this.calculateQualityMetrics(content);
    const bonusScore = metrics.overall * 20;
    
    return Math.max(0, Math.min(100, score + bonusScore));
  }

  private measureSpecificity(content: string): number {
    let score = 0.5; // Base score
    
    // Bonus for specific elements
    if (/\d+/.test(content)) score += 0.1; // Contains numbers
    if (/`[^`]+`/.test(content)) score += 0.1; // Contains code
    if (/https?:\/\//.test(content)) score += 0.1; // Contains URLs
    if (/\.[a-z]{2,4}\b/i.test(content)) score += 0.1; // Contains file extensions
    if (/"[^"]+"/.test(content)) score += 0.1; // Contains quotes
    
    // Penalty for vague words
    const vagueWords = ['thing', 'stuff', 'something', 'etc', 'various'];
    for (const word of vagueWords) {
      if (content.toLowerCase().includes(word)) {
        score -= 0.05;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  private measureClarity(content: string): number {
    let score = 0.7; // Base score
    
    // Sentence length analysis
    const sentences = content.split(/[.!?]+/);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;
    
    if (avgSentenceLength < 50) score += 0.2;
    else if (avgSentenceLength > 100) score -= 0.2;
    
    // Complex word penalty
    const complexWords = content.match(/\b\w{10,}\b/g) || [];
    if (complexWords.length > content.split(/\s+/).length * 0.1) {
      score -= 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  private measureCompleteness(content: string): number {
    let score = 0.5; // Base score
    
    // Check for completeness indicators
    if (content.includes('example') || content.includes('e.g.')) score += 0.2;
    if (content.includes('because') || content.includes('why')) score += 0.1;
    if (content.includes('when') || content.includes('if')) score += 0.1;
    if (content.includes('how') || content.includes('step')) score += 0.1;
    
    // Length bonus (up to a point)
    const lengthBonus = Math.min(0.1, content.length / 2000);
    score += lengthBonus;

    return Math.max(0, Math.min(1, score));
  }

  private measureRelevance(content: string): number {
    let score = 0.6; // Base score
    
    // Technical relevance indicators
    const techTerms = ['config', 'api', 'function', 'command', 'error', 'test', 'build', 'deploy'];
    const foundTerms = techTerms.filter(term => content.toLowerCase().includes(term));
    score += foundTerms.length * 0.05;
    
    // Actionable language bonus
    const actionWords = ['use', 'run', 'set', 'configure', 'install', 'update', 'create'];
    const foundActions = actionWords.filter(word => content.toLowerCase().includes(word));
    score += foundActions.length * 0.03;

    return Math.max(0, Math.min(1, score));
  }

  private hasExamples(content: string): boolean {
    return /example|e\.g\.|for instance|such as|like this|```/.test(content.toLowerCase());
  }

  private shouldHaveExamples(content: string): boolean {
    return /command|function|api|config|setup|install/.test(content.toLowerCase()) && content.length > 100;
  }
}