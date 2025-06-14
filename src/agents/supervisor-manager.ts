import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { Supervisor, SupervisorConfig, TeamMetrics, WorkSession } from './supervisor.js';
import { Task, TaskResult } from '../types/index.js';

export interface SupervisorManagerConfig {
  maxSupervisors: number;
  autoScaling: boolean;
  workingHours: {
    start: string;
    end: string;
    timezone: string;
  };
  domains: string[];
  balancingStrategy: 'round-robin' | 'expertise' | 'load' | 'quality';
}

export interface DomainExpertise {
  domain: string;
  skills: string[];
  complexity: number;
  supervisorId?: string;
}

export interface IssueAssignment {
  issueId: string;
  supervisorId: string;
  agentIds: string[];
  startTime: number;
  estimatedCompletion: number;
  status: 'assigned' | 'in_progress' | 'completed' | 'blocked';
  priority: number;
}

/**
 * Менеджер супервизоров - координирует работу всех групп агентов
 * Обеспечивает эффективное распределение GitHub issues между командами
 */
export class SupervisorManager extends EventEmitter {
  private logger: Logger;
  private config: SupervisorManagerConfig;
  private supervisors: Map<string, Supervisor> = new Map();
  private issueAssignments: Map<string, IssueAssignment> = new Map();
  private domainExpertise: Map<string, DomainExpertise> = new Map();
  private globalMetrics: {
    totalIssuesResolved: number;
    averageResolutionTime: number;
    globalEfficiency: number;
    activeSupervisors: number;
    totalAgents: number;
  };
  private isActive = false;

  constructor(config: SupervisorManagerConfig) {
    super();
    this.logger = new Logger('SupervisorManager');
    this.config = config;
    this.globalMetrics = {
      totalIssuesResolved: 0,
      averageResolutionTime: 0,
      globalEfficiency: 0,
      activeSupervisors: 0,
      totalAgents: 0
    };

    this.initializeDomainExpertise();
    this.setupEventHandlers();
  }

  /**
   * Инициализировать менеджер супервизоров
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Supervisor Manager', {
      maxSupervisors: this.config.maxSupervisors,
      domains: this.config.domains.length
    });

    // Создать супервизоров для каждого домена
    for (const domain of this.config.domains) {
      await this.createSupervisorForDomain(domain);
    }

    this.isActive = true;
    await this.startGlobalMonitoring();

    this.logger.info('Supervisor Manager initialized', {
      supervisors: this.supervisors.size,
      domains: this.config.domains
    });

    this.emit('initialized', {
      supervisorCount: this.supervisors.size,
      domains: this.config.domains
    });
  }

  /**
   * Назначить GitHub issue команде супервизора
   */
  async assignIssue(issue: {
    id: string;
    title: string;
    description: string;
    labels: string[];
    priority: number;
    estimatedComplexity: number;
    requiredSkills: string[];
  }): Promise<{
    success: boolean;
    supervisorId: string;
    estimatedCompletion: number;
    assignedAgents: string[];
  }> {
    this.logger.info('Assigning issue to supervisor', {
      issueId: issue.id,
      title: issue.title,
      priority: issue.priority
    });

    // Найти лучшего супервизора для issue
    const supervisor = await this.findBestSupervisor(issue);
    
    if (!supervisor) {
      throw new Error('No available supervisor found');
    }

    // Создать задачу для супервизора
    const task: Task = {
      id: `issue_${issue.id}`,
      description: `Resolve GitHub issue: ${issue.title}`,
      pattern: 'collaborative',
      priority: issue.priority,
      metadata: {
        issueId: issue.id,
        labels: issue.labels,
        complexity: issue.estimatedComplexity,
        requiredSkills: issue.requiredSkills
      }
    };

    const context = {
      taskComplexity: issue.estimatedComplexity,
      urgency: issue.priority,
      requiredExpertise: issue.requiredSkills,
      estimatedTime: this.estimateResolutionTime(issue),
      dependencies: [],
      riskLevel: this.assessRiskLevel(issue) as 'low' | 'medium' | 'high'
    };

    // Назначить задачу супервизору
    const result = await supervisor.assignTask(task, context);
    
    // Записать назначение
    const assignment: IssueAssignment = {
      issueId: issue.id,
      supervisorId: supervisor.config.id,
      agentIds: result.agentsUsed || [],
      startTime: Date.now(),
      estimatedCompletion: Date.now() + context.estimatedTime,
      status: 'in_progress',
      priority: issue.priority
    };

    this.issueAssignments.set(issue.id, assignment);

    this.emit('issueAssigned', {
      issueId: issue.id,
      supervisorId: supervisor.config.id,
      estimatedCompletion: assignment.estimatedCompletion
    });

    return {
      success: result.success,
      supervisorId: supervisor.config.id,
      estimatedCompletion: assignment.estimatedCompletion,
      assignedAgents: result.agentsUsed || []
    };
  }

  /**
   * Получить статус всех активных assignments
   */
  getActiveAssignments(): Array<IssueAssignment & {
    supervisorName: string;
    progress: number;
    timeRemaining: number;
  }> {
    return Array.from(this.issueAssignments.values())
      .filter(assignment => assignment.status === 'in_progress')
      .map(assignment => {
        const supervisor = this.supervisors.get(assignment.supervisorId);
        const progress = this.calculateProgress(assignment);
        const timeRemaining = Math.max(0, assignment.estimatedCompletion - Date.now());

        return {
          ...assignment,
          supervisorName: supervisor?.config.name || 'Unknown',
          progress,
          timeRemaining
        };
      });
  }

  /**
   * Получить глобальную статистику всех команд
   */
  getGlobalMetrics(): {
    overview: typeof this.globalMetrics;
    supervisors: Array<{
      id: string;
      name: string;
      domain: string;
      metrics: TeamMetrics;
      activeIssues: number;
    }>;
    efficiency: {
      topPerformers: string[];
      bottlenecks: string[];
      recommendations: string[];
    };
  } {
    const supervisorMetrics = Array.from(this.supervisors.values()).map(supervisor => {
      const metrics = supervisor.getTeamMetrics();
      const activeIssues = Array.from(this.issueAssignments.values())
        .filter(a => a.supervisorId === supervisor.config.id && a.status === 'in_progress')
        .length;

      return {
        id: supervisor.config.id,
        name: supervisor.config.name,
        domain: supervisor.config.domain,
        metrics,
        activeIssues
      };
    });

    return {
      overview: this.globalMetrics,
      supervisors: supervisorMetrics,
      efficiency: this.analyzeGlobalEfficiency(supervisorMetrics)
    };
  }

  /**
   * Создать новую рабочую группу для срочного issue
   */
  async createUrgentTeam(issue: {
    id: string;
    title: string;
    priority: number;
    deadline: number;
    requiredSkills: string[];
  }): Promise<{
    teamId: string;
    supervisorId: string;
    members: string[];
    sessionId: string;
  }> {
    this.logger.info('Creating urgent team', {
      issueId: issue.id,
      priority: issue.priority,
      deadline: new Date(issue.deadline).toISOString()
    });

    // Найти лучших доступных агентов из всех команд
    const bestAgents = await this.findBestAvailableAgents(issue.requiredSkills, 5);
    
    if (bestAgents.length === 0) {
      throw new Error('No available agents for urgent team');
    }

    // Выбрать супервизора с наименьшей загрузкой
    const supervisor = this.findLeastLoadedSupervisor();
    if (!supervisor) {
      throw new Error('No available supervisor for urgent team');
    }

    // Создать специальную сессию
    const sessionId = await supervisor.startSpecialSession('sprint', {
      duration: issue.deadline - Date.now(),
      participants: bestAgents.map(a => a.id),
      objectives: [`Resolve urgent issue: ${issue.title}`],
      issueId: issue.id
    });

    const teamId = `urgent_${issue.id}_${Date.now()}`;

    this.emit('urgentTeamCreated', {
      teamId,
      supervisorId: supervisor.config.id,
      issueId: issue.id,
      members: bestAgents.map(a => a.id),
      deadline: issue.deadline
    });

    return {
      teamId,
      supervisorId: supervisor.config.id,
      members: bestAgents.map(a => a.id),
      sessionId
    };
  }

  /**
   * Перебалансировать нагрузку между супервизорами
   */
  async rebalanceWorkload(): Promise<{
    moved: Array<{
      issueId: string;
      fromSupervisor: string;
      toSupervisor: string;
      reason: string;
    }>;
    efficiency: number;
  }> {
    this.logger.info('Rebalancing workload across supervisors');

    const moved: any[] = [];
    const supervisorLoads = this.calculateSupervisorLoads();
    
    // Найти перегруженных и недогруженных супервизоров
    const overloaded = supervisorLoads.filter(s => s.load > 0.9);
    const underloaded = supervisorLoads.filter(s => s.load < 0.5);

    for (const overloadedSupervisor of overloaded) {
      for (const underloadedSupervisor of underloaded) {
        // Найти подходящие issues для перемещения
        const candidateIssues = this.findMovableIssues(
          overloadedSupervisor.id,
          underloadedSupervisor.id
        );

        for (const issue of candidateIssues.slice(0, 2)) { // Максимум 2 за раз
          await this.moveIssue(issue.id, overloadedSupervisor.id, underloadedSupervisor.id);
          
          moved.push({
            issueId: issue.id,
            fromSupervisor: overloadedSupervisor.id,
            toSupervisor: underloadedSupervisor.id,
            reason: 'load_balancing'
          });
        }
      }
    }

    const newEfficiency = this.calculateGlobalEfficiency();

    this.emit('workloadRebalanced', {
      movedCount: moved.length,
      newEfficiency,
      moved
    });

    return {
      moved,
      efficiency: newEfficiency
    };
  }

  /**
   * Получить рекомендации по оптимизации работы всех команд
   */
  getOptimizationRecommendations(): Array<{
    type: 'capacity' | 'skills' | 'process' | 'tools';
    priority: 'high' | 'medium' | 'low';
    description: string;
    impact: string;
    supervisorId?: string;
  }> {
    const recommendations: any[] = [];
    const metrics = this.getGlobalMetrics();

    // Анализ загрузки
    const highLoadSupervisors = metrics.supervisors.filter(s => 
      s.metrics.agentUtilization > 0.9
    );
    
    if (highLoadSupervisors.length > 0) {
      recommendations.push({
        type: 'capacity',
        priority: 'high',
        description: 'Увеличить количество агентов в перегруженных командах',
        impact: 'Снижение времени ожидания на 30%',
        supervisorId: highLoadSupervisors[0].id
      });
    }

    // Анализ качества
    const lowQualitySupervisors = metrics.supervisors.filter(s => 
      s.metrics.averageQuality < 70
    );
    
    if (lowQualitySupervisors.length > 0) {
      recommendations.push({
        type: 'process',
        priority: 'high',
        description: 'Усилить процессы контроля качества',
        impact: 'Повышение качества на 25%',
        supervisorId: lowQualitySupervisors[0].id
      });
    }

    // Анализ навыков
    const skillGaps = this.analyzeGlobalSkillGaps();
    if (skillGaps.length > 0) {
      recommendations.push({
        type: 'skills',
        priority: 'medium',
        description: `Развить навыки: ${skillGaps.join(', ')}`,
        impact: 'Расширение возможностей команд'
      });
    }

    return recommendations;
  }

  private async createSupervisorForDomain(domain: string): Promise<void> {
    const expertise = this.domainExpertise.get(domain);
    if (!expertise) {
      this.logger.warn(`No expertise defined for domain: ${domain}`);
      return;
    }

    const supervisorConfig: SupervisorConfig = {
      id: `supervisor_${domain}`,
      name: `${domain.charAt(0).toUpperCase() + domain.slice(1)} Team`,
      domain,
      maxAgents: 8,
      strategy: 'collaborative',
      workingHours: this.config.workingHours,
      expertise: expertise.skills,
      quality: {
        minScore: 75,
        reviewRequired: true,
        approvalThreshold: 0.8
      }
    };

    const supervisor = new Supervisor(supervisorConfig);
    await supervisor.activate();
    
    this.supervisors.set(supervisorConfig.id, supervisor);
    expertise.supervisorId = supervisorConfig.id;

    // Настроить обработчики событий
    this.setupSupervisorEventHandlers(supervisor);

    this.logger.info(`Created supervisor for domain: ${domain}`, {
      supervisorId: supervisorConfig.id,
      skills: expertise.skills
    });
  }

  private initializeDomainExpertise(): void {
    const domains = [
      {
        domain: 'settings',
        skills: ['typescript', 'configuration', 'ui', 'validation', 'tui'],
        complexity: 7
      },
      {
        domain: 'security',
        skills: ['security', 'authentication', 'encryption', 'permissions'],
        complexity: 9
      },
      {
        domain: 'monitoring',
        skills: ['metrics', 'logging', 'performance', 'analytics'],
        complexity: 6
      },
      {
        domain: 'memory',
        skills: ['data-structures', 'algorithms', 'indexing', 'search'],
        complexity: 8
      },
      {
        domain: 'orchestration',
        skills: ['coordination', 'patterns', 'distributed-systems'],
        complexity: 9
      }
    ];

    for (const domain of domains) {
      this.domainExpertise.set(domain.domain, domain);
    }
  }

  private async findBestSupervisor(issue: any): Promise<Supervisor | undefined> {
    const candidates = Array.from(this.supervisors.values())
      .map(supervisor => ({
        supervisor,
        score: this.calculateSupervisorScore(supervisor, issue)
      }))
      .sort((a, b) => b.score - a.score);

    return candidates.length > 0 ? candidates[0].supervisor : undefined;
  }

  private calculateSupervisorScore(supervisor: Supervisor, issue: any): number {
    let score = 0;
    
    // Соответствие навыков
    const supervisorSkills = supervisor.config.expertise;
    const matchingSkills = issue.requiredSkills.filter((skill: string) => 
      supervisorSkills.includes(skill)
    );
    score += matchingSkills.length * 5;
    
    // Загрузка команды
    const metrics = supervisor.getTeamMetrics();
    score += (1 - metrics.agentUtilization) * 3;
    
    // Качество работы
    score += (metrics.averageQuality / 100) * 2;
    
    // Эффективность
    score += metrics.teamEfficiency * 2;
    
    return score;
  }

  private estimateResolutionTime(issue: any): number {
    // Базовое время + сложность + приоритет
    const baseTime = 1800000; // 30 минут
    const complexityFactor = issue.estimatedComplexity / 10;
    const priorityFactor = (10 - issue.priority) / 10;
    
    return baseTime * (1 + complexityFactor + priorityFactor);
  }

  private assessRiskLevel(issue: any): string {
    if (issue.priority > 8 || issue.estimatedComplexity > 8) {
      return 'high';
    } else if (issue.priority > 5 || issue.estimatedComplexity > 5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private calculateProgress(assignment: IssueAssignment): number {
    const elapsed = Date.now() - assignment.startTime;
    const total = assignment.estimatedCompletion - assignment.startTime;
    return Math.min(100, (elapsed / total) * 100);
  }

  private analyzeGlobalEfficiency(supervisorMetrics: any[]): any {
    const efficiencies = supervisorMetrics.map(s => s.metrics.teamEfficiency);
    const topPerformers = supervisorMetrics
      .filter(s => s.metrics.teamEfficiency > 0.8)
      .map(s => s.name);
    
    const bottlenecks = supervisorMetrics
      .filter(s => s.metrics.teamEfficiency < 0.6)
      .map(s => s.name);

    const recommendations = [];
    if (bottlenecks.length > 0) {
      recommendations.push('Оптимизировать процессы в команде с низкой эффективностью');
    }
    if (topPerformers.length > 0) {
      recommendations.push('Распространить лучшие практики от топ-команд');
    }

    return {
      topPerformers,
      bottlenecks,
      recommendations
    };
  }

  private async findBestAvailableAgents(requiredSkills: string[], count: number): Promise<any[]> {
    const allAgents: any[] = [];
    
    for (const supervisor of this.supervisors.values()) {
      const supervisorAgents = Array.from(supervisor.agents?.values() || [])
        .filter((agent: any) => agent.isAvailable())
        .map((agent: any) => ({
          id: agent.getId(),
          supervisorId: supervisor.config.id,
          skills: agent.getCapabilities(),
          score: this.calculateAgentSkillMatch(agent.getCapabilities(), requiredSkills)
        }));
      
      allAgents.push(...supervisorAgents);
    }
    
    return allAgents
      .sort((a, b) => b.score - a.score)
      .slice(0, count);
  }

  private calculateAgentSkillMatch(agentSkills: string[], requiredSkills: string[]): number {
    const matches = requiredSkills.filter(skill => agentSkills.includes(skill));
    return matches.length / requiredSkills.length;
  }

  private findLeastLoadedSupervisor(): Supervisor | undefined {
    return Array.from(this.supervisors.values())
      .sort((a, b) => {
        const aMetrics = a.getTeamMetrics();
        const bMetrics = b.getTeamMetrics();
        return aMetrics.agentUtilization - bMetrics.agentUtilization;
      })[0];
  }

  private calculateSupervisorLoads(): Array<{ id: string; load: number }> {
    return Array.from(this.supervisors.values()).map(supervisor => ({
      id: supervisor.config.id,
      load: supervisor.getTeamMetrics().agentUtilization
    }));
  }

  private findMovableIssues(fromSupervisorId: string, toSupervisorId: string): any[] {
    return Array.from(this.issueAssignments.values())
      .filter(assignment => 
        assignment.supervisorId === fromSupervisorId &&
        assignment.status === 'in_progress'
      )
      .slice(0, 3); // Максимум 3 кандидата
  }

  private async moveIssue(issueId: string, fromSupervisorId: string, toSupervisorId: string): Promise<void> {
    const assignment = this.issueAssignments.get(issueId);
    if (!assignment) return;

    // Обновить assignment
    assignment.supervisorId = toSupervisorId;
    assignment.agentIds = []; // Будут назначены заново
    
    this.logger.info('Moved issue between supervisors', {
      issueId,
      from: fromSupervisorId,
      to: toSupervisorId
    });
  }

  private calculateGlobalEfficiency(): number {
    const supervisorEfficiencies = Array.from(this.supervisors.values())
      .map(s => s.getTeamMetrics().teamEfficiency);
    
    return supervisorEfficiencies.reduce((sum, eff) => sum + eff, 0) / supervisorEfficiencies.length;
  }

  private analyzeGlobalSkillGaps(): string[] {
    const allSkills = new Set<string>();
    const supervisorSkills = new Set<string>();
    
    // Собрать все требуемые навыки
    for (const expertise of this.domainExpertise.values()) {
      expertise.skills.forEach(skill => allSkills.add(skill));
    }
    
    // Собрать навыки супервизоров
    for (const supervisor of this.supervisors.values()) {
      supervisor.config.expertise.forEach(skill => supervisorSkills.add(skill));
    }
    
    // Найти пробелы
    return Array.from(allSkills).filter(skill => !supervisorSkills.has(skill));
  }

  private async startGlobalMonitoring(): Promise<void> {
    // Глобальный мониторинг каждые 5 минут
    setInterval(() => {
      this.updateGlobalMetrics();
      this.checkForAutoScaling();
    }, 300000);
  }

  private updateGlobalMetrics(): void {
    const supervisorMetrics = Array.from(this.supervisors.values())
      .map(s => s.getTeamMetrics());

    this.globalMetrics.activeSupervisors = this.supervisors.size;
    this.globalMetrics.totalAgents = supervisorMetrics
      .reduce((sum, m) => sum + m.activeAgents, 0);
    this.globalMetrics.globalEfficiency = supervisorMetrics
      .reduce((sum, m) => sum + m.teamEfficiency, 0) / supervisorMetrics.length;
    
    this.emit('globalMetricsUpdated', this.globalMetrics);
  }

  private async checkForAutoScaling(): Promise<void> {
    if (!this.config.autoScaling) return;
    
    const globalEfficiency = this.globalMetrics.globalEfficiency;
    
    // Если эффективность низкая, перебалансировать
    if (globalEfficiency < 0.6) {
      await this.rebalanceWorkload();
    }
    
    // Проверить необходимость создания новых супервизоров
    const overloadedCount = Array.from(this.supervisors.values())
      .filter(s => s.getTeamMetrics().agentUtilization > 0.9)
      .length;
    
    if (overloadedCount > this.supervisors.size / 2 && this.supervisors.size < this.config.maxSupervisors) {
      this.logger.info('Auto-scaling: Creating additional supervisor');
      // Логика создания дополнительного супервизора
    }
  }

  private setupEventHandlers(): void {
    this.on('initialized', () => {
      this.logger.info('Supervisor Manager initialized');
    });
    
    this.on('issueAssigned', (event) => {
      this.logger.info('Issue assigned to supervisor', event);
    });
  }

  private setupSupervisorEventHandlers(supervisor: Supervisor): void {
    supervisor.on('activated', () => {
      this.logger.debug(`Supervisor activated: ${supervisor.config.id}`);
    });
    
    supervisor.on('metricsUpdated', (metrics) => {
      this.updateGlobalMetrics();
    });
    
    supervisor.on('recommendationsAvailable', (event) => {
      this.emit('supervisorRecommendations', {
        supervisorId: supervisor.config.id,
        recommendations: event.recommendations
      });
    });
  }
}