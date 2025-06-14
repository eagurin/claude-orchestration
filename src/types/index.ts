/**
 * Core type definitions for the Claude Orchestration system
 */

export type ExecutionPattern = 'swarm' | 'pipeline' | 'consensus' | 'mapreduce' | 'collaborative' | 'evaluation' | 'proposal' | 'vote' | 'execution' | 'validation';

export interface Task {
  id: string;
  description: string;
  pattern: ExecutionPattern;
  priority?: number | 'critical' | 'high' | 'normal' | 'low';
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
  qualityScore?: number;
  metadata?: Record<string, any>;
}

export interface AgentConfig {
  maxAgents: number;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  spawnTimeout: number;
  capabilities?: string[];
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
  defaultAgents?: number;
  maxAgents?: number;
  diversityStrategy?: 'random' | 'capability' | 'experience';
  advanced?: boolean;
  minConsensus?: number;
  maxExplorationTime?: number;
  adaptiveScaling?: boolean;
  specialization?: boolean;
  communicationDelay?: number;
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

// Supervisor System Types
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

export interface OrchestrationDirectorConfig {
  supervisor: SupervisorManagerConfig;
  github: {
    enabled: boolean;
    webhookPort: number;
    repositories: string[];
    autoAssignment: boolean;
  };
  performance: {
    maxConcurrentIssues: number;
    balancingInterval: number;
    metricsCollectionInterval: number;
  };
  reporting: {
    enabled: boolean;
    interval: number;
    recipients: string[];
  };
}

// GitHub Integration Types
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

// Enhanced Swarm Types
export interface SwarmAgent {
  agent: any; // ClaudeCodeAgent
  id: string;
  role: string;
  performance: AgentPerformance;
}

export interface AgentPerformance {
  tasksCompleted: number;
  successRate: number;
  averageTime: number;
  lastTaskTime?: number;
  specialties: Map<string, number>;
}

export interface SwarmState {
  phase: 'exploration' | 'coordination' | 'consensus' | 'execution';
  discoveries: Map<string, any>;
  consensusData: ConsensusData;
  finalPlan?: ExecutionPlan;
}

export interface ConsensusData {
  proposals: Map<string, Proposal>;
  votes: Map<string, Vote[]>;
  agreements: Agreement[];
}

export interface Proposal {
  id: string;
  agentId: string;
  content: any;
  confidence: number;
  timestamp: number;
}

export interface Vote {
  agentId: string;
  proposalId: string;
  support: boolean;
  confidence: number;
  reasoning?: string;
}

export interface Agreement {
  proposalId: string;
  supportLevel: number;
  content: any;
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  assignments: Map<string, string[]>; // agentId -> stepIds
  dependencies: Map<string, string[]>; // stepId -> dependencyIds
}

export interface ExecutionStep {
  id: string;
  description: string;
  assignedAgent?: string;
  dependencies: string[];
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  result?: any;
}