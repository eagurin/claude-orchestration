import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { Agent } from './agent.js';
import { Task, TaskResult } from '../types/index.js';

export interface SupervisorConfig {
  id: string;
  name: string;
  domain: string;
  maxAgents: number;
  strategy: 'collaborative' | 'hierarchical' | 'democratic' | 'expert-led';
  workingHours: {
    start: string;
    end: string;
    timezone: string;
  };
  expertise: string[];
  quality: {
    minScore: number;
    reviewRequired: boolean;
    approvalThreshold: number;
  };
}

export interface TeamMetrics {
  tasksCompleted: number;
  averageQuality: number;
  averageTime: number;
  agentUtilization: number;
  issuesResolved: number;
  blockedTasks: number;
  teamEfficiency: number;
}

export interface WorkSession {
  id: string;
  supervisorId: string;
  startTime: number;
  endTime?: number;
  participants: string[];
  tasksAssigned: string[];
  issueId?: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  metrics: TeamMetrics;
}

export interface DecisionContext {
  taskComplexity: number;
  urgency: number;
  requiredExpertise: string[];
  estimatedTime: number;
  dependencies: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Supervisor Agent - координирует команды агентов для решения GitHub issues
 * Обеспечивает непрерывную работу и эффективное управление ресурсами
 */
export class Supervisor extends EventEmitter {
  private logger: Logger;
  public config: SupervisorConfig;
  public agents: Map<string, Agent> = new Map();
  private activeTasks: Map<string, Task> = new Map();
  private workSessions: Map<string, WorkSession> = new Map();
  private metrics: TeamMetrics;
  private isActive = false;
  private decisionHistory: Array<{
    timestamp: number;
    decision: string;
    context: DecisionContext;
    outcome: string;
  }> = [];

  constructor(config: SupervisorConfig) {
    super();
    this.logger = new Logger(`Supervisor-${config.name}`);
    this.config = config;
    this.metrics = {
      tasksCompleted: 0,
      averageQuality: 0,
      averageTime: 0,
      agentUtilization: 0,
      issuesResolved: 0,
      blockedTasks: 0,
      teamEfficiency: 0
    };

    this.setupEventHandlers();
    this.startPeriodicReviews();
  }

  /**
   * Активировать супервизора и начать работу команды
   */
  async activate(): Promise<void> {
    if (this.isActive) {
      this.logger.warn('Supervisor already active');
      return;
    }

    this.logger.info('Activating supervisor', {
      domain: this.config.domain,
      strategy: this.config.strategy,
      maxAgents: this.config.maxAgents
    });

    this.isActive = true;
    await this.initializeTeam();
    await this.startWorkSession();
    
    this.emit('activated', {
      supervisorId: this.config.id,
      domain: this.config.domain,
      agentCount: this.agents.size
    });
  }

  /**
   * Деактивировать супервизора и завершить текущие задачи
   */
  async deactivate(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.logger.info('Deactivating supervisor');
    
    // Завершить активные задачи
    await this.completeActiveTasks();
    
    // Закрыть рабочую сессию
    await this.endCurrentWorkSession();
    
    // Деактивировать агентов
    for (const agent of this.agents.values()) {
      await agent.stop();
    }
    
    this.isActive = false;
    this.emit('deactivated', {
      supervisorId: this.config.id,
      finalMetrics: this.metrics
    });
  }

  /**
   * Назначить задачу команде
   */
  async assignTask(task: Task, context: DecisionContext): Promise<TaskResult> {
    if (!this.isActive) {
      throw new Error('Supervisor not active');
    }

    this.logger.info('Assigning task to team', {
      taskId: task.id,
      complexity: context.taskComplexity,
      urgency: context.urgency
    });

    // Анализ задачи и выбор стратегии
    const strategy = await this.analyzeAndChooseStrategy(task, context);
    
    // Выбор и подготовка агентов
    const selectedAgents = await this.selectAgents(task, context);
    
    // Распределение работы
    const workPlan = await this.createWorkPlan(task, selectedAgents, strategy);
    
    // Выполнение с мониторингом
    const result = await this.executeWithSupervision(task, workPlan, context);
    
    // Обновление метрик и истории
    await this.updateMetrics(task, result);
    this.recordDecision(strategy, context, result.success ? 'success' : 'failure');
    
    return result;
  }

  /**
   * Получить текущие метрики команды
   */
  getTeamMetrics(): TeamMetrics & {
    activeAgents: number;
    activeTasks: number;
    currentSession?: string;
    workingHours: SupervisorConfig['workingHours'];
  } {
    return {
      ...this.metrics,
      activeAgents: Array.from(this.agents.values()).filter(a => a.isAvailable()).length,
      activeTasks: this.activeTasks.size,
      currentSession: this.getCurrentWorkSession()?.id,
      workingHours: this.config.workingHours
    };
  }

  /**
   * Получить рекомендации по улучшению работы команды
   */
  getTeamRecommendations(): Array<{
    type: 'efficiency' | 'quality' | 'capacity' | 'skills';
    priority: 'high' | 'medium' | 'low';
    recommendation: string;
    impact: string;
  }> {
    const recommendations: Array<any> = [];

    // Анализ эффективности
    if (this.metrics.teamEfficiency < 0.7) {
      recommendations.push({
        type: 'efficiency',
        priority: 'high',
        recommendation: 'Оптимизировать распределение задач и устранить блокеры',
        impact: 'Повышение производительности на 20-30%'
      });
    }

    // Анализ качества
    if (this.metrics.averageQuality < this.config.quality.minScore) {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        recommendation: 'Усилить код-ревью и тестирование',
        impact: 'Снижение багов на 40%'
      });
    }

    // Анализ загрузки
    if (this.metrics.agentUtilization > 0.9) {
      recommendations.push({
        type: 'capacity',
        priority: 'medium',
        recommendation: 'Добавить дополнительных агентов в команду',
        impact: 'Снижение времени выполнения задач'
      });
    }

    // Анализ экспертизы
    const skillGaps = this.analyzeSkillGaps();
    if (skillGaps.length > 0) {
      recommendations.push({
        type: 'skills',
        priority: 'medium',
        recommendation: `Развить навыки: ${skillGaps.join(', ')}`,
        impact: 'Расширение возможностей команды'
      });
    }

    return recommendations;
  }

  /**
   * Создать отчет о работе команды
   */
  generateTeamReport(period: 'day' | 'week' | 'month'): {
    summary: string;
    metrics: TeamMetrics;
    achievements: string[];
    challenges: string[];
    recommendations: any[];
    efficiency: {
      score: number;
      factors: Record<string, number>;
    };
  } {
    const achievements = this.getTeamAchievements(period);
    const challenges = this.getTeamChallenges(period);
    const recommendations = this.getTeamRecommendations();
    const efficiency = this.calculateEfficiencyScore();

    return {
      summary: this.generateSummary(period),
      metrics: this.metrics,
      achievements,
      challenges,
      recommendations,
      efficiency
    };
  }

  /**
   * Управление рабочими сессиями
   */
  async startSpecialSession(type: 'sprint' | 'bugfix' | 'review' | 'planning', config: {
    duration?: number;
    participants?: string[];
    objectives?: string[];
    issueId?: string;
  }): Promise<string> {
    const sessionId = `${type}_${Date.now()}`;
    
    const session: WorkSession = {
      id: sessionId,
      supervisorId: this.config.id,
      startTime: Date.now(),
      participants: config.participants || Array.from(this.agents.keys()),
      tasksAssigned: [],
      issueId: config.issueId,
      status: 'active',
      metrics: { ...this.metrics }
    };

    this.workSessions.set(sessionId, session);
    
    this.logger.info(`Started ${type} session`, {
      sessionId,
      participants: session.participants.length,
      objectives: config.objectives?.length || 0
    });

    this.emit('sessionStarted', {
      sessionId,
      type,
      config
    });

    return sessionId;
  }

  private async initializeTeam(): Promise<void> {
    this.logger.info('Initializing team', { domain: this.config.domain });
    
    // Создать начальную команду агентов
    for (let i = 0; i < Math.min(this.config.maxAgents, 3); i++) {
      const agentId = `${this.config.id}_agent_${i}`;
      const agent = new Agent({
        id: agentId,
        name: `${this.config.name} Agent ${i + 1}`,
        role: this.assignAgentRole(i),
        capabilities: this.config.expertise,
        supervisor: this.config.id
      });

      await agent.initialize();
      this.agents.set(agentId, agent);
      
      // Настроить обработчики событий агента
      this.setupAgentEventHandlers(agent);
    }

    this.logger.info('Team initialized', { agentCount: this.agents.size });
  }

  private assignAgentRole(index: number): string {
    const roles = ['lead', 'specialist', 'support', 'tester', 'reviewer'];
    return roles[index % roles.length];
  }

  private async analyzeAndChooseStrategy(task: Task, context: DecisionContext): Promise<string> {
    // Анализ на основе сложности и контекста
    if (context.taskComplexity > 8 || context.riskLevel === 'high') {
      return 'expert-led';
    }
    
    if (context.urgency > 7) {
      return 'collaborative';
    }
    
    if (this.config.strategy === 'democratic' && this.agents.size >= 3) {
      return 'democratic';
    }
    
    return this.config.strategy;
  }

  private async selectAgents(task: Task, context: DecisionContext): Promise<Agent[]> {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.isAvailable());

    if (availableAgents.length === 0) {
      throw new Error('No available agents');
    }

    // Сортировка по релевантности навыков
    const scored = availableAgents.map(agent => ({
      agent,
      score: this.calculateAgentScore(agent, context)
    })).sort((a, b) => b.score - a.score);

    // Выбор оптимального количества агентов
    const optimalCount = Math.min(
      Math.max(1, Math.ceil(context.taskComplexity / 3)),
      this.config.maxAgents,
      scored.length
    );

    return scored.slice(0, optimalCount).map(s => s.agent);
  }

  private calculateAgentScore(agent: Agent, context: DecisionContext): number {
    let score = 0;
    
    // Соответствие навыков
    const agentSkills = agent.getCapabilities();
    const matchingSkills = context.requiredExpertise.filter(skill => 
      agentSkills.includes(skill)
    );
    score += matchingSkills.length * 3;
    
    // Загрузка агента
    const utilization = agent.getCurrentUtilization();
    score += (1 - utilization) * 2;
    
    // История успешности
    const successRate = agent.getSuccessRate();
    score += successRate * 2;
    
    return score;
  }

  private async createWorkPlan(task: Task, agents: Agent[], strategy: string): Promise<{
    phases: Array<{
      name: string;
      agents: string[];
      tasks: string[];
      duration: number;
      dependencies: string[];
    }>;
    totalEstimate: number;
    riskMitigation: string[];
  }> {
    const phases = [];
    let totalEstimate = 0;

    switch (strategy) {
      case 'expert-led':
        // Ведущий эксперт + поддержка
        phases.push({
          name: 'analysis',
          agents: [agents[0].getId()],
          tasks: ['analyze', 'plan'],
          duration: 1800000, // 30 min
          dependencies: []
        });
        phases.push({
          name: 'implementation',
          agents: agents.map(a => a.getId()),
          tasks: ['implement', 'test'],
          duration: 3600000, // 60 min
          dependencies: ['analysis']
        });
        totalEstimate = 5400000; // 90 min
        break;

      case 'collaborative':
        // Параллельная работа
        phases.push({
          name: 'parallel-work',
          agents: agents.map(a => a.getId()),
          tasks: ['implement'],
          duration: 2400000, // 40 min
          dependencies: []
        });
        phases.push({
          name: 'integration',
          agents: [agents[0].getId()],
          tasks: ['integrate', 'test'],
          duration: 1200000, // 20 min
          dependencies: ['parallel-work']
        });
        totalEstimate = 3600000; // 60 min
        break;

      case 'democratic':
        // Голосование и консенсус
        phases.push({
          name: 'discussion',
          agents: agents.map(a => a.getId()),
          tasks: ['discuss', 'vote'],
          duration: 900000, // 15 min
          dependencies: []
        });
        phases.push({
          name: 'consensus-work',
          agents: agents.map(a => a.getId()),
          tasks: ['implement'],
          duration: 2700000, // 45 min
          dependencies: ['discussion']
        });
        totalEstimate = 3600000; // 60 min
        break;

      default:
        // Иерархическая структура
        phases.push({
          name: 'planning',
          agents: [agents[0].getId()],
          tasks: ['plan'],
          duration: 600000, // 10 min
          dependencies: []
        });
        phases.push({
          name: 'execution',
          agents: agents.slice(1).map(a => a.getId()),
          tasks: ['implement'],
          duration: 2400000, // 40 min
          dependencies: ['planning']
        });
        phases.push({
          name: 'review',
          agents: [agents[0].getId()],
          tasks: ['review', 'approve'],
          duration: 600000, // 10 min
          dependencies: ['execution']
        });
        totalEstimate = 3600000; // 60 min
    }

    return {
      phases,
      totalEstimate,
      riskMitigation: this.generateRiskMitigation(task, strategy)
    };
  }

  private generateRiskMitigation(task: Task, strategy: string): string[] {
    const mitigation = [
      'Автоматическое резервное копирование прогресса каждые 15 минут',
      'Мониторинг качества кода в реальном времени',
      'Автоматическое тестирование на каждом этапе'
    ];

    if (strategy === 'collaborative') {
      mitigation.push('Синхронизация изменений каждые 10 минут');
      mitigation.push('Автоматическое разрешение конфликтов слияния');
    }

    if (task.priority && task.priority > 7) {
      mitigation.push('Приоритетное выделение ресурсов');
      mitigation.push('Ускоренный процесс утверждения');
    }

    return mitigation;
  }

  private async executeWithSupervision(
    task: Task, 
    workPlan: any, 
    context: DecisionContext
  ): Promise<TaskResult> {
    const startTime = Date.now();
    this.activeTasks.set(task.id, task);

    try {
      this.logger.info('Starting supervised execution', {
        taskId: task.id,
        phases: workPlan.phases.length,
        estimatedTime: workPlan.totalEstimate
      });

      const results: any[] = [];
      
      for (const phase of workPlan.phases) {
        this.logger.debug(`Executing phase: ${phase.name}`, {
          agents: phase.agents.length,
          duration: phase.duration
        });

        const phaseResult = await this.executePhase(phase, task);
        results.push(phaseResult);
        
        // Проверка качества после каждой фазы
        if (phaseResult.qualityScore < this.config.quality.minScore) {
          this.logger.warn(`Phase ${phase.name} quality below threshold`, {
            score: phaseResult.qualityScore,
            threshold: this.config.quality.minScore
          });
          
          if (this.config.quality.reviewRequired) {
            await this.requestQualityReview(task, phase, phaseResult);
          }
        }
      }

      const executionTime = Date.now() - startTime;
      const overallQuality = results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length;

      return {
        success: true,
        result: results,
        executionTime,
        qualityScore: overallQuality,
        agentsUsed: workPlan.phases.flatMap(p => p.agents),
        metadata: {
          strategy: workPlan.strategy,
          phasesCompleted: results.length,
          supervisionEvents: this.getSupervisionEvents(task.id)
        }
      };

    } catch (error) {
      this.logger.error('Supervised execution failed', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - startTime,
        qualityScore: 0,
        agentsUsed: [],
        metadata: {
          failurePhase: this.getCurrentPhase(task.id),
          supervisionEvents: this.getSupervisionEvents(task.id)
        }
      };
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  private async executePhase(phase: any, task: Task): Promise<any> {
    const agents = phase.agents.map(id => this.agents.get(id)).filter(Boolean);
    
    // Симуляция выполнения фазы
    await new Promise(resolve => setTimeout(resolve, Math.min(phase.duration / 10, 5000)));
    
    return {
      name: phase.name,
      success: true,
      qualityScore: 75 + Math.random() * 20, // 75-95
      duration: phase.duration,
      output: `Phase ${phase.name} completed successfully for task ${task.id}`
    };
  }

  private async requestQualityReview(task: Task, phase: any, result: any): Promise<void> {
    this.logger.info('Requesting quality review', {
      taskId: task.id,
      phase: phase.name,
      score: result.qualityScore
    });

    // Назначить дополнительного рецензента
    const reviewer = this.findBestReviewer();
    if (reviewer) {
      await reviewer.reviewWork(task.id, result);
    }
  }

  private findBestReviewer(): Agent | undefined {
    return Array.from(this.agents.values())
      .filter(agent => agent.isAvailable())
      .sort((a, b) => b.getSuccessRate() - a.getSuccessRate())[0];
  }

  private getSupervisionEvents(taskId: string): any[] {
    // Возвращает события супервизии для задачи
    return [
      { type: 'started', timestamp: Date.now() - 1800000 },
      { type: 'quality_check', timestamp: Date.now() - 900000 },
      { type: 'completed', timestamp: Date.now() }
    ];
  }

  private getCurrentPhase(taskId: string): string {
    // Определяет текущую фазу выполнения задачи
    return 'implementation';
  }

  private async updateMetrics(task: Task, result: TaskResult): Promise<void> {
    this.metrics.tasksCompleted++;
    
    if (result.success) {
      this.metrics.averageQuality = (this.metrics.averageQuality + (result.qualityScore || 0)) / 2;
      this.metrics.averageTime = (this.metrics.averageTime + result.executionTime) / 2;
    }
    
    this.metrics.agentUtilization = this.calculateAgentUtilization();
    this.metrics.teamEfficiency = this.calculateTeamEfficiency();
    
    this.emit('metricsUpdated', this.metrics);
  }

  private recordDecision(decision: string, context: DecisionContext, outcome: string): void {
    this.decisionHistory.push({
      timestamp: Date.now(),
      decision,
      context,
      outcome
    });
    
    // Ограничить историю последними 100 решениями
    if (this.decisionHistory.length > 100) {
      this.decisionHistory = this.decisionHistory.slice(-100);
    }
  }

  private calculateAgentUtilization(): number {
    const utilizations = Array.from(this.agents.values())
      .map(agent => agent.getCurrentUtilization());
    
    return utilizations.reduce((sum, util) => sum + util, 0) / utilizations.length;
  }

  private calculateTeamEfficiency(): number {
    const factors = [
      this.metrics.averageQuality / 100,
      Math.min(this.metrics.agentUtilization, 1),
      1 - (this.metrics.blockedTasks / Math.max(this.metrics.tasksCompleted, 1))
    ];
    
    return factors.reduce((sum, factor) => sum + factor, 0) / factors.length;
  }

  private analyzeSkillGaps(): string[] {
    // Анализ пробелов в навыках команды
    const requiredSkills = ['typescript', 'testing', 'documentation', 'debugging'];
    const teamSkills = Array.from(this.agents.values())
      .flatMap(agent => agent.getCapabilities());
    
    return requiredSkills.filter(skill => !teamSkills.includes(skill));
  }

  private getTeamAchievements(period: string): string[] {
    return [
      `Решено ${this.metrics.issuesResolved} issues`,
      `Средняя оценка качества: ${this.metrics.averageQuality.toFixed(1)}`,
      `Эффективность команды: ${(this.metrics.teamEfficiency * 100).toFixed(1)}%`
    ];
  }

  private getTeamChallenges(period: string): string[] {
    const challenges = [];
    
    if (this.metrics.blockedTasks > 0) {
      challenges.push(`${this.metrics.blockedTasks} заблокированных задач`);
    }
    
    if (this.metrics.averageQuality < this.config.quality.minScore) {
      challenges.push('Качество ниже требуемого уровня');
    }
    
    if (this.metrics.agentUtilization > 0.9) {
      challenges.push('Высокая загрузка команды');
    }
    
    return challenges;
  }

  private generateSummary(period: string): string {
    return `Команда "${this.config.name}" за ${period} выполнила ${this.metrics.tasksCompleted} задач ` +
           `с эффективностью ${(this.metrics.teamEfficiency * 100).toFixed(1)}% и средней оценкой качества ` +
           `${this.metrics.averageQuality.toFixed(1)} баллов.`;
  }

  private calculateEfficiencyScore(): { score: number; factors: Record<string, number> } {
    const factors = {
      quality: this.metrics.averageQuality / 100,
      speed: Math.max(0, 1 - (this.metrics.averageTime / 3600000)), // Относительно 1 часа
      utilization: Math.min(this.metrics.agentUtilization, 1),
      completion: this.metrics.tasksCompleted / Math.max(this.metrics.tasksCompleted + this.metrics.blockedTasks, 1)
    };
    
    const score = Object.values(factors).reduce((sum, factor) => sum + factor, 0) / Object.keys(factors).length;
    
    return { score, factors };
  }

  private async startWorkSession(): Promise<void> {
    const sessionId = await this.startSpecialSession('planning', {
      objectives: ['Initialize team work', 'Establish workflow', 'Begin issue resolution']
    });
    
    this.logger.info('Work session started', { sessionId });
  }

  private async endCurrentWorkSession(): Promise<void> {
    const currentSession = this.getCurrentWorkSession();
    if (currentSession) {
      currentSession.endTime = Date.now();
      currentSession.status = 'completed';
      currentSession.metrics = { ...this.metrics };
      
      this.emit('sessionEnded', {
        sessionId: currentSession.id,
        duration: currentSession.endTime - currentSession.startTime,
        finalMetrics: currentSession.metrics
      });
    }
  }

  private getCurrentWorkSession(): WorkSession | undefined {
    return Array.from(this.workSessions.values())
      .find(session => session.status === 'active');
  }

  private async completeActiveTasks(): Promise<void> {
    const tasks = Array.from(this.activeTasks.values());
    for (const task of tasks) {
      this.logger.info(`Completing active task: ${task.id}`);
      // Завершить задачу корректно
    }
  }

  private setupEventHandlers(): void {
    // Обработка событий супервизора
    this.on('activated', () => {
      this.logger.info('Supervisor activated');
    });
    
    this.on('deactivated', () => {
      this.logger.info('Supervisor deactivated');
    });
  }

  private setupAgentEventHandlers(agent: Agent): void {
    agent.on('taskCompleted', (event) => {
      this.logger.debug('Agent completed task', {
        agentId: agent.getId(),
        taskId: event.taskId
      });
    });
    
    agent.on('error', (error) => {
      this.logger.error('Agent error', {
        agentId: agent.getId(),
        error: error.message
      });
    });
  }

  private startPeriodicReviews(): void {
    // Периодические обзоры работы команды
    setInterval(() => {
      if (this.isActive) {
        this.conductPeriodicReview();
      }
    }, 1800000); // Каждые 30 минут
  }

  private async conductPeriodicReview(): Promise<void> {
    this.logger.debug('Conducting periodic team review');
    
    const recommendations = this.getTeamRecommendations();
    if (recommendations.length > 0) {
      this.emit('recommendationsAvailable', {
        supervisorId: this.config.id,
        recommendations
      });
    }
    
    // Автоматическое масштабирование команды
    if (this.metrics.agentUtilization > 0.9 && this.agents.size < this.config.maxAgents) {
      await this.scaleUpTeam();
    } else if (this.metrics.agentUtilization < 0.3 && this.agents.size > 1) {
      await this.scaleDownTeam();
    }
  }

  private async scaleUpTeam(): Promise<void> {
    this.logger.info('Scaling up team due to high utilization');
    // Добавить нового агента
    const newAgentId = `${this.config.id}_agent_${this.agents.size}`;
    const agent = new Agent({
      id: newAgentId,
      name: `${this.config.name} Agent ${this.agents.size + 1}`,
      role: 'support',
      capabilities: this.config.expertise,
      supervisor: this.config.id
    });
    
    await agent.initialize();
    this.agents.set(newAgentId, agent);
    this.setupAgentEventHandlers(agent);
    
    this.emit('teamScaled', {
      action: 'up',
      newSize: this.agents.size,
      reason: 'high_utilization'
    });
  }

  private async scaleDownTeam(): Promise<void> {
    this.logger.info('Scaling down team due to low utilization');
    // Удалить одного агента (не лидера)
    const agentsToRemove = Array.from(this.agents.values())
      .filter(agent => agent.getRole() !== 'lead')
      .slice(-1);
    
    for (const agent of agentsToRemove) {
      await agent.stop();
      this.agents.delete(agent.getId());
    }
    
    this.emit('teamScaled', {
      action: 'down',
      newSize: this.agents.size,
      reason: 'low_utilization'
    });
  }
}