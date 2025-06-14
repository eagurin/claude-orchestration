import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import type { TaskResult } from '../types/index.js';

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  capabilities: string[];
  supervisor: string;
}

export class Agent extends EventEmitter {
  private logger: Logger;
  private config: AgentConfig;
  private available = true;
  private currentUtilization = 0;
  private successRate = 1.0;

  constructor(config: AgentConfig) {
    super();
    this.logger = new Logger(`Agent-${config.id}`);
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing agent', {
      id: this.config.id,
      role: this.config.role
    });
    this.available = true;
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping agent', { id: this.config.id });
    this.available = false;
  }

  getId(): string {
    return this.config.id;
  }

  getRole(): string {
    return this.config.role;
  }

  isAvailable(): boolean {
    return this.available;
  }

  getCurrentUtilization(): number {
    return this.currentUtilization;
  }

  getSuccessRate(): number {
    return this.successRate;
  }

  getCapabilities(): string[] {
    return this.config.capabilities;
  }

  async reviewWork(taskId: string, result: any): Promise<void> {
    this.logger.info('Reviewing work', { taskId, agentId: this.config.id });
    // Simulate review process
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}