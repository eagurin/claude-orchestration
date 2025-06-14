import { EventEmitter } from 'events';
import { AgentPool } from './agent-pool.js';
import { TaskQueue } from './task-queue.js';
import { MCPManager } from '../mcp/server.js';
import { MemoryManager } from '../memory/mem0-client.js';
import { MetricsCollector } from '../monitoring/metrics.js';
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
  private logger: Logger;
  private isRunning = false;

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;
    this.logger = new Logger('Orchestrator');
    
    this.agentPool = new AgentPool(config.agents);
    this.taskQueue = new TaskQueue(config.taskQueue);
    this.mcpManager = new MCPManager(config.mcp);
    this.memoryManager = new MemoryManager(config.memory);
    this.metrics = new MetricsCollector(config.monitoring);
  }

  /**
   * Start the orchestrator and all its components
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running');
    }

    this.logger.info('Starting orchestrator...');

    try {
      // Start core components
      await this.mcpManager.start();
      await this.memoryManager.connect();
      await this.agentPool.initialize(this.mcpManager);
      await this.taskQueue.start();
      await this.metrics.start();

      // Set up event handlers
      this.setupEventHandlers();

      this.isRunning = true;
      this.logger.info('Orchestrator started successfully');
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
      await this.taskQueue.stop();
      await this.agentPool.shutdown();
      await this.mcpManager.stop();
      await this.memoryManager.disconnect();
      await this.metrics.stop();

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
    return {
      isRunning: this.isRunning,
      agents: this.agentPool.getStatus(),
      taskQueue: this.taskQueue.getStatus(),
      mcp: this.mcpManager.getStatus(),
      metrics: this.metrics.getSnapshot()
    };
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
  }
}

export type { OrchestratorConfig, Task, TaskResult, ExecutionPattern };