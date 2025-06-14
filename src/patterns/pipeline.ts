import { ClaudeCodeAgent } from '../agents/claude-code-agent.js';
import type { Task, TaskResult, PipelineConfig, PatternExecutor, AgentConfig } from '../types/index.js';

interface PipelineStage {
  name: string;
  description: string;
  agent?: ClaudeCodeAgent;
}

export class PipelinePattern implements PatternExecutor {
  private agentPool: any;
  private config?: PipelineConfig;
  
  constructor(agentPool: any, config?: PipelineConfig) {
    this.agentPool = agentPool;
    this.config = config;
  }

  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    const stages = this.createPipelineStages(task);
    const stageResults: any[] = [];
    let currentInput = task.description;

    try {
      // Execute stages sequentially
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        
        // Create agent for this stage
        const agentConfig: AgentConfig = {
          maxAgents: 1,
          defaultModel: 'claude-3-5-sonnet-20241022',
          maxTokens: 100000,
          temperature: 0.7,
          spawnTimeout: 10000
        };
        
        const agent = new ClaudeCodeAgent(`pipeline-agent-${stage.name}`, agentConfig);
        await agent.start();
        stage.agent = agent;

        // Execute stage
        const stageTask = {
          ...task,
          id: `${task.id}-stage-${i + 1}`,
          description: `Stage ${i + 1} (${stage.name}): ${stage.description}\nInput: ${currentInput}`
        };

        const stageResult = await agent.execute(stageTask);
        stageResults.push({
          stage: stage.name,
          input: currentInput,
          result: stageResult,
          success: stageResult.success
        });

        // Use this stage's output as input for next stage
        if (stageResult.success && stageResult.result) {
          currentInput = `Previous stage (${stage.name}) output: ${JSON.stringify(stageResult.result)}`;
        }

        // Stop agent after stage completion
        await agent.stop();
      }

      const successfulStages = stageResults.filter(s => s.success);
      const finalOutput = stageResults.length > 0 ? 
        stageResults[stageResults.length - 1].result : 
        { message: 'No stages completed' };

      return {
        taskId: task.id,
        success: successfulStages.length === stages.length,
        result: {
          pattern: 'pipeline',
          stages: stageResults,
          finalOutput: finalOutput.result,
          completedStages: successfulStages.length,
          totalStages: stages.length,
          description: `Pipeline execution with ${stages.length} stages`
        },
        executionTime: Date.now() - startTime,
        agentsUsed: stages.map(s => s.agent?.id || 'unknown').filter(id => id !== 'unknown'),
        metadata: {
          totalStages: stages.length,
          completedStages: successfulStages.length,
          pattern: 'pipeline'
        }
      };

    } catch (error) {
      // Clean up any remaining agents
      for (const stage of stages) {
        if (stage.agent) {
          await stage.agent.stop().catch(() => {});
        }
      }
      
      return {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in pipeline execution',
        executionTime: Date.now() - startTime,
        agentsUsed: stages.map(s => s.agent?.id || 'unknown').filter(id => id !== 'unknown')
      };
    }
  }

  private createPipelineStages(_task: Task): PipelineStage[] {
    // Default pipeline stages
    return [
      {
        name: 'analyze',
        description: 'Analyze the task and understand requirements'
      },
      {
        name: 'plan',
        description: 'Create a detailed plan based on the analysis'
      },
      {
        name: 'execute',
        description: 'Execute the plan and provide the solution'
      },
      {
        name: 'validate',
        description: 'Validate the solution and provide final recommendations'
      }
    ];
  }
}