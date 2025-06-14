#!/usr/bin/env tsx

/**
 * Pipeline Pattern Example
 * 
 * This example demonstrates how to use the pipeline pattern to process
 * a task through multiple specialized stages sequentially.
 */

import { Orchestrator } from '../src/orchestrator/index.js';
import { loadConfig } from '../src/utils/config.js';
import type { Task } from '../src/types/index.js';

async function main() {
  console.log('🔄 Claude Orchestration - Pipeline Pattern Example');
  
  try {
    const config = await loadConfig('./config/orchestrator.yaml');
    const orchestrator = new Orchestrator(config);
    
    await orchestrator.start();
    
    // Define a multi-stage task
    const task: Task = {
      id: 'example-pipeline-1',
      description: 'Create a complete REST API for a todo application',
      pattern: 'pipeline',
      metadata: {
        stages: [
          {
            name: 'requirements-analysis',
            description: 'Analyze requirements and create detailed specifications',
            agent_role: 'analyst',
            timeout: 60000
          },
          {
            name: 'architecture-design',
            description: 'Design the API architecture and database schema',
            agent_role: 'architect',
            timeout: 90000
          },
          {
            name: 'implementation',
            description: 'Implement the REST API endpoints and business logic',
            agent_role: 'developer',
            timeout: 180000
          },
          {
            name: 'testing',
            description: 'Create comprehensive tests for the API',
            agent_role: 'tester',
            timeout: 120000
          },
          {
            name: 'documentation',
            description: 'Generate API documentation and deployment guide',
            agent_role: 'technical-writer',
            timeout: 60000
          }
        ]
      }
    };
    
    console.log('\\nExecuting pipeline task...');
    console.log('Stages:', task.metadata.stages.map(s => s.name).join(' → '));
    
    const startTime = Date.now();
    const result = await orchestrator.execute(task);
    const duration = Date.now() - startTime;
    
    console.log('\\n=== PIPELINE RESULTS ===');
    console.log(`Total execution time: ${duration}ms`);
    console.log(`Success: ${result.success}`);
    
    if (result.success) {
      console.log('\\n=== STAGE OUTPUTS ===');
      result.result.stages?.forEach((stage: any, index: number) => {
        console.log(`\\n${index + 1}. ${stage.name.toUpperCase()}`);
        console.log(`   Duration: ${stage.duration}ms`);
        console.log(`   Agent: ${stage.agentId}`);
        console.log(`   Output: ${stage.output.substring(0, 200)}...`);
      });
      
      console.log('\\n=== FINAL DELIVERABLE ===');
      console.log(result.result.final_output);
    } else {
      console.log('\\n=== ERROR ===');
      console.log(result.error);
    }
    
    await orchestrator.stop();
    console.log('✅ Pipeline example completed');
    
  } catch (error) {
    console.error('❌ Pipeline example failed:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\\n⚠️  Shutting down pipeline example...');
  process.exit(0);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}