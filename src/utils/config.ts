import { readFile } from 'fs/promises';
import { parse } from 'yaml';
import type { OrchestratorConfig } from '../types/index.js';

const defaultConfig: OrchestratorConfig = {
  agents: {
    maxAgents: parseInt(process.env.MAX_AGENTS || '10'),
    defaultModel: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    maxTokens: 100000,
    temperature: 0.7,
    spawnTimeout: 10000
  },
  taskQueue: {
    maxConcurrency: 5,
    retryDelay: 1000,
    redisUrl: process.env.REDIS_URL
  },
  mcp: {
    servers: ['filesystem', 'memory', 'github', 'web-search'],
    serverPath: process.env.MCP_SERVERS_PATH || './config/mcp-servers.json'
  },
  memory: {
    apiKey: process.env.MEM0_API_KEY,
    baseUrl: process.env.MEM0_BASE_URL || 'https://api.mem0.ai',
    userId: 'orchestrator-user'
  },
  monitoring: {
    port: parseInt(process.env.MONITORING_PORT || '3000'),
    metricsInterval: parseInt(process.env.METRICS_INTERVAL || '1000'),
    enableTracing: true
  },
  patterns: {
    swarm: {
      defaultAgents: 3,
      maxAgents: 10,
      diversityStrategy: 'capability'
    },
    pipeline: {
      maxStages: 10,
      stageTimeout: 60000,
      allowParallelStages: true
    },
    consensus: {
      minAgents: 3,
      agreementThreshold: 0.8,
      maxRounds: 5
    },
    mapreduce: {
      chunkSize: 1000,
      maxMappers: 5,
      maxReducers: 2
    }
  }
};

export async function loadConfig(configPath?: string): Promise<OrchestratorConfig> {
  if (!configPath) {
    return defaultConfig;
  }

  try {
    const configFile = await readFile(configPath, 'utf-8');
    const userConfig = parse(configFile);
    
    // Deep merge with default config
    return mergeConfig(defaultConfig, userConfig);
  } catch (error) {
    console.warn(`Failed to load config from ${configPath}, using defaults:`, error instanceof Error ? error.message : 'Unknown error');
    return defaultConfig;
  }
}

function mergeConfig(defaultConfig: any, userConfig: any): any {
  const result = { ...defaultConfig };
  
  for (const key in userConfig) {
    if (userConfig[key] && typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
      result[key] = mergeConfig(result[key] || {}, userConfig[key]);
    } else {
      result[key] = userConfig[key];
    }
  }
  
  return result;
}