import { EnhancedSwarmPattern } from './swarm-enhanced.js';
import { ClaudeCodeAgent } from '../agents/claude-code-agent.js';
import type { Task, TaskResult, SwarmConfig, PatternExecutor, AgentConfig } from '../types/index.js';

/**
 * SwarmPattern - Orchestrates multiple agents working in parallel to explore solutions
 * 
 * The swarm pattern enables:
 * - Parallel exploration of solution space
 * - Inter-agent communication and discovery sharing
 * - Democratic consensus building through voting
 * - Role-based agent specialization
 * - Adaptive scaling based on task complexity
 */
export class SwarmPattern implements PatternExecutor {
  private enhancedPattern: EnhancedSwarmPattern;
  private agentPool: any;
  private config?: SwarmConfig;
  
  constructor(agentPool: any, config?: SwarmConfig) {
    this.agentPool = agentPool;
    this.config = config;
    
    // Use enhanced pattern if configuration enables advanced features
    const useEnhanced = config?.advanced !== false;
    
    if (useEnhanced) {
      this.enhancedPattern = new EnhancedSwarmPattern(agentPool, config);
    } else {
      // Fallback to basic implementation
      this.enhancedPattern = null as any;
    }
  }

  async execute(task: Task): Promise<TaskResult> {
    // Use enhanced pattern if available
    if (this.enhancedPattern) {
      return this.enhancedPattern.execute(task);
    }
    
    // Otherwise, use basic implementation
    return this.executeBasic(task);
  }

  /**
   * Basic swarm implementation for simpler use cases
   */
  private async executeBasic(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    const numAgents = this.config?.defaultAgents || 3;
    const agents: ClaudeCodeAgent[] = [];

    try {
      // Create and start agents
      for (let i = 0; i < numAgents; i++) {
        const agentConfig: AgentConfig = {
          maxAgents: 1,
          defaultModel: 'claude-3-5-sonnet-20241022',
          maxTokens: 100000,
          temperature: 0.7,
          spawnTimeout: 10000
        };
        
        const agent = new ClaudeCodeAgent(`swarm-agent-${i + 1}`, agentConfig);
        await agent.start();
        agents.push(agent);
      }

      // Execute task on all agents in parallel
      const promises = agents.map(async (agent, index) => {
        const agentTask = {
          ...task,
          id: `${task.id}-agent-${index + 1}`,
          description: `${task.description} (Agent ${index + 1} perspective)`
        };
        
        return agent.execute(agentTask);
      });

      const agentResults = await Promise.all(promises);
      
      // Aggregate results
      const successfulResults = agentResults.filter(r => r.success);
      const consensus = this.generateBasicConsensus(successfulResults);

      // Stop all agents
      await Promise.all(agents.map(agent => agent.stop()));

      return {
        taskId: task.id,
        success: successfulResults.length > 0,
        result: {
          pattern: 'swarm-basic',
          consensus,
          agentResults: successfulResults.map(r => r.result),
          agreementLevel: successfulResults.length / numAgents,
          description: `Basic swarm execution with ${numAgents} agents`
        },
        executionTime: Date.now() - startTime,
        agentsUsed: agents.map(a => a.id),
        metadata: {
          totalAgents: numAgents,
          successfulAgents: successfulResults.length,
          pattern: 'swarm-basic'
        }
      };

    } catch (error) {
      // Clean up agents on error
      await Promise.all(agents.map(agent => agent.stop().catch(() => {})));
      
      return {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in swarm execution',
        executionTime: Date.now() - startTime,
        agentsUsed: agents.map(a => a.id)
      };
    }
  }

  private generateBasicConsensus(results: TaskResult[]): any {
    if (results.length === 0) {
      return { message: 'No successful agent results to form consensus' };
    }

    // Simple consensus: combine all agent insights
    const insights = results.map(r => r.result);
    
    return {
      message: 'Basic swarm consensus formed from multiple agent perspectives',
      agentCount: results.length,
      combinedInsights: insights,
      confidence: results.length >= 2 ? 'high' : 'medium'
    };
  }
}

// Export configuration types for easier use
export interface SwarmOptions extends SwarmConfig {
  /**
   * Enable advanced features (default: true)
   * - Inter-agent communication
   * - Role specialization
   * - Multi-phase execution
   * - Voting and consensus mechanisms
   */
  advanced?: boolean;
  
  /**
   * Default number of agents in the swarm (default: 5 for advanced, 3 for basic)
   */
  defaultAgents?: number;
  
  /**
   * Minimum consensus level required (default: 0.7)
   */
  minConsensus?: number;
  
  /**
   * Maximum time for exploration phase in ms (default: 30000)
   */
  maxExplorationTime?: number;
  
  /**
   * Enable adaptive scaling based on task complexity (default: true)
   */
  adaptiveScaling?: boolean;
  
  /**
   * Enable role-based agent specialization (default: true)
   */
  specialization?: boolean;
  
  /**
   * Communication delay between agents in ms (default: 100)
   */
  communicationDelay?: number;
}