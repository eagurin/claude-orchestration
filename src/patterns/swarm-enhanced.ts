import { EventEmitter } from 'events';
import { ClaudeCodeAgent } from '../agents/claude-code-agent.js';
import { Logger } from '../utils/logger.js';
import type { 
  Task, 
  TaskResult, 
  SwarmConfig, 
  PatternExecutor, 
  AgentConfig 
} from '../types/index.js';

interface SwarmAgent {
  agent: ClaudeCodeAgent;
  id: string;
  role: string;
  performance: AgentPerformance;
}

interface AgentPerformance {
  tasksCompleted: number;
  successRate: number;
  averageTime: number;
  lastTaskTime?: number;
  specialties: Map<string, number>;
}

interface SwarmState {
  phase: 'exploration' | 'coordination' | 'consensus' | 'execution';
  discoveries: Map<string, any>;
  consensusData: ConsensusData;
  finalPlan?: ExecutionPlan;
}

interface ConsensusData {
  proposals: Map<string, Proposal>;
  votes: Map<string, Vote[]>;
  agreements: Agreement[];
}

interface Proposal {
  id: string;
  agentId: string;
  content: any;
  confidence: number;
  timestamp: number;
}

interface Vote {
  agentId: string;
  proposalId: string;
  support: boolean;
  confidence: number;
  reasoning?: string;
}

interface Agreement {
  proposalId: string;
  supportLevel: number;
  content: any;
}

interface ExecutionPlan {
  steps: ExecutionStep[];
  assignments: Map<string, string[]>; // agentId -> stepIds
  dependencies: Map<string, string[]>; // stepId -> dependencyIds
}

interface ExecutionStep {
  id: string;
  description: string;
  assignedAgent?: string;
  dependencies: string[];
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  result?: any;
}

export class EnhancedSwarmPattern extends EventEmitter implements PatternExecutor {
  private agentPool: any;
  private config: SwarmConfig;
  private logger: Logger;
  private swarmAgents: Map<string, SwarmAgent> = new Map();
  private state: SwarmState;
  private communicationChannel: EventEmitter;

  constructor(agentPool: any, config?: SwarmConfig) {
    super();
    this.agentPool = agentPool;
    this.config = {
      defaultAgents: 5,
      minConsensus: 0.7,
      maxExplorationTime: 30000,
      communicationDelay: 100,
      adaptiveScaling: true,
      specialization: true,
      ...config
    };
    this.logger = new Logger('EnhancedSwarmPattern');
    this.communicationChannel = new EventEmitter();
    this.state = this.initializeState();
  }

  private initializeState(): SwarmState {
    return {
      phase: 'exploration',
      discoveries: new Map(),
      consensusData: {
        proposals: new Map(),
        votes: new Map(),
        agreements: []
      }
    };
  }

  async execute(task: Task): Promise<TaskResult> {
    const startTime = Date.now();
    this.logger.info(`Starting enhanced swarm execution for task: ${task.id}`);

    try {
      // Phase 1: Initialize swarm
      await this.initializeSwarm(task);

      // Phase 2: Exploration phase
      this.state.phase = 'exploration';
      const explorationResults = await this.explorationPhase(task);

      // Phase 3: Coordination phase
      this.state.phase = 'coordination';
      await this.coordinationPhase(explorationResults);

      // Phase 4: Consensus building
      this.state.phase = 'consensus';
      const consensus = await this.consensusPhase();

      // Phase 5: Execution phase
      this.state.phase = 'execution';
      const executionResult = await this.executionPhase(consensus);

      // Clean up
      await this.cleanupSwarm();

      return {
        taskId: task.id,
        success: true,
        result: {
          pattern: 'enhanced-swarm',
          consensus: consensus,
          execution: executionResult,
          discoveries: Array.from(this.state.discoveries.entries()),
          performance: this.getSwarmPerformance()
        },
        executionTime: Date.now() - startTime,
        agentsUsed: Array.from(this.swarmAgents.keys()),
        metadata: {
          totalAgents: this.swarmAgents.size,
          phases: ['exploration', 'coordination', 'consensus', 'execution'],
          consensusLevel: this.calculateConsensusLevel(),
          pattern: 'enhanced-swarm'
        }
      };

    } catch (error) {
      this.logger.error('Swarm execution failed:', error);
      await this.emergencyCleanup();
      
      return {
        taskId: task.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error in enhanced swarm execution',
        executionTime: Date.now() - startTime,
        agentsUsed: Array.from(this.swarmAgents.keys())
      };
    }
  }

  private async initializeSwarm(task: Task): Promise<void> {
    const numAgents = await this.determineOptimalAgentCount(task);
    this.logger.info(`Initializing swarm with ${numAgents} agents`);

    const agentPromises = [];
    for (let i = 0; i < numAgents; i++) {
      agentPromises.push(this.createSwarmAgent(i, task));
    }

    await Promise.all(agentPromises);
    this.setupCommunicationChannels();
  }

  private async determineOptimalAgentCount(task: Task): Promise<number> {
    // Analyze task complexity to determine optimal agent count
    const complexity = this.analyzeTaskComplexity(task);
    const baseCount = this.config.defaultAgents || 3;
    
    if (!this.config.adaptiveScaling) {
      return baseCount;
    }

    // Scale based on complexity
    if (complexity.score > 0.8) return Math.min(10, baseCount * 2);
    if (complexity.score > 0.6) return Math.min(7, Math.ceil(baseCount * 1.5));
    if (complexity.score < 0.3) return Math.max(2, Math.floor(baseCount * 0.7));
    
    return baseCount;
  }

  private analyzeTaskComplexity(task: Task): { score: number; factors: string[] } {
    const factors: string[] = [];
    let score = 0.5; // Base complexity

    // Analyze description length
    if (task.description.length > 500) {
      score += 0.1;
      factors.push('long-description');
    }

    // Check for multiple requirements
    const requirementPatterns = /(?:and|also|additionally|furthermore|moreover)/gi;
    const matches = task.description.match(requirementPatterns);
    if (matches && matches.length > 2) {
      score += 0.15;
      factors.push('multiple-requirements');
    }

    // Check for technical complexity keywords
    const complexityKeywords = /(?:optimize|refactor|architecture|performance|security|scale|distributed)/gi;
    if (complexityKeywords.test(task.description)) {
      score += 0.2;
      factors.push('technical-complexity');
    }

    // Check priority
    if (task.priority === 'critical' || task.priority === 'high') {
      score += 0.1;
      factors.push('high-priority');
    }

    return { score: Math.min(1, score), factors };
  }

  private async createSwarmAgent(index: number, task: Task): Promise<void> {
    const role = this.assignAgentRole(index, task);
    const agentId = `swarm-${role}-${index + 1}`;
    
    const agentConfig: AgentConfig = {
      maxAgents: 1,
      defaultModel: 'claude-3-5-sonnet-20241022',
      maxTokens: 100000,
      temperature: this.getTemperatureForRole(role),
      spawnTimeout: 15000,
      capabilities: this.getCapabilitiesForRole(role)
    };

    const agent = new ClaudeCodeAgent(agentId, agentConfig);
    await agent.start();

    const swarmAgent: SwarmAgent = {
      agent,
      id: agentId,
      role,
      performance: {
        tasksCompleted: 0,
        successRate: 1.0,
        averageTime: 0,
        specialties: new Map()
      }
    };

    this.swarmAgents.set(agentId, swarmAgent);
    this.logger.info(`Created agent ${agentId} with role: ${role}`);
  }

  private assignAgentRole(index: number, task: Task): string {
    if (!this.config.specialization) {
      return 'generalist';
    }

    const roles = ['explorer', 'analyzer', 'validator', 'synthesizer', 'executor'];
    const taskKeywords = task.description.toLowerCase();

    // Assign roles based on task content
    if (taskKeywords.includes('security') || taskKeywords.includes('vulnerability')) {
      if (index === 0) return 'security-analyst';
    }
    if (taskKeywords.includes('performance') || taskKeywords.includes('optimize')) {
      if (index === 1) return 'performance-engineer';
    }
    if (taskKeywords.includes('test') || taskKeywords.includes('quality')) {
      if (index === 2) return 'quality-analyst';
    }

    return roles[index % roles.length];
  }

  private getTemperatureForRole(role: string): number {
    const temperatureMap: Record<string, number> = {
      'explorer': 0.8,
      'analyzer': 0.5,
      'validator': 0.3,
      'synthesizer': 0.6,
      'executor': 0.4,
      'security-analyst': 0.3,
      'performance-engineer': 0.4,
      'quality-analyst': 0.3,
      'generalist': 0.7
    };

    return temperatureMap[role] || 0.7;
  }

  private getCapabilitiesForRole(role: string): string[] {
    const baseCapabilities = ['file-operations', 'code-analysis', 'mcp-tools'];
    
    const roleCapabilities: Record<string, string[]> = {
      'explorer': [...baseCapabilities, 'web-search', 'discovery'],
      'analyzer': [...baseCapabilities, 'deep-analysis', 'pattern-recognition'],
      'validator': [...baseCapabilities, 'testing', 'verification'],
      'synthesizer': [...baseCapabilities, 'integration', 'summary'],
      'executor': [...baseCapabilities, 'implementation', 'deployment'],
      'security-analyst': [...baseCapabilities, 'security-scan', 'vulnerability-check'],
      'performance-engineer': [...baseCapabilities, 'profiling', 'optimization'],
      'quality-analyst': [...baseCapabilities, 'testing', 'code-review']
    };

    return roleCapabilities[role] || baseCapabilities;
  }

  private setupCommunicationChannels(): void {
    // Set up inter-agent communication
    this.swarmAgents.forEach((swarmAgent, agentId) => {
      // Agent can broadcast discoveries
      swarmAgent.agent.on('discovery', (data: any) => {
        this.handleAgentDiscovery(agentId, data);
      });

      // Agent can make proposals
      swarmAgent.agent.on('proposal', (proposal: any) => {
        this.handleAgentProposal(agentId, proposal);
      });

      // Agent can vote on proposals
      swarmAgent.agent.on('vote', (vote: Vote) => {
        this.handleAgentVote(agentId, vote);
      });
    });

    // Set up broadcast mechanism
    this.communicationChannel.on('broadcast', (message: any) => {
      this.broadcastToAgents(message);
    });
  }

  private async explorationPhase(task: Task): Promise<Map<string, any>> {
    this.logger.info('Starting exploration phase');
    const explorationResults = new Map<string, any>();
    const explorationTasks: Promise<any>[] = [];

    this.swarmAgents.forEach((swarmAgent, agentId) => {
      const agentTask = {
        ...task,
        id: `${task.id}-explore-${agentId}`,
        description: this.createExplorationPrompt(task, swarmAgent.role),
        metadata: {
          phase: 'exploration',
          role: swarmAgent.role
        }
      };

      const explorationPromise = swarmAgent.agent.execute(agentTask)
        .then(result => {
          explorationResults.set(agentId, result);
          this.updateAgentPerformance(swarmAgent, result);
          return result;
        })
        .catch(error => {
          this.logger.error(`Agent ${agentId} exploration failed:`, error);
          return null;
        });

      explorationTasks.push(explorationPromise);
    });

    // Wait for exploration with timeout
    await Promise.race([
      Promise.all(explorationTasks),
      new Promise(resolve => setTimeout(resolve, this.config.maxExplorationTime || 30000))
    ]);

    return explorationResults;
  }

  private createExplorationPrompt(task: Task, role: string): string {
    const basePrompt = task.description;
    
    const rolePrompts: Record<string, string> = {
      'explorer': `Explore different approaches to: ${basePrompt}. Be creative and consider unconventional solutions.`,
      'analyzer': `Analyze the requirements and constraints for: ${basePrompt}. Identify key challenges and dependencies.`,
      'validator': `Identify potential issues and validation criteria for: ${basePrompt}. Consider edge cases and failure modes.`,
      'synthesizer': `Consider how to integrate different aspects of: ${basePrompt}. Look for patterns and connections.`,
      'executor': `Plan the implementation approach for: ${basePrompt}. Focus on practical execution steps.`,
      'security-analyst': `Analyze security implications of: ${basePrompt}. Identify vulnerabilities and protection measures.`,
      'performance-engineer': `Evaluate performance aspects of: ${basePrompt}. Consider optimization opportunities.`,
      'quality-analyst': `Assess quality requirements for: ${basePrompt}. Define testing strategies and success criteria.`
    };

    return rolePrompts[role] || basePrompt;
  }

  private async coordinationPhase(explorationResults: Map<string, any>): Promise<void> {
    this.logger.info('Starting coordination phase');

    // Share exploration results among agents
    for (const [agentId, result] of explorationResults) {
      if (result && result.success) {
        this.state.discoveries.set(agentId, result.result);
        
        // Broadcast discovery to other agents
        await this.broadcastDiscovery(agentId, result.result);
      }
    }

    // Allow agents to process shared discoveries
    await this.processSharedDiscoveries();

    // Collect proposals from agents
    await this.collectProposals();
  }

  private async broadcastDiscovery(sourceAgentId: string, discovery: any): Promise<void> {
    const message = {
      type: 'discovery',
      source: sourceAgentId,
      content: discovery,
      timestamp: Date.now()
    };

    // Simulate communication delay
    await new Promise(resolve => setTimeout(resolve, this.config.communicationDelay || 100));

    this.swarmAgents.forEach((swarmAgent, agentId) => {
      if (agentId !== sourceAgentId) {
        // Each agent processes the discovery
        this.processDiscoveryForAgent(swarmAgent, message);
      }
    });
  }

  private async processDiscoveryForAgent(swarmAgent: SwarmAgent, message: any): Promise<void> {
    // Agent evaluates the discovery and may generate insights or proposals
    const evaluationTask = {
      id: `eval-${message.source}-${swarmAgent.id}`,
      description: `Evaluate this discovery from ${message.source}: ${JSON.stringify(message.content)}`,
      priority: 'normal' as const,
      pattern: 'evaluation',
      metadata: {
        phase: 'coordination',
        messageType: message.type
      }
    };

    try {
      const evaluation = await swarmAgent.agent.execute(evaluationTask);
      if (evaluation.success && evaluation.result) {
        // Agent might generate a proposal based on the discovery
        this.handleAgentInsight(swarmAgent.id, evaluation.result);
      }
    } catch (error) {
      this.logger.error(`Agent ${swarmAgent.id} failed to process discovery:`, error);
    }
  }

  private async processSharedDiscoveries(): Promise<void> {
    this.logger.info('Processing shared discoveries across swarm');
    
    // Give agents time to process and respond to discoveries
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private async collectProposals(): Promise<void> {
    this.logger.info('Collecting proposals from agents');
    
    const proposalPromises: Promise<void>[] = [];

    this.swarmAgents.forEach((swarmAgent) => {
      const proposalPromise = this.requestProposal(swarmAgent);
      proposalPromises.push(proposalPromise);
    });

    await Promise.all(proposalPromises);
  }

  private async requestProposal(swarmAgent: SwarmAgent): Promise<void> {
    const discoveries = Array.from(this.state.discoveries.entries());
    
    const proposalTask = {
      id: `proposal-${swarmAgent.id}`,
      description: `Based on all discoveries, propose a solution approach. Consider: ${JSON.stringify(discoveries)}`,
      priority: 'high' as const,
      pattern: 'proposal',
      metadata: {
        phase: 'coordination',
        role: swarmAgent.role
      }
    };

    try {
      const result = await swarmAgent.agent.execute(proposalTask);
      if (result.success && result.result) {
        const proposal: Proposal = {
          id: `prop-${swarmAgent.id}-${Date.now()}`,
          agentId: swarmAgent.id,
          content: result.result,
          confidence: this.calculateProposalConfidence(result),
          timestamp: Date.now()
        };

        this.state.consensusData.proposals.set(proposal.id, proposal);
        this.logger.info(`Collected proposal from ${swarmAgent.id}`);
      }
    } catch (error) {
      this.logger.error(`Failed to collect proposal from ${swarmAgent.id}:`, error);
    }
  }

  private calculateProposalConfidence(result: TaskResult): number {
    // Base confidence on various factors
    let confidence = 0.5;

    if (result.metadata?.confidence) {
      confidence = result.metadata.confidence;
    } else {
      // Calculate based on execution time, result complexity, etc.
      if (result.executionTime && result.executionTime < 5000) {
        confidence += 0.1; // Quick response suggests clarity
      }
      if (result.result && typeof result.result === 'object') {
        const keys = Object.keys(result.result);
        if (keys.length > 3) {
          confidence += 0.2; // Detailed response
        }
      }
    }

    return Math.min(1, Math.max(0, confidence));
  }

  private async consensusPhase(): Promise<any> {
    this.logger.info('Starting consensus phase');

    // Each agent votes on all proposals
    await this.conductVoting();

    // Tally votes and determine agreements
    this.tallyVotes();

    // Build final consensus
    return this.buildConsensus();
  }

  private async conductVoting(): Promise<void> {
    const proposals = Array.from(this.state.consensusData.proposals.values());
    const votingPromises: Promise<void>[] = [];

    this.swarmAgents.forEach((swarmAgent) => {
      proposals.forEach((proposal) => {
        if (proposal.agentId !== swarmAgent.id) {
          // Agents don't vote on their own proposals
          votingPromises.push(this.requestVote(swarmAgent, proposal));
        }
      });
    });

    await Promise.all(votingPromises);
  }

  private async requestVote(swarmAgent: SwarmAgent, proposal: Proposal): Promise<void> {
    const voteTask = {
      id: `vote-${swarmAgent.id}-${proposal.id}`,
      description: `Evaluate this proposal and vote: ${JSON.stringify(proposal.content)}. Consider feasibility, effectiveness, and alignment with requirements.`,
      priority: 'high' as const,
      pattern: 'vote',
      metadata: {
        phase: 'consensus',
        proposalId: proposal.id
      }
    };

    try {
      const result = await swarmAgent.agent.execute(voteTask);
      if (result.success && result.result) {
        const vote: Vote = {
          agentId: swarmAgent.id,
          proposalId: proposal.id,
          support: result.result.support ?? false,
          confidence: result.result.confidence ?? 0.5,
          reasoning: result.result.reasoning
        };

        if (!this.state.consensusData.votes.has(proposal.id)) {
          this.state.consensusData.votes.set(proposal.id, []);
        }
        this.state.consensusData.votes.get(proposal.id)!.push(vote);
      }
    } catch (error) {
      this.logger.error(`Agent ${swarmAgent.id} failed to vote on proposal ${proposal.id}:`, error);
    }
  }

  private tallyVotes(): void {
    this.logger.info('Tallying votes for consensus');

    for (const [proposalId, votes] of this.state.consensusData.votes) {
      const proposal = this.state.consensusData.proposals.get(proposalId);
      if (!proposal) continue;

      const supportVotes = votes.filter(v => v.support);
      const totalVotes = votes.length;
      const supportLevel = totalVotes > 0 ? supportVotes.length / totalVotes : 0;

      if (supportLevel >= (this.config.minConsensus || 0.7)) {
        const agreement: Agreement = {
          proposalId,
          supportLevel,
          content: proposal.content
        };
        this.state.consensusData.agreements.push(agreement);
        this.logger.info(`Proposal ${proposalId} achieved consensus with ${(supportLevel * 100).toFixed(1)}% support`);
      }
    }
  }

  private buildConsensus(): any {
    const agreements = this.state.consensusData.agreements;
    
    if (agreements.length === 0) {
      return {
        status: 'no-consensus',
        message: 'No proposals achieved the required consensus level',
        proposals: Array.from(this.state.consensusData.proposals.values()),
        minConsensusRequired: this.config.minConsensus || 0.7
      };
    }

    // Sort agreements by support level
    agreements.sort((a, b) => b.supportLevel - a.supportLevel);

    return {
      status: 'consensus-achieved',
      primaryAgreement: agreements[0],
      allAgreements: agreements,
      consensusLevel: this.calculateConsensusLevel(),
      participatingAgents: this.swarmAgents.size,
      votingDetails: this.getVotingDetails()
    };
  }

  private calculateConsensusLevel(): number {
    const agreements = this.state.consensusData.agreements;
    if (agreements.length === 0) return 0;

    const totalSupport = agreements.reduce((sum, agreement) => sum + agreement.supportLevel, 0);
    return totalSupport / agreements.length;
  }

  private getVotingDetails(): any {
    const details: any = {
      totalProposals: this.state.consensusData.proposals.size,
      totalVotes: 0,
      averageConfidence: 0
    };

    let totalConfidence = 0;
    for (const votes of this.state.consensusData.votes.values()) {
      details.totalVotes += votes.length;
      totalConfidence += votes.reduce((sum, vote) => sum + vote.confidence, 0);
    }

    if (details.totalVotes > 0) {
      details.averageConfidence = totalConfidence / details.totalVotes;
    }

    return details;
  }

  private async executionPhase(consensus: any): Promise<any> {
    this.logger.info('Starting execution phase');

    if (consensus.status === 'no-consensus') {
      return this.handleNoConsensus();
    }

    // Create execution plan from consensus
    const executionPlan = this.createExecutionPlan(consensus);
    this.state.finalPlan = executionPlan;

    // Assign tasks to agents based on their specialties and performance
    this.assignExecutionTasks(executionPlan);

    // Execute the plan
    const executionResult = await this.executePlan(executionPlan);

    // Validate results
    const validation = await this.validateExecution(executionResult);

    return {
      plan: executionPlan,
      execution: executionResult,
      validation: validation,
      success: validation.passed
    };
  }

  private handleNoConsensus(): any {
    // Fallback strategy when no consensus is reached
    this.logger.warn('No consensus achieved, using fallback strategy');

    // Use the highest confidence proposal
    const proposals = Array.from(this.state.consensusData.proposals.values());
    proposals.sort((a, b) => b.confidence - a.confidence);

    if (proposals.length > 0) {
      return {
        status: 'fallback',
        message: 'Using highest confidence proposal due to lack of consensus',
        selectedProposal: proposals[0],
        confidence: proposals[0].confidence
      };
    }

    return {
      status: 'failed',
      message: 'No viable proposals generated by the swarm'
    };
  }

  private createExecutionPlan(consensus: any): ExecutionPlan {
    const plan: ExecutionPlan = {
      steps: [],
      assignments: new Map(),
      dependencies: new Map()
    };

    // Convert consensus agreement into actionable steps
    const primaryContent = consensus.primaryAgreement.content;
    
    // This is a simplified version - in practice, you'd parse the content more intelligently
    const steps = this.parseExecutionSteps(primaryContent);
    
    steps.forEach((step, index) => {
      const stepId = `step-${index + 1}`;
      const executionStep: ExecutionStep = {
        id: stepId,
        description: step,
        dependencies: index > 0 ? [`step-${index}`] : [],
        status: 'pending'
      };
      plan.steps.push(executionStep);
      plan.dependencies.set(stepId, executionStep.dependencies);
    });

    return plan;
  }

  private parseExecutionSteps(content: any): string[] {
    // Extract actionable steps from consensus content
    if (typeof content === 'string') {
      // Simple split by sentences or bullet points
      return content.split(/[.!?]\s+/).filter(s => s.length > 0);
    } else if (Array.isArray(content)) {
      return content.map(item => String(item));
    } else if (typeof content === 'object' && content.steps) {
      return content.steps;
    }

    // Fallback
    return ['Execute the agreed upon solution'];
  }

  private assignExecutionTasks(plan: ExecutionPlan): void {
    // Assign steps to agents based on their performance and specialties
    const availableAgents = Array.from(this.swarmAgents.values())
      .sort((a, b) => b.performance.successRate - a.performance.successRate);

    plan.steps.forEach((step, index) => {
      const agent = availableAgents[index % availableAgents.length];
      step.assignedAgent = agent.id;
      
      if (!plan.assignments.has(agent.id)) {
        plan.assignments.set(agent.id, []);
      }
      plan.assignments.get(agent.id)!.push(step.id);
    });
  }

  private async executePlan(plan: ExecutionPlan): Promise<any> {
    const results = new Map<string, any>();
    const pendingSteps = new Set(plan.steps.map(s => s.id));
    const completedSteps = new Set<string>();

    while (pendingSteps.size > 0) {
      // Find steps that can be executed (dependencies satisfied)
      const executableSteps = plan.steps.filter(step => 
        pendingSteps.has(step.id) &&
        step.dependencies.every(dep => completedSteps.has(dep))
      );

      if (executableSteps.length === 0) {
        this.logger.error('Deadlock detected in execution plan');
        break;
      }

      // Execute steps in parallel
      const executionPromises = executableSteps.map(step => 
        this.executeStep(step, plan)
      );

      const stepResults = await Promise.all(executionPromises);

      // Update results and status
      stepResults.forEach((result, index) => {
        const step = executableSteps[index];
        results.set(step.id, result);
        step.status = result.success ? 'completed' : 'failed';
        step.result = result;
        
        pendingSteps.delete(step.id);
        if (result.success) {
          completedSteps.add(step.id);
        }
      });
    }

    return {
      completedSteps: completedSteps.size,
      totalSteps: plan.steps.length,
      results: Object.fromEntries(results),
      success: completedSteps.size === plan.steps.length
    };
  }

  private async executeStep(step: ExecutionStep, plan: ExecutionPlan): Promise<any> {
    if (!step.assignedAgent) {
      return { success: false, error: 'No agent assigned to step' };
    }

    const swarmAgent = this.swarmAgents.get(step.assignedAgent);
    if (!swarmAgent) {
      return { success: false, error: 'Assigned agent not found' };
    }

    const executionTask = {
      id: `exec-${step.id}`,
      description: step.description,
      priority: 'high' as const,
      pattern: 'execution',
      metadata: {
        phase: 'execution',
        stepId: step.id,
        dependencies: step.dependencies
      }
    };

    try {
      step.status = 'in-progress';
      const result = await swarmAgent.agent.execute(executionTask);
      this.updateAgentPerformance(swarmAgent, result);
      return result;
    } catch (error) {
      this.logger.error(`Step ${step.id} execution failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async validateExecution(executionResult: any): Promise<any> {
    // Select validator agents (preferably those with 'validator' role)
    const validators = Array.from(this.swarmAgents.values())
      .filter(agent => agent.role.includes('validator') || agent.role === 'quality-analyst')
      .slice(0, 2); // Use top 2 validators

    if (validators.length === 0) {
      // Use any available agents
      validators.push(...Array.from(this.swarmAgents.values()).slice(0, 2));
    }

    const validationPromises = validators.map(validator =>
      this.performValidation(validator, executionResult)
    );

    const validationResults = await Promise.all(validationPromises);
    
    const passedValidations = validationResults.filter(v => v.passed).length;
    const totalValidations = validationResults.length;

    return {
      passed: passedValidations === totalValidations,
      validators: validators.map(v => v.id),
      results: validationResults,
      consensus: passedValidations / totalValidations
    };
  }

  private async performValidation(validator: SwarmAgent, executionResult: any): Promise<any> {
    const validationTask = {
      id: `validate-${validator.id}`,
      description: `Validate the execution results: ${JSON.stringify(executionResult)}. Check for completeness, correctness, and quality.`,
      priority: 'high' as const,
      pattern: 'validation',
      metadata: {
        phase: 'validation',
        role: validator.role
      }
    };

    try {
      const result = await validator.agent.execute(validationTask);
      return {
        validatorId: validator.id,
        passed: result.success && result.result?.valid,
        feedback: result.result?.feedback,
        confidence: result.result?.confidence || 0.5
      };
    } catch (error) {
      this.logger.error(`Validation by ${validator.id} failed:`, error);
      return {
        validatorId: validator.id,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private updateAgentPerformance(swarmAgent: SwarmAgent, result: TaskResult): void {
    const performance = swarmAgent.performance;
    
    performance.tasksCompleted++;
    
    // Update success rate
    const previousTotal = (performance.tasksCompleted - 1) * performance.successRate;
    const newTotal = previousTotal + (result.success ? 1 : 0);
    performance.successRate = newTotal / performance.tasksCompleted;
    
    // Update average time
    if (result.executionTime) {
      const previousTimeTotal = (performance.tasksCompleted - 1) * performance.averageTime;
      const newTimeTotal = previousTimeTotal + result.executionTime;
      performance.averageTime = newTimeTotal / performance.tasksCompleted;
      performance.lastTaskTime = result.executionTime;
    }
    
    // Update specialties based on task metadata
    if (result.metadata?.taskType) {
      const specialty = result.metadata.taskType;
      const currentScore = performance.specialties.get(specialty) || 0;
      performance.specialties.set(specialty, currentScore + (result.success ? 1 : -0.5));
    }
  }

  private getSwarmPerformance(): any {
    const performances = Array.from(this.swarmAgents.values()).map(agent => ({
      agentId: agent.id,
      role: agent.role,
      performance: agent.performance
    }));

    const totalTasks = performances.reduce((sum, p) => sum + p.performance.tasksCompleted, 0);
    const avgSuccessRate = performances.reduce((sum, p) => sum + p.performance.successRate, 0) / performances.length;
    const avgResponseTime = performances.reduce((sum, p) => sum + p.performance.averageTime, 0) / performances.length;

    return {
      agents: performances,
      summary: {
        totalAgents: this.swarmAgents.size,
        totalTasksCompleted: totalTasks,
        averageSuccessRate: avgSuccessRate,
        averageResponseTime: avgResponseTime,
        phases: ['exploration', 'coordination', 'consensus', 'execution', 'validation']
      }
    };
  }

  private broadcastToAgents(message: any): void {
    this.swarmAgents.forEach(swarmAgent => {
      // In a real implementation, this would send the message to the agent
      swarmAgent.agent.emit('message', message);
    });
  }

  private handleAgentDiscovery(agentId: string, discovery: any): void {
    this.logger.info(`Agent ${agentId} made a discovery`);
    this.state.discoveries.set(`${agentId}-${Date.now()}`, discovery);
    
    // Broadcast to other agents
    this.communicationChannel.emit('broadcast', {
      type: 'discovery',
      source: agentId,
      content: discovery
    });
  }

  private handleAgentProposal(agentId: string, proposalContent: any): void {
    const proposal: Proposal = {
      id: `prop-${agentId}-${Date.now()}`,
      agentId,
      content: proposalContent,
      confidence: proposalContent.confidence || 0.5,
      timestamp: Date.now()
    };
    
    this.state.consensusData.proposals.set(proposal.id, proposal);
    this.logger.info(`Agent ${agentId} submitted a proposal`);
  }

  private handleAgentVote(agentId: string, vote: Vote): void {
    if (!this.state.consensusData.votes.has(vote.proposalId)) {
      this.state.consensusData.votes.set(vote.proposalId, []);
    }
    
    this.state.consensusData.votes.get(vote.proposalId)!.push({
      ...vote,
      agentId
    });
    
    this.logger.info(`Agent ${agentId} voted on proposal ${vote.proposalId}`);
  }

  private handleAgentInsight(agentId: string, insight: any): void {
    // Store insights that might lead to new proposals
    const insightKey = `insight-${agentId}-${Date.now()}`;
    this.state.discoveries.set(insightKey, {
      type: 'insight',
      source: agentId,
      content: insight,
      timestamp: Date.now()
    });
  }

  private async cleanupSwarm(): Promise<void> {
    this.logger.info('Cleaning up swarm resources');
    
    const cleanupPromises = Array.from(this.swarmAgents.values()).map(swarmAgent =>
      swarmAgent.agent.stop().catch(error => 
        this.logger.error(`Failed to stop agent ${swarmAgent.id}:`, error)
      )
    );
    
    await Promise.all(cleanupPromises);
    this.swarmAgents.clear();
    this.communicationChannel.removeAllListeners();
  }

  private async emergencyCleanup(): Promise<void> {
    this.logger.warn('Performing emergency cleanup');
    
    // Force stop all agents
    const forceStopPromises = Array.from(this.swarmAgents.values()).map(swarmAgent =>
      swarmAgent.agent.stop().catch(() => {})
    );
    
    await Promise.allSettled(forceStopPromises);
    this.swarmAgents.clear();
    this.communicationChannel.removeAllListeners();
  }
}