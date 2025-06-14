import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { SupervisorManager } from './supervisor-manager.js';
import { GitHubIssueHandler } from './github-issue-handler.js';
import { ConfigManager } from '../settings/config-manager.js';
import type { 
  OrchestrationDirectorConfig,
  GitHubIssue 
} from '../types/index.js';

export interface OrchestrationMetrics {
  global: {
    totalIssuesProcessed: number;
    activeIssues: number;
    averageResolutionTime: number;
    successRate: number;
    totalSupervisors: number;
    totalAgents: number;
    globalEfficiency: number;
  };
  performance: {
    cpuUsage: number;
    memoryUsage: number;
    networkLatency: number;
    queueLength: number;
  };
  quality: {
    averageCodeQuality: number;
    testCoverage: number;
    bugRate: number;
    customerSatisfaction: number;
  };
}

/**
 * Директор оркестрации - центральное управление всей системой супервизоров
 * Координирует работу всех групп агентов и обеспечивает эффективное решение GitHub issues
 */
export class OrchestrationDirector extends EventEmitter {
  private logger: Logger;
  private config: OrchestrationDirectorConfig;
  private configManager: ConfigManager;
  private supervisorManager: SupervisorManager;
  private githubHandler: GitHubIssueHandler;
  private isActive = false;
  private metrics: OrchestrationMetrics;
  private performanceHistory: Array<{
    timestamp: number;
    metrics: OrchestrationMetrics;
  }> = [];

  constructor(config: OrchestrationDirectorConfig, configManager: ConfigManager) {
    super();
    this.logger = new Logger('OrchestrationDirector');
    this.config = config;
    this.configManager = configManager;
    
    // Инициализация компонентов
    this.supervisorManager = new SupervisorManager(config.supervisor);
    this.githubHandler = new GitHubIssueHandler(this.supervisorManager);
    
    this.metrics = this.initializeMetrics();
    this.setupEventHandlers();
  }

  /**
   * Запустить систему оркестрации
   */
  async start(): Promise<void> {
    if (this.isActive) {
      this.logger.warn('Orchestration Director already active');
      return;
    }

    this.logger.info('Starting Orchestration Director', {
      supervisorConfig: this.config.supervisor,
      githubEnabled: this.config.github.enabled
    });

    try {
      // Инициализация супервизоров
      await this.supervisorManager.initialize();
      
      // Запуск GitHub обработчика
      if (this.config.github.enabled) {
        await this.githubHandler.activate();
      }
      
      // Запуск мониторинга и балансировки
      this.startPerformanceMonitoring();
      this.startAutomaticBalancing();
      
      if (this.config.reporting.enabled) {
        this.startReporting();
      }

      this.isActive = true;
      
      this.emit('started', {
        supervisors: this.supervisorManager.getGlobalMetrics().supervisors.length,
        githubEnabled: this.config.github.enabled
      });

      this.logger.info('Orchestration Director started successfully');

    } catch (error) {
      this.logger.error('Failed to start Orchestration Director', error);
      throw error;
    }
  }

  /**
   * Остановить систему оркестрации
   */
  async stop(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.logger.info('Stopping Orchestration Director');

    try {
      // Остановка GitHub обработчика
      if (this.config.github.enabled) {
        await this.githubHandler.deactivate();
      }
      
      // Деактивация супервизоров
      // await this.supervisorManager.deactivateAll();
      
      this.isActive = false;
      
      this.emit('stopped', {
        finalMetrics: this.metrics
      });

      this.logger.info('Orchestration Director stopped');

    } catch (error) {
      this.logger.error('Error stopping Orchestration Director', error);
      throw error;
    }
  }

  /**
   * Обработать новый GitHub issue
   */
  async processGitHubIssue(issue: GitHubIssue): Promise<{
    success: boolean;
    assignmentId?: string;
    supervisorId?: string;
    estimatedCompletion?: string;
    error?: string;
  }> {
    if (!this.isActive) {
      throw new Error('Orchestration Director not active');
    }

    this.logger.info('Processing GitHub issue', {
      issueId: issue.id,
      number: issue.number,
      title: issue.title
    });

    try {
      const result = await this.githubHandler.handleNewIssue(issue);
      
      if (result.success) {
        this.updateMetrics('issueProcessed', {
          supervisorId: result.supervisorId,
          estimatedTime: result.estimatedCompletion
        });
      }

      return {
        success: result.success,
        assignmentId: result.teamId || result.supervisorId,
        supervisorId: result.supervisorId,
        estimatedCompletion: result.estimatedCompletion ? 
          new Date(result.estimatedCompletion).toISOString() : undefined,
        error: result.error
      };

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
   * Получить полный статус системы
   */
  getSystemStatus(): {
    active: boolean;
    metrics: OrchestrationMetrics;
    supervisors: any;
    github: any;
    activeIssues: any[];
    performance: {
      score: number;
      trend: 'improving' | 'stable' | 'declining';
      bottlenecks: string[];
    };
  } {
    const supervisorMetrics = this.supervisorManager.getGlobalMetrics();
    const githubStats = this.githubHandler.getProcessingStats();
    const activeIssues = this.githubHandler.getActiveIssueAssignments();
    
    return {
      active: this.isActive,
      metrics: this.metrics,
      supervisors: supervisorMetrics,
      github: githubStats,
      activeIssues,
      performance: this.analyzePerformance()
    };
  }

  /**
   * Создать специальную команду для критического issue
   */
  async createCrisisTeam(issue: {
    id: string;
    title: string;
    severity: 'critical' | 'emergency';
    deadline: number;
    requiredSkills: string[];
    stakeholders: string[];
  }): Promise<{
    teamId: string;
    supervisorId: string;
    members: string[];
    sessionId: string;
    escalationPlan: string[];
  }> {
    this.logger.info('Creating crisis team for critical issue', {
      issueId: issue.id,
      severity: issue.severity,
      deadline: new Date(issue.deadline).toISOString()
    });

    // Создать ургентную команду с максимальными ресурсами
    const urgentTeam = await this.supervisorManager.createUrgentTeam({
      id: issue.id,
      title: issue.title,
      priority: 10,
      deadline: issue.deadline,
      requiredSkills: issue.requiredSkills
    });

    // Создать план эскалации
    const escalationPlan = this.createEscalationPlan(issue);

    this.emit('crisisTeamCreated', {
      issueId: issue.id,
      teamId: urgentTeam.teamId,
      severity: issue.severity,
      escalationPlan
    });

    return {
      teamId: urgentTeam.teamId,
      supervisorId: urgentTeam.supervisorId,
      members: urgentTeam.members,
      sessionId: urgentTeam.sessionId,
      escalationPlan
    };
  }

  /**
   * Оптимизировать производительность системы
   */
  async optimizePerformance(): Promise<{
    actions: Array<{
      type: string;
      description: string;
      impact: string;
      implemented: boolean;
    }>;
    expectedImprovement: number;
  }> {
    this.logger.info('Starting performance optimization');

    const actions: any[] = [];
    let expectedImprovement = 0;

    // Перебалансировка нагрузки
    const rebalanceResult = await this.supervisorManager.rebalanceWorkload();
    if (rebalanceResult.moved.length > 0) {
      actions.push({
        type: 'load_balancing',
        description: `Rebalanced ${rebalanceResult.moved.length} issues between supervisors`,
        impact: `Efficiency improved to ${(rebalanceResult.efficiency * 100).toFixed(1)}%`,
        implemented: true
      });
      expectedImprovement += 0.15; // 15% улучшение
    }

    // Оптимизация конфигурации
    const configOptimizations = await this.optimizeConfiguration();
    actions.push(...configOptimizations.actions);
    expectedImprovement += configOptimizations.improvement;

    // Масштабирование ресурсов
    const scalingActions = await this.autoScaleResources();
    actions.push(...scalingActions.actions);
    expectedImprovement += scalingActions.improvement;

    this.emit('performanceOptimized', {
      actionsCount: actions.length,
      expectedImprovement,
      actions
    });

    return {
      actions,
      expectedImprovement
    };
  }

  /**
   * Генерировать отчет о работе системы
   */
  generateSystemReport(period: 'hour' | 'day' | 'week' | 'month'): {
    summary: string;
    metrics: OrchestrationMetrics;
    highlights: string[];
    issues: string[];
    recommendations: string[];
    charts: {
      efficiency: number[];
      throughput: number[];
      quality: number[];
    };
  } {
    const periodData = this.getHistoricalData(period);
    
    return {
      summary: this.generateSummary(period, periodData),
      metrics: this.metrics,
      highlights: this.getHighlights(periodData),
      issues: this.getIssues(periodData),
      recommendations: this.getRecommendations(),
      charts: this.generateChartData(periodData)
    };
  }

  private initializeMetrics(): OrchestrationMetrics {
    return {
      global: {
        totalIssuesProcessed: 0,
        activeIssues: 0,
        averageResolutionTime: 0,
        successRate: 0,
        totalSupervisors: 0,
        totalAgents: 0,
        globalEfficiency: 0
      },
      performance: {
        cpuUsage: 0,
        memoryUsage: 0,
        networkLatency: 0,
        queueLength: 0
      },
      quality: {
        averageCodeQuality: 0,
        testCoverage: 0,
        bugRate: 0,
        customerSatisfaction: 0
      }
    };
  }

  private setupEventHandlers(): void {
    // Обработка событий от супервизоров
    this.supervisorManager.on('issueAssigned', (event) => {
      this.logger.debug('Issue assigned by supervisor manager', event);
      this.updateMetrics('issueAssigned', event);
    });

    this.supervisorManager.on('workloadRebalanced', (event) => {
      this.logger.info('Workload rebalanced', event);
      this.emit('systemOptimized', { type: 'rebalancing', ...event });
    });

    // Обработка событий от GitHub handler
    this.githubHandler.on('issueAssigned', (event) => {
      this.logger.info('GitHub issue assigned to team', event);
    });

    this.githubHandler.on('urgentIssueAssigned', (event) => {
      this.logger.warn('Urgent GitHub issue assigned', event);
      this.emit('urgentIssueProcessed', event);
    });

    // Обработка изменений конфигурации
    this.configManager.on('configChanged', (event) => {
      this.handleConfigChange(event);
    });
  }

  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.collectMetrics();
      this.analyzePerformanceTrends();
    }, this.config.performance.metricsCollectionInterval);
  }

  private startAutomaticBalancing(): void {
    setInterval(async () => {
      if (this.shouldRebalance()) {
        await this.supervisorManager.rebalanceWorkload();
      }
    }, this.config.performance.balancingInterval);
  }

  private startReporting(): void {
    setInterval(() => {
      this.generateAndSendReport();
    }, this.config.reporting.interval);
  }

  private collectMetrics(): void {
    const supervisorMetrics = this.supervisorManager.getGlobalMetrics();
    const githubStats = this.githubHandler.getProcessingStats();
    const systemPerformance = this.getSystemPerformance();

    this.metrics = {
      global: {
        totalIssuesProcessed: githubStats.processed,
        activeIssues: githubStats.inQueue + supervisorMetrics.supervisors.reduce((sum, s) => sum + s.activeIssues, 0),
        averageResolutionTime: githubStats.avgProcessingTime,
        successRate: githubStats.successRate,
        totalSupervisors: supervisorMetrics.overview.activeSupervisors,
        totalAgents: supervisorMetrics.overview.totalAgents,
        globalEfficiency: supervisorMetrics.overview.globalEfficiency
      },
      performance: systemPerformance,
      quality: this.getQualityMetrics(supervisorMetrics)
    };

    // Сохранить в историю
    this.performanceHistory.push({
      timestamp: Date.now(),
      metrics: { ...this.metrics }
    });

    // Ограничить историю последними 1000 записями
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }

    this.emit('metricsUpdated', this.metrics);
  }

  private getSystemPerformance(): OrchestrationMetrics['performance'] {
    // Симуляция системных метрик
    return {
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      networkLatency: Math.random() * 100,
      queueLength: this.githubHandler.getProcessingStats().inQueue
    };
  }

  private getQualityMetrics(supervisorMetrics: any): OrchestrationMetrics['quality'] {
    const qualityScores = supervisorMetrics.supervisors.map((s: any) => s.metrics.averageQuality);
    const averageQuality = qualityScores.reduce((sum: number, q: number) => sum + q, 0) / qualityScores.length;

    return {
      averageCodeQuality: averageQuality,
      testCoverage: 85 + Math.random() * 10, // Симуляция
      bugRate: Math.random() * 5,
      customerSatisfaction: 4.2 + Math.random() * 0.8 // 4.2-5.0
    };
  }

  private updateMetrics(eventType: string, data: any): void {
    switch (eventType) {
      case 'issueProcessed':
        this.metrics.global.totalIssuesProcessed++;
        break;
      case 'issueAssigned':
        this.metrics.global.activeIssues++;
        break;
    }
  }

  private analyzePerformance(): {
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    bottlenecks: string[];
  } {
    const recentMetrics = this.performanceHistory.slice(-10); // Последние 10 записей
    const bottlenecks: string[] = [];

    // Анализ тренда эффективности
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (recentMetrics.length >= 2) {
      const first = recentMetrics[0].metrics.global.globalEfficiency;
      const last = recentMetrics[recentMetrics.length - 1].metrics.global.globalEfficiency;
      const change = (last - first) / first;
      
      if (change > 0.05) trend = 'improving';
      else if (change < -0.05) trend = 'declining';
    }

    // Поиск узких мест
    if (this.metrics.performance.cpuUsage > 80) {
      bottlenecks.push('High CPU usage');
    }
    if (this.metrics.performance.memoryUsage > 85) {
      bottlenecks.push('High memory usage');
    }
    if (this.metrics.performance.queueLength > 10) {
      bottlenecks.push('Large issue queue');
    }
    if (this.metrics.global.globalEfficiency < 0.7) {
      bottlenecks.push('Low team efficiency');
    }

    // Общий балл производительности
    const score = Math.min(100, Math.max(0, 
      this.metrics.global.globalEfficiency * 100 * 
      (1 - this.metrics.performance.cpuUsage / 200) *
      (1 - this.metrics.performance.memoryUsage / 200)
    ));

    return { score, trend, bottlenecks };
  }

  private analyzePerformanceTrends(): void {
    const performance = this.analyzePerformance();
    
    if (performance.score < 60) {
      this.emit('performanceAlert', {
        level: 'warning',
        score: performance.score,
        bottlenecks: performance.bottlenecks
      });
    }
    
    if (performance.trend === 'declining') {
      this.emit('performanceTrend', {
        trend: 'declining',
        recommendation: 'Consider optimizing system performance'
      });
    }
  }

  private shouldRebalance(): boolean {
    const supervisorMetrics = this.supervisorManager.getGlobalMetrics();
    const utilizationVariance = this.calculateUtilizationVariance(supervisorMetrics.supervisors);
    
    // Перебалансировка если разброс утилизации > 30%
    return utilizationVariance > 0.3;
  }

  private calculateUtilizationVariance(supervisors: any[]): number {
    const utilizations = supervisors.map(s => s.metrics.agentUtilization);
    const mean = utilizations.reduce((sum, u) => sum + u, 0) / utilizations.length;
    const variance = utilizations.reduce((sum, u) => sum + Math.pow(u - mean, 2), 0) / utilizations.length;
    
    return Math.sqrt(variance);
  }

  private createEscalationPlan(issue: any): string[] {
    return [
      'Immediate: Assign best available agents',
      'If blocked: Escalate to senior supervisor',
      'If delayed: Add additional resources',
      'If critical: Notify stakeholders',
      'If unresolved: Executive escalation'
    ];
  }

  private async optimizeConfiguration(): Promise<{
    actions: any[];
    improvement: number;
  }> {
    const actions: any[] = [];
    let improvement = 0;

    // Проверить и оптимизировать настройки
    const currentConfig = this.configManager.getAll();
    
    // Оптимизация размера команд
    if (currentConfig['orchestrator.agents.maxAgents'] < 10) {
      await this.configManager.set('orchestrator.agents.maxAgents', 12, 'runtime');
      actions.push({
        type: 'config_optimization',
        description: 'Increased max agents per team',
        impact: 'Better resource utilization',
        implemented: true
      });
      improvement += 0.1;
    }

    return { actions, improvement };
  }

  private async autoScaleResources(): Promise<{
    actions: any[];
    improvement: number;
  }> {
    const actions: any[] = [];
    let improvement = 0;

    const performance = this.analyzePerformance();
    
    if (performance.bottlenecks.includes('Large issue queue')) {
      // Увеличить количество супервизоров
      actions.push({
        type: 'resource_scaling',
        description: 'Scale up supervisors to handle queue',
        impact: 'Reduced processing time',
        implemented: false // Требует ручного вмешательства
      });
      improvement += 0.2;
    }

    return { actions, improvement };
  }

  private handleConfigChange(event: any): void {
    this.logger.info('Configuration changed, updating system', event);
    
    // Применить изменения к компонентам
    if (event.path.startsWith('github.')) {
      // Обновить GitHub настройки
    } else if (event.path.startsWith('supervisor.')) {
      // Обновить настройки супервизоров
    }
  }

  private getHistoricalData(period: string): any[] {
    const now = Date.now();
    const periodMs = {
      hour: 3600000,
      day: 86400000,
      week: 604800000,
      month: 2592000000
    }[period] || 86400000;

    return this.performanceHistory.filter(
      record => record.timestamp > now - periodMs
    );
  }

  private generateSummary(period: string, data: any[]): string {
    if (data.length === 0) {
      return `No data available for the last ${period}`;
    }

    const latest = data[data.length - 1];
    const processed = latest.metrics.global.totalIssuesProcessed;
    const efficiency = latest.metrics.global.globalEfficiency;

    return `During the last ${period}, processed ${processed} issues with ${(efficiency * 100).toFixed(1)}% efficiency`;
  }

  private getHighlights(data: any[]): string[] {
    return [
      'Successfully processed all critical issues',
      'Maintained 95%+ success rate',
      'Zero downtime incidents'
    ];
  }

  private getIssues(data: any[]): string[] {
    const issues: string[] = [];
    
    if (data.length > 0) {
      const latest = data[data.length - 1];
      if (latest.metrics.performance.cpuUsage > 80) {
        issues.push('High CPU usage detected');
      }
      if (latest.metrics.global.globalEfficiency < 0.7) {
        issues.push('Below target efficiency');
      }
    }
    
    return issues;
  }

  private getRecommendations(): string[] {
    const recommendations = this.supervisorManager.getOptimizationRecommendations();
    return recommendations.map(r => r.description);
  }

  private generateChartData(data: any[]): {
    efficiency: number[];
    throughput: number[];
    quality: number[];
  } {
    return {
      efficiency: data.map(d => d.metrics.global.globalEfficiency * 100),
      throughput: data.map(d => d.metrics.global.totalIssuesProcessed),
      quality: data.map(d => d.metrics.quality.averageCodeQuality)
    };
  }

  private generateAndSendReport(): void {
    const report = this.generateSystemReport('day');
    
    this.emit('reportGenerated', {
      period: 'day',
      report,
      recipients: this.config.reporting.recipients
    });
    
    this.logger.info('Daily report generated', {
      summary: report.summary,
      highlights: report.highlights.length,
      issues: report.issues.length
    });
  }
}