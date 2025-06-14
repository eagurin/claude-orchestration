import { ClaudeCodeAgent } from '../agents/claude-code-agent.js';
import type { Task, TaskResult, SwarmConfig, PatternExecutor, AgentConfig } from '../types/index.js';

export class SwarmPattern implements PatternExecutor {
  private agentPool: any;
  private config?: SwarmConfig;
  
  constructor(agentPool: any, config?: SwarmConfig) {
    this.agentPool = agentPool;
    this.config = config;
  }

  async execute(task: Task): Promise<TaskResult> {
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
      const consensus = this.generateConsensus(successfulResults);

      // Stop all agents
      await Promise.all(agents.map(agent => agent.stop()));

      return {
        taskId: task.id,
        success: successfulResults.length > 0,
        result: {
          pattern: 'swarm',
          consensus,
          agentResults: successfulResults.map(r => r.result),
          agreementLevel: successfulResults.length / numAgents,
          description: `Swarm execution with ${numAgents} agents`
        },
        executionTime: Date.now() - startTime,
        agentsUsed: agents.map(a => a.id),
        metadata: {
          totalAgents: numAgents,
          successfulAgents: successfulResults.length,
          pattern: 'swarm'
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

  private generateConsensus(results: TaskResult[]): any {
    if (results.length === 0) {
      return { message: 'No successful agent results to form consensus' };
    }

    // Simple consensus: combine all agent insights
    const insights = results.map(r => r.result);
    
    return {
      message: 'Swarm consensus formed from multiple agent perspectives',
      agentCount: results.length,
      combinedInsights: insights,
      confidence: results.length >= 2 ? 'high' : 'medium'
    };
  }
}