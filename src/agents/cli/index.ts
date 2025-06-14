#!/usr/bin/env node

import { Command } from 'commander';
import { config } from 'dotenv';
import { Orchestrator } from '../orchestrator/index.js';
import { loadConfig } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import type { Task } from '../types/index.js';

// Load environment variables
config();

const logger = new Logger('CLI');
const program = new Command();

program
  .name('claude-orchestrate')
  .description('Multi-agent orchestration system for Claude AI')
  .version('0.1.0');

// Start command
program
  .command('start')
  .description('Start the orchestrator')
  .option('-c, --config <path>', 'Configuration file path', './config/orchestrator.yaml')
  .option('-p, --port <port>', 'Monitoring port', '3000')
  .option('-a, --agents <count>', 'Number of agents to spawn', '3')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      
      // Override config with CLI options
      if (options.port) config.monitoring.port = parseInt(options.port);
      if (options.agents) config.agents.maxAgents = parseInt(options.agents);

      const orchestrator = new Orchestrator(config);

      // Set up graceful shutdown
      process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await orchestrator.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await orchestrator.stop();
        process.exit(0);
      });

      await orchestrator.start();
      logger.info(`Orchestrator started on port ${config.monitoring.port}`);
      logger.info(`Dashboard: http://localhost:${config.monitoring.port}`);

      // Keep the process running
      process.stdin.resume();
    } catch (error) {
      logger.error('Failed to start orchestrator:', error);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show orchestrator status')
  .option('-c, --config <path>', 'Configuration file path', './config/orchestrator.yaml')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const orchestrator = new Orchestrator(config);
      
      const status = orchestrator.getStatus();
      console.log(JSON.stringify(status, null, 2));
    } catch (error) {
      logger.error('Failed to get status:', error);
      process.exit(1);
    }
  });

// Task submission commands
const taskCmd = program
  .command('task')
  .description('Task management commands');

taskCmd
  .command('submit')
  .description('Submit a new task')
  .argument('<description>', 'Task description')
  .option('-p, --pattern <pattern>', 'Execution pattern (swarm, pipeline, consensus, mapreduce)', 'swarm')
  .option('-a, --agents <count>', 'Number of agents to use', '3')
  .option('-t, --timeout <ms>', 'Task timeout in milliseconds', '300000')
  .option('--priority <level>', 'Task priority (1-10)', '5')
  .option('-c, --config <path>', 'Configuration file path', './config/orchestrator.yaml')
  .action(async (description, options) => {
    try {
      const config = await loadConfig(options.config);
      const orchestrator = new Orchestrator(config);

      const task: Task = {
        id: `task-${Date.now()}`,
        description,
        pattern: options.pattern as any,
        priority: parseInt(options.priority),
        timeout: parseInt(options.timeout),
        metadata: {
          agents: parseInt(options.agents),
          submittedAt: new Date().toISOString(),
          submittedBy: 'cli'
        }
      };

      await orchestrator.start();
      
      logger.info(`Submitting task: ${description}`);
      const result = await orchestrator.execute(task);
      
      console.log('\n=== Task Result ===');
      console.log(JSON.stringify(result, null, 2));
      
      await orchestrator.stop();
    } catch (error) {
      logger.error('Failed to execute task:', error);
      process.exit(1);
    }
  });

// Agent management commands
const agentCmd = program
  .command('agents')
  .description('Agent management commands');

agentCmd
  .command('list')
  .description('List all agents')
  .option('-c, --config <path>', 'Configuration file path', './config/orchestrator.yaml')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const orchestrator = new Orchestrator(config);
      
      const status = orchestrator.getStatus();
      console.log('\n=== Active Agents ===');
      console.log(JSON.stringify(status.agents, null, 2));
    } catch (error) {
      logger.error('Failed to list agents:', error);
      process.exit(1);
    }
  });

agentCmd
  .command('spawn')
  .description('Spawn additional agents')
  .argument('<count>', 'Number of agents to spawn')
  .option('-c, --config <path>', 'Configuration file path', './config/orchestrator.yaml')
  .action(async (count, options) => {
    try {
      logger.info(`Spawning ${count} additional agents...`);
      // Implementation would connect to running orchestrator
      logger.info('Agent spawning not yet implemented');
    } catch (error) {
      logger.error('Failed to spawn agents:', error);
      process.exit(1);
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .option('-c, --config <path>', 'Configuration file path', './config/orchestrator.yaml')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const orchestrator = new Orchestrator(config);
      
      await orchestrator.start();
      
      console.log('🎼 Claude Orchestration - Interactive Mode');
      console.log('Type "help" for available commands, "exit" to quit');
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'orchestrator> '
      });

      rl.prompt();

      rl.on('line', async (line) => {
        const trimmed = line.trim();
        
        if (trimmed === 'exit' || trimmed === 'quit') {
          await orchestrator.stop();
          rl.close();
          return;
        }

        if (trimmed === 'help') {
          console.log(`
Available commands:
  status              - Show orchestrator status
  agents              - List active agents
  submit <task>       - Submit a new task
  swarm <task>        - Execute task using swarm pattern
  pipeline <task>     - Execute task using pipeline pattern
  consensus <task>    - Execute task using consensus pattern
  help                - Show this help
  exit                - Exit interactive mode
`);
          rl.prompt();
          return;
        }

        if (trimmed === 'status') {
          const status = orchestrator.getStatus();
          console.log(JSON.stringify(status, null, 2));
          rl.prompt();
          return;
        }

        if (trimmed === 'agents') {
          const status = orchestrator.getStatus();
          console.log('Active agents:', status.agents);
          rl.prompt();
          return;
        }

        if (trimmed.startsWith('swarm ') || trimmed.startsWith('pipeline ') || trimmed.startsWith('consensus ')) {
          const [pattern, ...taskParts] = trimmed.split(' ');
          const description = taskParts.join(' ');
          
          if (!description) {
            console.log('Please provide a task description');
            rl.prompt();
            return;
          }

          try {
            const task: Task = {
              id: `interactive-${Date.now()}`,
              description,
              pattern: pattern as any
            };

            console.log(`Executing ${pattern} task: ${description}`);
            const result = await orchestrator.execute(task);
            console.log('Result:', JSON.stringify(result, null, 2));
          } catch (error) {
            console.error('Task failed:', error.message);
          }
        }

        rl.prompt();
      });

      rl.on('close', async () => {
        console.log('\nShutting down orchestrator...');
        await orchestrator.stop();
        process.exit(0);
      });

    } catch (error) {
      logger.error('Failed to start interactive mode:', error);
      process.exit(1);
    }
  });

// Parse CLI arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}