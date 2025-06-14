#!/usr/bin/env tsx

/**
 * Basic Swarm Example
 * 
 * This example demonstrates how to use the swarm pattern to have multiple
 * Claude agents work on the same problem in parallel, then combine their results.
 */

import { Orchestrator } from '../src/orchestrator/index.js';
import { loadConfig } from '../src/utils/config.js';
import type { Task } from '../src/types/index.js';

async function main() {
  console.log('🐝 Claude Orchestration - Basic Swarm Example');
  
  try {
    // Load configuration
    const config = await loadConfig('./config/orchestrator.yaml');
    
    // Create orchestrator
    const orchestrator = new Orchestrator(config);
    
    // Start orchestrator
    console.log('Starting orchestrator...');
    await orchestrator.start();
    
    // Define a complex task that benefits from multiple perspectives
    const task: Task = {
      id: 'example-swarm-1',
      description: `
        Analyze this TypeScript codebase and provide recommendations for:
        1. Performance optimizations
        2. Code structure improvements
        3. Security considerations
        4. Testing strategies
        5. Documentation improvements
        
        Focus on practical, actionable suggestions that can be implemented immediately.
      `,
      pattern: 'swarm',
      metadata: {
        agents: 5,
        strategy: 'diverse',
        domain: 'typescript-analysis'
      }
    };
    
    console.log('\\nSubmitting swarm task...');
    console.log('Task:', task.description.trim());
    
    // Execute the task
    const startTime = Date.now();
    const result = await orchestrator.execute(task);
    const duration = Date.now() - startTime;
    
    // Display results
    console.log('\\n=== SWARM RESULTS ===');
    console.log(`Execution time: ${duration}ms`);
    console.log(`Agents used: ${result.agentsUsed.join(', ')}`);
    console.log(`Success: ${result.success}`);
    
    if (result.success) {
      console.log('\\n=== AGGREGATED INSIGHTS ===');
      console.log(JSON.stringify(result.result, null, 2));
    } else {
      console.log('\\n=== ERROR ===');
      console.log(result.error);
    }
    
    // Stop orchestrator
    console.log('\\nStopping orchestrator...');
    await orchestrator.stop();
    
    console.log('✅ Example completed successfully');
    
  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\\n⚠️  Received interrupt signal, shutting down...');
  process.exit(0);
});

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}