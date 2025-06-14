/**
 * Core type definitions for the Claude Orchestration system
 */

export type ExecutionPattern = 'swarm' | 'pipeline' | 'consensus' | 'mapreduce';

export interface Task {
  id: string;
  description: string;
  pattern: ExecutionPattern;
  priority?: number;
  timeout?: number;
  retryAttempts?: number;
  context?: any;
  metadata?: Record<string, any>;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  agentsUsed: string[];
  metadata?: Record<string, any>;
}

export interface AgentConfig {
  maxAgents: number;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  spawnTimeout: number;
}

export interface TaskQueueConfig {
  maxConcurrency: number;
  retryDelay: number;
  redisUrl?: string;
}

export interface MCPConfig {
  servers: string[];
  serverPath?: string;
}

export interface MemoryConfig {
  apiKey?: string;
  baseUrl?: string;
  userId?: string;
}

export interface MonitoringConfig {
  port: number;
  metricsInterval: number;
  enableTracing: boolean;
}

export interface PatternConfig {
  swarm?: SwarmConfig;
  pipeline?: PipelineConfig;
  consensus?: ConsensusConfig;
  mapreduce?: MapReduceConfig;
}

export interface SwarmConfig {
  defaultAgents: number;
  maxAgents: number;
  diversityStrategy: 'random' | 'capability' | 'experience';
}

export interface PipelineConfig {
  maxStages: number;
  stageTimeout: number;
  allowParallelStages: boolean;
}

export interface ConsensusConfig {
  minAgents: number;
  agreementThreshold: number;
  maxRounds: number;
}

export interface MapReduceConfig {
  chunkSize: number;
  maxMappers: number;
  maxReducers: number;
}

export interface OrchestratorConfig {
  agents: AgentConfig;
  taskQueue: TaskQueueConfig;
  mcp: MCPConfig;
  memory: MemoryConfig;
  monitoring: MonitoringConfig;
  patterns?: PatternConfig;
}

export interface AgentStatus {
  id: string;
  status: 'idle' | 'busy' | 'error' | 'starting' | 'stopping';
  currentTask?: string;
  model: string;
  uptime: number;
  tasksCompleted: number;
  lastError?: string;
}

export interface AgentCapability {
  type: string;
  level: number;
  description: string;
}

export interface Agent {
  id: string;
  status: AgentStatus['status'];
  capabilities: AgentCapability[];
  config: AgentConfig;
  
  start(): Promise<void>;
  stop(): Promise<void>;
  execute(task: Task): Promise<TaskResult>;
  getStatus(): AgentStatus;
}

export interface MCPServer {
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface ToolCall {
  toolName: string;
  arguments: Record<string, any>;
  agentId: string;
  timestamp: number;
}

export interface ToolResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
}

export interface PatternExecutor {
  execute(task: Task): Promise<TaskResult>;
}

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: Record<string, any>;
  timestamp: number;
  userId?: string;
}

export interface MetricsSnapshot {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  activeAgents: number;
  queueSize: number;
  uptime: number;
}