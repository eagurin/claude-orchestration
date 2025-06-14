import { EventEmitter } from 'events';
import { AgentPool } from './agent-pool.js';
import { TaskQueue } from './task-queue.js';
import { MCPManager } from '../mcp/server.js';
import { MemoryManager } from '../memory/mem0-client.js';
import { MetricsCollector } from '../monitoring/metrics.js';
import { OrchestrationDirector } from '../agents/orchestration-director.js';
import { ConfigManager } from '../settings/config-manager.js';
import { EnvironmentConfig } from '../settings/environment-config.js';
import { Logger } from '../utils/logger.js';
import type { 
  OrchestratorConfig, 
  Task, 
  TaskResult, 
  ExecutionPattern 
} from '../types/index.js';

/**
 * Main orchestrator that coordinates multiple Claude agents
 */
export class Orchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private agentPool: AgentPool;
  private taskQueue: TaskQueue;
  private mcpManager: MCPManager;
  private memoryManager: MemoryManager;
  private metrics: MetricsCollector;
  private configManager: ConfigManager;
  private orchestrationDirector?: OrchestrationDirector;
  private logger: Logger;
  private isRunning = false;
  private supervisionEnabled = false;

  constructor(config: OrchestratorConfig, configManager?: ConfigManager) {
    super();
    this.config = config;
    this.logger = new Logger('Orchestrator');
    
    this.agentPool = new AgentPool(config.agents);
    this.taskQueue = new TaskQueue(config.taskQueue);
    this.mcpManager = new MCPManager(config.mcp);
    this.memoryManager = new MemoryManager(config.memory);
    this.metrics = new MetricsCollector(config.monitoring);
    
    // Initialize configuration manager
    this.configManager = configManager || new ConfigManager('development');
    
    // Check if supervision should be enabled
    this.supervisionEnabled = this.shouldEnableSupervision();
  }

  /**
   * Start the orchestrator and all its components
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running');
    }

    this.logger.info('Starting orchestrator...', {
      supervisionEnabled: this.supervisionEnabled
    });

    try {
      // Initialize configuration system first
      await this.initializeConfiguration();
      
      // Start core components
      await this.mcpManager.start();
      await this.memoryManager.connect();
      await this.agentPool.initialize(this.mcpManager);
      await this.taskQueue.start();
      await this.metrics.start();

      // Start supervision system if enabled
      if (this.supervisionEnabled) {
        await this.startSupervisionSystem();
      }

      // Set up event handlers
      this.setupEventHandlers();

      this.isRunning = true;
      this.logger.info('Orchestrator started successfully', {
        supervisionEnabled: this.supervisionEnabled,
        components: {
          mcp: true,
          memory: true,
          agents: true,
          queue: true,
          metrics: true,
          supervision: this.supervisionEnabled
        }
      });
      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start orchestrator:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the orchestrator and clean up resources
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping orchestrator...');

    try {
      // Stop supervision system first
      if (this.orchestrationDirector) {
        await this.orchestrationDirector.stop();
      }
      
      await this.taskQueue.stop();
      await this.agentPool.shutdown();
      await this.mcpManager.stop();
      await this.memoryManager.disconnect();
      await this.metrics.stop();
      await this.configManager.dispose();

      this.isRunning = false;
      this.logger.info('Orchestrator stopped successfully');
      this.emit('stopped');
    } catch (error) {
      this.logger.error('Error stopping orchestrator:', error);
      throw error;
    }
  }

  /**
   * Execute a task using the specified pattern
   */
  async execute(task: Task): Promise<TaskResult> {
    if (!this.isRunning) {
      throw new Error('Orchestrator is not running');
    }

    const startTime = Date.now();
    this.logger.info(`Executing task: ${task.description}`, { 
      pattern: task.pattern,
      taskId: task.id 
    });

    try {
      // Add context from memory
      const context = await this.memoryManager.getRelevantContext(task.description);
      const enrichedTask = { ...task, context };

      // Route to appropriate pattern handler
      let result: TaskResult;
      switch (task.pattern) {
        case 'swarm':
          result = await this.executeSwarmPattern(enrichedTask);
          break;
        case 'pipeline':
          result = await this.executePipelinePattern(enrichedTask);
          break;
        case 'consensus':
          result = await this.executeConsensusPattern(enrichedTask);
          break;
        case 'mapreduce':
          result = await this.executeMapReducePattern(enrichedTask);
          break;
        default:
          throw new Error(`Unknown execution pattern: ${task.pattern}`);
      }

      // Store results in memory for future reference
      await this.memoryManager.storeResult(task, result);

      // Record metrics
      const duration = Date.now() - startTime;
      this.metrics.recordTaskExecution(task.pattern, duration, true);

      this.logger.info(`Task completed successfully`, {
        taskId: task.id,
        duration,
        pattern: task.pattern
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.metrics.recordTaskExecution(task.pattern, duration, false);
      
      this.logger.error(`Task execution failed`, {
        taskId: task.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration
      });

      throw error;
    }
  }

  /**
   * Get current status of the orchestrator
   */
  getStatus() {
    const baseStatus = {
      isRunning: this.isRunning,
      agents: this.agentPool.getStatus(),
      taskQueue: this.taskQueue.getStatus(),
      mcp: this.mcpManager.getStatus(),
      metrics: this.metrics.getSnapshot(),
      supervision: {
        enabled: this.supervisionEnabled,
        active: !!this.orchestrationDirector
      }
    };

    if (this.orchestrationDirector) {
      return {
        ...baseStatus,
        supervisorSystem: this.orchestrationDirector.getSystemStatus()
      };
    }

    return baseStatus;
  }

  /**
   * Process a GitHub issue through the supervision system
   */
  async processGitHubIssue(issue: any): Promise<any> {
    if (!this.orchestrationDirector) {
      throw new Error('Supervision system not enabled');
    }

    return await this.orchestrationDirector.processGitHubIssue(issue);
  }

  /**
   * Get supervision system metrics
   */
  getSupervisionMetrics(): any {
    if (!this.orchestrationDirector) {
      return null;
    }

    return this.orchestrationDirector.getSystemStatus().metrics;
  }

  /**
   * Create a crisis team for critical issues
   */
  async createCrisisTeam(issue: any): Promise<any> {
    if (!this.orchestrationDirector) {
      throw new Error('Supervision system not enabled');
    }

    return await this.orchestrationDirector.createCrisisTeam(issue);
  }

  private async executeSwarmPattern(task: Task): Promise<TaskResult> {
    const { SwarmPattern } = await import('../patterns/swarm.js');
    const pattern = new SwarmPattern(this.agentPool, this.config.patterns?.swarm);
    return pattern.execute(task);
  }

  private async executePipelinePattern(task: Task): Promise<TaskResult> {
    const { PipelinePattern } = await import('../patterns/pipeline.js');
    const pattern = new PipelinePattern(this.agentPool, this.config.patterns?.pipeline);
    return pattern.execute(task);
  }

  private async executeConsensusPattern(task: Task): Promise<TaskResult> {
    const { ConsensusPattern } = await import('../patterns/consensus.js');
    const pattern = new ConsensusPattern(this.agentPool, this.config.patterns?.consensus);
    return pattern.execute(task);
  }

  private async executeMapReducePattern(task: Task): Promise<TaskResult> {
    const { MapReducePattern } = await import('../patterns/mapreduce.js');
    const pattern = new MapReducePattern(this.agentPool, this.config.patterns?.mapreduce);
    return pattern.execute(task);
  }

  private shouldEnableSupervision(): boolean {
    // Enable supervision if we have enough agents and it's configured
    return this.config.agents?.maxAgents > 5;
  }

  private async initializeConfiguration(): Promise<void> {
    const schema = EnvironmentConfig.getCompleteSchema('development');
    await this.configManager.initialize({
      schema,
      configPaths: ['./config/orchestrator.yaml', './orchestrator.config.yaml'],
      watchFiles: true
    });

    this.logger.info('Configuration system initialized');
  }

  private async startSupervisionSystem(): Promise<void> {
    if (!this.supervisionEnabled) {
      return;
    }

    const orchestrationConfig = {
      supervisor: {
        maxSupervisors: 5,
        autoScaling: true,
        workingHours: {
          start: '09:00',
          end: '18:00',
          timezone: 'UTC'
        },
        domains: ['settings', 'security', 'monitoring', 'memory', 'orchestration'],
        balancingStrategy: 'expertise' as const
      },
      github: {
        enabled: true,
        webhookPort: 3001,
        repositories: ['claude-orchestration'],
        autoAssignment: true
      },
      performance: {
        maxConcurrentIssues: 20,
        balancingInterval: 300000, // 5 minutes
        metricsCollectionInterval: 60000 // 1 minute
      },
      reporting: {
        enabled: true,
        interval: 3600000, // 1 hour
        recipients: []
      }
    };

    this.orchestrationDirector = new OrchestrationDirector(orchestrationConfig, this.configManager);
    await this.orchestrationDirector.start();

    this.logger.info('Supervision system started successfully');
  }

  private setupEventHandlers(): void {
    this.agentPool.on('agentStarted', (agentId) => {
      this.logger.info(`Agent started: ${agentId}`);
      this.emit('agentStarted', agentId);
    });

    this.agentPool.on('agentStopped', (agentId) => {
      this.logger.info(`Agent stopped: ${agentId}`);
      this.emit('agentStopped', agentId);
    });

    this.agentPool.on('agentError', (agentId, error) => {
      this.logger.error(`Agent error: ${agentId}`, error);
      this.emit('agentError', agentId, error);
    });

    this.taskQueue.on('taskCompleted', (taskId, result) => {
      this.logger.info(`Task completed: ${taskId}`);
      this.emit('taskCompleted', taskId, result);
    });

    this.taskQueue.on('taskFailed', (taskId, error) => {
      this.logger.error(`Task failed: ${taskId}`, error);
      this.emit('taskFailed', taskId, error);
    });

    // Setup supervision system event handlers
    if (this.orchestrationDirector) {
      this.orchestrationDirector.on('urgentIssueProcessed', (event) => {
        this.logger.warn('Urgent issue processed by supervision system', event);
        this.emit('urgentIssue', event);
      });

      this.orchestrationDirector.on('crisisTeamCreated', (event) => {
        this.logger.error('Crisis team created for critical issue', event);
        this.emit('crisisTeam', event);
      });

      this.orchestrationDirector.on('performanceAlert', (event) => {
        this.logger.warn('Performance alert from supervision system', event);
        this.emit('performanceAlert', event);
      });
    }
  }
}

export type { OrchestratorConfig, Task, TaskResult, ExecutionPattern };