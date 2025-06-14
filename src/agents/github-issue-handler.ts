import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { SupervisorManager } from './supervisor-manager.js';

export interface GitHubIssue {
  id: string;
  number: number;
  title: string;
  body: string;
  labels: Array<{
    name: string;
    color: string;
    description?: string;
  }>;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  assignees: any[];
  milestone?: any;
  user: {
    login: string;
    id: number;
  };
  repository: {
    name: string;
    full_name: string;
  };
}

export interface IssueAnalysis {
  complexity: number;
  priority: number;
  estimatedTime: number;
  requiredSkills: string[];
  domain: string;
  riskLevel: 'low' | 'medium' | 'high';
  dependencies: string[];
  urgency: number;
}

export interface IssueAssignmentResult {
  success: boolean;
  supervisorId?: string;
  teamId?: string;
  estimatedCompletion?: number;
  assignedAgents?: string[];
  error?: string;
}

/**
 * GitHub Issue Handler - автоматически обрабатывает GitHub issues
 * и распределяет их между супервизорами для решения
 */
export class GitHubIssueHandler extends EventEmitter {
  private logger: Logger;
  private supervisorManager: SupervisorManager;
  private isActive = false;
  private processedIssues: Set<string> = new Set();
  private issueQueue: GitHubIssue[] = [];
  private readonly priorityKeywords = {
    critical: 10,
    urgent: 9,
    high: 8,
    important: 7,
    medium: 5,
    low: 3,
    enhancement: 2,
    documentation: 1
  };

  private readonly complexityKeywords = {
    'breaking change': 10,
    'architecture': 9,
    'refactor': 8,
    'feature': 7,
    'enhancement': 6,
    'improvement': 5,
    'bug': 4,
    'fix': 3,
    'documentation': 2,
    'typo': 1
  };

  private readonly skillMappings = {
    'typescript': ['typescript', 'programming', 'type-safety'],
    'javascript': ['javascript', 'programming', 'frontend'],
    'ui': ['ui', 'user-interface', 'design', 'frontend'],
    'backend': ['backend', 'server', 'api'],
    'database': ['database', 'sql', 'data'],
    'security': ['security', 'authentication', 'encryption'],
    'testing': ['testing', 'qa', 'quality-assurance'],
    'documentation': ['documentation', 'writing', 'markdown'],
    'performance': ['performance', 'optimization', 'speed'],
    'deployment': ['deployment', 'devops', 'infrastructure'],
    'api': ['api', 'rest', 'graphql', 'integration'],
    'cli': ['cli', 'command-line', 'terminal'],
    'tui': ['tui', 'terminal-ui', 'blessed'],
    'configuration': ['configuration', 'settings', 'config'],
    'monitoring': ['monitoring', 'metrics', 'observability'],
    'memory': ['memory', 'data-structures', 'algorithms']
  };

  constructor(supervisorManager: SupervisorManager) {
    super();
    this.logger = new Logger('GitHubIssueHandler');
    this.supervisorManager = supervisorManager;
    this.setupEventHandlers();
  }

  /**
   * Активировать обработчик GitHub issues
   */
  async activate(): Promise<void> {
    if (this.isActive) {
      this.logger.warn('GitHub Issue Handler already active');
      return;
    }

    this.logger.info('Activating GitHub Issue Handler');
    this.isActive = true;
    
    // Запустить обработку очереди
    this.startQueueProcessing();
    
    this.emit('activated');
    this.logger.info('GitHub Issue Handler activated successfully');
  }

  /**
   * Деактивировать обработчик
   */
  async deactivate(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.logger.info('Deactivating GitHub Issue Handler');
    this.isActive = false;
    
    this.emit('deactivated');
    this.logger.info('GitHub Issue Handler deactivated');
  }

  /**
   * Обработать новый GitHub issue
   */
  async handleNewIssue(issue: GitHubIssue): Promise<IssueAssignmentResult> {
    if (this.processedIssues.has(issue.id)) {
      this.logger.debug('Issue already processed', { issueId: issue.id });
      return { success: false, error: 'Issue already processed' };
    }

    this.logger.info('Processing new GitHub issue', {
      issueId: issue.id,
      number: issue.number,
      title: issue.title,
      repository: issue.repository.full_name
    });

    try {
      // Анализ issue
      const analysis = await this.analyzeIssue(issue);
      
      this.logger.debug('Issue analysis completed', {
        issueId: issue.id,
        complexity: analysis.complexity,
        priority: analysis.priority,
        domain: analysis.domain,
        skills: analysis.requiredSkills
      });

      // Определить тип обработки
      if (analysis.urgency >= 9 || analysis.priority >= 9) {
        return await this.handleUrgentIssue(issue, analysis);
      } else {
        return await this.handleRegularIssue(issue, analysis);
      }

    } catch (error) {
      this.logger.error('Failed to process GitHub issue', {
        issueId: issue.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Добавить issue в очередь для обработки
   */
  enqueueIssue(issue: GitHubIssue): void {
    if (!this.processedIssues.has(issue.id)) {
      this.issueQueue.push(issue);
      this.logger.debug('Issue added to queue', {
        issueId: issue.id,
        queueLength: this.issueQueue.length
      });
    }
  }

  /**
   * Получить статистику обработки issues
   */
  getProcessingStats(): {
    processed: number;
    inQueue: number;
    avgProcessingTime: number;
    successRate: number;
    topDomains: Array<{ domain: string; count: number }>;
    topSkills: Array<{ skill: string; count: number }>;
  } {
    // Симуляция статистики
    return {
      processed: this.processedIssues.size,
      inQueue: this.issueQueue.length,
      avgProcessingTime: 1200000, // 20 минут
      successRate: 0.95,
      topDomains: [
        { domain: 'settings', count: 15 },
        { domain: 'security', count: 8 },
        { domain: 'monitoring', count: 12 }
      ],
      topSkills: [
        { skill: 'typescript', count: 25 },
        { skill: 'ui', count: 18 },
        { skill: 'testing', count: 22 }
      ]
    };
  }

  /**
   * Получить активные assignments для issues
   */
  getActiveIssueAssignments(): Array<{
    issueId: string;
    issueNumber: number;
    title: string;
    supervisorId: string;
    teamName: string;
    status: string;
    progress: number;
    estimatedCompletion: string;
  }> {
    const assignments = this.supervisorManager.getActiveAssignments();
    
    return assignments.map(assignment => ({
      issueId: assignment.issueId,
      issueNumber: parseInt(assignment.issueId.replace('issue_', '')),
      title: `Issue #${assignment.issueId}`, // В реальности получать из GitHub API
      supervisorId: assignment.supervisorId,
      teamName: assignment.supervisorName,
      status: assignment.status,
      progress: assignment.progress,
      estimatedCompletion: new Date(assignment.estimatedCompletion).toISOString()
    }));
  }

  private async analyzeIssue(issue: GitHubIssue): Promise<IssueAnalysis> {
    // Анализ приоритета на основе меток и содержания
    const priority = this.calculatePriority(issue);
    
    // Анализ сложности
    const complexity = this.calculateComplexity(issue);
    
    // Определение требуемых навыков
    const requiredSkills = this.extractRequiredSkills(issue);
    
    // Определение домена
    const domain = this.determineDomain(issue, requiredSkills);
    
    // Оценка времени выполнения
    const estimatedTime = this.estimateTime(complexity, priority);
    
    // Анализ срочности
    const urgency = this.calculateUrgency(issue, priority);
    
    // Оценка рисков
    const riskLevel = this.assessRisk(issue, complexity);
    
    // Анализ зависимостей
    const dependencies = this.extractDependencies(issue);

    return {
      complexity,
      priority,
      estimatedTime,
      requiredSkills,
      domain,
      riskLevel,
      dependencies,
      urgency
    };
  }

  private calculatePriority(issue: GitHubIssue): number {
    let priority = 5; // базовый приоритет
    
    // Анализ меток
    for (const label of issue.labels) {
      const labelName = label.name.toLowerCase();
      for (const [keyword, value] of Object.entries(this.priorityKeywords)) {
        if (labelName.includes(keyword)) {
          priority = Math.max(priority, value);
        }
      }
    }
    
    // Анализ заголовка и описания
    const text = (issue.title + ' ' + issue.body).toLowerCase();
    for (const [keyword, value] of Object.entries(this.priorityKeywords)) {
      if (text.includes(keyword)) {
        priority = Math.max(priority, value * 0.8); // Меньший вес для текста
      }
    }
    
    // Учет времени создания (старые issues могут быть важнее)
    const age = Date.now() - new Date(issue.created_at).getTime();
    const ageDays = age / (1000 * 60 * 60 * 24);
    if (ageDays > 7) {
      priority += Math.min(2, ageDays / 7); // Увеличиваем приоритет старых issues
    }
    
    return Math.min(10, Math.max(1, Math.round(priority)));
  }

  private calculateComplexity(issue: GitHubIssue): number {
    let complexity = 5; // базовая сложность
    
    // Анализ меток
    for (const label of issue.labels) {
      const labelName = label.name.toLowerCase();
      for (const [keyword, value] of Object.entries(this.complexityKeywords)) {
        if (labelName.includes(keyword)) {
          complexity = Math.max(complexity, value);
        }
      }
    }
    
    // Анализ длины описания (более длинные описания = больше сложность)
    const bodyLength = issue.body ? issue.body.length : 0;
    if (bodyLength > 2000) {
      complexity += 2;
    } else if (bodyLength > 1000) {
      complexity += 1;
    }
    
    // Анализ количества требований в описании
    const requirements = (issue.body || '').split(/\n-|\n\*|\n\d+\./).length - 1;
    if (requirements > 5) {
      complexity += 2;
    } else if (requirements > 3) {
      complexity += 1;
    }
    
    return Math.min(10, Math.max(1, Math.round(complexity)));
  }

  private extractRequiredSkills(issue: GitHubIssue): string[] {
    const skills = new Set<string>();
    const text = (issue.title + ' ' + issue.body + ' ' + 
                 issue.labels.map(l => l.name).join(' ')).toLowerCase();
    
    // Анализ меток
    for (const label of issue.labels) {
      const labelName = label.name.toLowerCase();
      for (const [keyword, skillList] of Object.entries(this.skillMappings)) {
        if (labelName.includes(keyword)) {
          skillList.forEach(skill => skills.add(skill));
        }
      }
    }
    
    // Анализ текста
    for (const [keyword, skillList] of Object.entries(this.skillMappings)) {
      if (text.includes(keyword)) {
        skillList.forEach(skill => skills.add(skill));
      }
    }
    
    // Базовые навыки всегда требуются
    skills.add('programming');
    skills.add('problem-solving');
    
    return Array.from(skills);
  }

  private determineDomain(issue: GitHubIssue, skills: string[]): string {
    // Анализ на основе навыков и меток
    const domainScores = {
      settings: 0,
      security: 0,
      monitoring: 0,
      memory: 0,
      orchestration: 0,
      general: 1 // базовый балл для общих задач
    };
    
    // Анализ навыков
    if (skills.includes('configuration') || skills.includes('settings')) {
      domainScores.settings += 3;
    }
    if (skills.includes('security') || skills.includes('authentication')) {
      domainScores.security += 3;
    }
    if (skills.includes('monitoring') || skills.includes('metrics')) {
      domainScores.monitoring += 3;
    }
    if (skills.includes('memory') || skills.includes('data-structures')) {
      domainScores.memory += 3;
    }
    if (skills.includes('coordination') || skills.includes('distributed-systems')) {
      domainScores.orchestration += 3;
    }
    
    // Анализ меток
    for (const label of issue.labels) {
      const labelName = label.name.toLowerCase();
      if (labelName.includes('config') || labelName.includes('settings')) {
        domainScores.settings += 2;
      }
      if (labelName.includes('security') || labelName.includes('auth')) {
        domainScores.security += 2;
      }
      if (labelName.includes('monitoring') || labelName.includes('metrics')) {
        domainScores.monitoring += 2;
      }
      if (labelName.includes('memory') || labelName.includes('search')) {
        domainScores.memory += 2;
      }
    }
    
    // Найти домен с максимальным баллом
    const bestDomain = Object.entries(domainScores)
      .sort(([,a], [,b]) => b - a)[0][0];
    
    return bestDomain;
  }

  private estimateTime(complexity: number, priority: number): number {
    // Базовое время: 30 минут
    const baseTime = 1800000;
    
    // Увеличиваем время в зависимости от сложности
    const complexityMultiplier = 1 + (complexity - 1) * 0.3;
    
    // Уменьшаем время для высокоприоритетных задач (больше ресурсов)
    const priorityMultiplier = priority > 7 ? 0.8 : 1.0;
    
    return Math.round(baseTime * complexityMultiplier * priorityMultiplier);
  }

  private calculateUrgency(issue: GitHubIssue, priority: number): number {
    let urgency = priority;
    
    // Анализ ключевых слов срочности
    const urgentKeywords = ['urgent', 'critical', 'blocking', 'asap', 'immediately'];
    const text = (issue.title + ' ' + issue.body).toLowerCase();
    
    for (const keyword of urgentKeywords) {
      if (text.includes(keyword)) {
        urgency += 2;
        break;
      }
    }
    
    // Анализ assignees (если назначены разработчики, может быть срочно)
    if (issue.assignees && issue.assignees.length > 0) {
      urgency += 1;
    }
    
    // Анализ milestone (если есть milestone, может быть срочно)
    if (issue.milestone) {
      urgency += 1;
    }
    
    return Math.min(10, Math.max(1, urgency));
  }

  private assessRisk(issue: GitHubIssue, complexity: number): 'low' | 'medium' | 'high' {
    let riskScore = complexity;
    
    // Увеличиваем риск для определенных типов изменений
    const highRiskKeywords = ['breaking', 'architecture', 'security', 'database'];
    const text = (issue.title + ' ' + issue.body + ' ' + 
                 issue.labels.map(l => l.name).join(' ')).toLowerCase();
    
    for (const keyword of highRiskKeywords) {
      if (text.includes(keyword)) {
        riskScore += 2;
        break;
      }
    }
    
    if (riskScore >= 8) return 'high';
    if (riskScore >= 5) return 'medium';
    return 'low';
  }

  private extractDependencies(issue: GitHubIssue): string[] {
    const dependencies: string[] = [];
    
    // Поиск ссылок на другие issues
    const issueRefs = (issue.body || '').match(/#\d+/g);
    if (issueRefs) {
      dependencies.push(...issueRefs);
    }
    
    // Поиск ключевых слов зависимостей
    const dependencyKeywords = ['depends on', 'requires', 'blocked by', 'after'];
    const text = issue.body || '';
    
    for (const keyword of dependencyKeywords) {
      if (text.toLowerCase().includes(keyword)) {
        dependencies.push(`dependency:${keyword}`);
      }
    }
    
    return dependencies;
  }

  private async handleRegularIssue(issue: GitHubIssue, analysis: IssueAnalysis): Promise<IssueAssignmentResult> {
    try {
      const result = await this.supervisorManager.assignIssue({
        id: issue.id,
        title: issue.title,
        description: issue.body || '',
        labels: issue.labels.map(l => l.name),
        priority: analysis.priority,
        estimatedComplexity: analysis.complexity,
        requiredSkills: analysis.requiredSkills
      });

      this.processedIssues.add(issue.id);
      
      this.emit('issueAssigned', {
        issueId: issue.id,
        issueNumber: issue.number,
        supervisorId: result.supervisorId,
        estimatedCompletion: result.estimatedCompletion,
        type: 'regular'
      });

      return {
        success: result.success,
        supervisorId: result.supervisorId,
        estimatedCompletion: result.estimatedCompletion,
        assignedAgents: result.assignedAgents
      };

    } catch (error) {
      this.logger.error('Failed to assign regular issue', {
        issueId: issue.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Assignment failed'
      };
    }
  }

  private async handleUrgentIssue(issue: GitHubIssue, analysis: IssueAnalysis): Promise<IssueAssignmentResult> {
    try {
      this.logger.info('Creating urgent team for critical issue', {
        issueId: issue.id,
        urgency: analysis.urgency,
        priority: analysis.priority
      });

      const deadline = Date.now() + Math.min(analysis.estimatedTime, 3600000); // Максимум 1 час
      
      const result = await this.supervisorManager.createUrgentTeam({
        id: issue.id,
        title: issue.title,
        priority: analysis.priority,
        deadline,
        requiredSkills: analysis.requiredSkills
      });

      this.processedIssues.add(issue.id);
      
      this.emit('urgentIssueAssigned', {
        issueId: issue.id,
        issueNumber: issue.number,
        teamId: result.teamId,
        supervisorId: result.supervisorId,
        deadline,
        members: result.members
      });

      return {
        success: true,
        supervisorId: result.supervisorId,
        teamId: result.teamId,
        estimatedCompletion: deadline,
        assignedAgents: result.members
      };

    } catch (error) {
      this.logger.error('Failed to create urgent team for issue', {
        issueId: issue.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Urgent team creation failed'
      };
    }
  }

  private startQueueProcessing(): void {
    // Обрабатывать очередь каждые 30 секунд
    setInterval(async () => {
      if (!this.isActive || this.issueQueue.length === 0) {
        return;
      }

      const issue = this.issueQueue.shift();
      if (issue) {
        try {
          await this.handleNewIssue(issue);
        } catch (error) {
          this.logger.error('Failed to process queued issue', {
            issueId: issue.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }, 30000);
  }

  private setupEventHandlers(): void {
    this.on('activated', () => {
      this.logger.info('GitHub Issue Handler activated');
    });

    this.on('issueAssigned', (event) => {
      this.logger.info('Issue assigned to team', event);
    });

    this.on('urgentIssueAssigned', (event) => {
      this.logger.info('Urgent issue assigned to special team', event);
    });
  }
}