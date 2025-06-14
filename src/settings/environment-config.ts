import { ConfigDefinition } from './config-manager.js';

/**
 * Environment-specific configuration schemas and presets
 */
export class EnvironmentConfig {
  
  /**
   * Get configuration schema for orchestrator
   */
  static getOrchestratorSchema(): ConfigDefinition {
    return {
      orchestrator: {
        agents: {
          maxAgents: {
            type: 'number',
            default: 5,
            min: 1,
            max: 50,
            description: 'Maximum number of concurrent agents'
          },
          defaultTimeout: {
            type: 'number',
            default: 300000,
            min: 1000,
            max: 3600000,
            description: 'Default agent timeout in milliseconds'
          },
          retryAttempts: {
            type: 'number',
            default: 3,
            min: 0,
            max: 10,
            description: 'Number of retry attempts for failed tasks'
          },
          healthCheckInterval: {
            type: 'number',
            default: 30000,
            min: 5000,
            max: 300000,
            description: 'Agent health check interval in milliseconds'
          }
        },
        patterns: {
          swarm: {
            enabled: {
              type: 'boolean',
              default: true,
              description: 'Enable swarm pattern execution'
            },
            maxConcurrency: {
              type: 'number',
              default: 10,
              min: 1,
              max: 100,
              description: 'Maximum concurrent agents in swarm'
            },
            resultAggregation: {
              type: 'string',
              default: 'consensus',
              enum: ['first', 'best', 'consensus', 'majority'],
              description: 'How to aggregate swarm results'
            }
          },
          pipeline: {
            enabled: {
              type: 'boolean',
              default: true,
              description: 'Enable pipeline pattern execution'
            },
            stageTimeout: {
              type: 'number',
              default: 120000,
              min: 10000,
              max: 600000,
              description: 'Timeout for each pipeline stage'
            },
            failureHandling: {
              type: 'string',
              default: 'stop',
              enum: ['stop', 'skip', 'retry'],
              description: 'How to handle stage failures'
            }
          },
          consensus: {
            enabled: {
              type: 'boolean',
              default: true,
              description: 'Enable consensus pattern execution'
            },
            minAgreement: {
              type: 'number',
              default: 0.7,
              min: 0.1,
              max: 1.0,
              description: 'Minimum agreement threshold (0-1)'
            },
            maxRounds: {
              type: 'number',
              default: 5,
              min: 1,
              max: 20,
              description: 'Maximum consensus rounds'
            }
          },
          mapreduce: {
            enabled: {
              type: 'boolean',
              default: true,
              description: 'Enable map-reduce pattern execution'
            },
            chunkSize: {
              type: 'number',
              default: 100,
              min: 1,
              max: 10000,
              description: 'Default chunk size for map phase'
            },
            reduceStrategy: {
              type: 'string',
              default: 'merge',
              enum: ['merge', 'sum', 'concat', 'custom'],
              description: 'Strategy for reduce phase'
            }
          }
        },
        monitoring: {
          enabled: {
            type: 'boolean',
            default: true,
            description: 'Enable monitoring and metrics collection'
          },
          port: {
            type: 'number',
            default: 3000,
            min: 1024,
            max: 65535,
            description: 'Monitoring server port'
          },
          metricsRetention: {
            type: 'number',
            default: 86400000,
            min: 3600000,
            max: 604800000,
            description: 'Metrics retention period in milliseconds'
          },
          logLevel: {
            type: 'string',
            default: 'info',
            enum: ['error', 'warn', 'info', 'debug'],
            description: 'Logging level'
          },
          exportInterval: {
            type: 'number',
            default: 60000,
            min: 10000,
            max: 600000,
            description: 'Metrics export interval in milliseconds'
          }
        },
        memory: {
          enabled: {
            type: 'boolean',
            default: true,
            description: 'Enable memory management'
          },
          maxEntries: {
            type: 'number',
            default: 10000,
            min: 100,
            max: 1000000,
            description: 'Maximum memory entries'
          },
          compressionEnabled: {
            type: 'boolean',
            default: true,
            description: 'Enable memory compression'
          },
          indexingEnabled: {
            type: 'boolean',
            default: true,
            description: 'Enable semantic indexing'
          },
          cacheSize: {
            type: 'number',
            default: 1000,
            min: 10,
            max: 100000,
            description: 'Memory cache size'
          }
        }
      },
      claude: {
        subscription: {
          mode: {
            type: 'string',
            default: 'subscription',
            enum: ['api', 'subscription'],
            description: 'Claude access mode'
          },
          maxTokens: {
            type: 'number',
            default: 4096,
            min: 100,
            max: 200000,
            description: 'Maximum tokens per request'
          },
          temperature: {
            type: 'number',
            default: 0.7,
            min: 0.0,
            max: 2.0,
            description: 'Response temperature'
          },
          rateLimitRpm: {
            type: 'number',
            default: 60,
            min: 1,
            max: 1000,
            description: 'Rate limit requests per minute'
          }
        },
        fallback: {
          enabled: {
            type: 'boolean',
            default: false,
            description: 'Enable fallback mechanisms'
          },
          providers: {
            type: 'array',
            default: [],
            description: 'Fallback provider list'
          },
          timeout: {
            type: 'number',
            default: 30000,
            min: 5000,
            max: 180000,
            description: 'Provider timeout in milliseconds'
          }
        }
      },
      security: {
        authentication: {
          enabled: {
            type: 'boolean',
            default: false,
            description: 'Enable authentication'
          },
          provider: {
            type: 'string',
            default: 'none',
            enum: ['none', 'jwt', 'oauth', 'api-key'],
            description: 'Authentication provider'
          },
          sessionTimeout: {
            type: 'number',
            default: 3600000,
            min: 300000,
            max: 86400000,
            description: 'Session timeout in milliseconds'
          }
        },
        authorization: {
          enabled: {
            type: 'boolean',
            default: false,
            description: 'Enable role-based authorization'
          },
          defaultRole: {
            type: 'string',
            default: 'user',
            enum: ['admin', 'user', 'readonly'],
            description: 'Default user role'
          }
        },
        encryption: {
          enabled: {
            type: 'boolean',
            default: true,
            description: 'Enable data encryption'
          },
          algorithm: {
            type: 'string',
            default: 'aes-256-gcm',
            enum: ['aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305'],
            description: 'Encryption algorithm'
          },
          keyRotationInterval: {
            type: 'number',
            default: 2592000000,
            min: 86400000,
            max: 31536000000,
            description: 'Key rotation interval in milliseconds'
          }
        }
      },
      storage: {
        type: {
          type: 'string',
          default: 'filesystem',
          enum: ['filesystem', 'memory', 'redis', 'mongodb'],
          description: 'Storage backend type'
        },
        path: {
          type: 'string',
          default: './data',
          description: 'Storage path for filesystem backend'
        },
        backup: {
          enabled: {
            type: 'boolean',
            default: true,
            description: 'Enable automatic backups'
          },
          interval: {
            type: 'number',
            default: 86400000,
            min: 3600000,
            max: 604800000,
            description: 'Backup interval in milliseconds'
          },
          retention: {
            type: 'number',
            default: 7,
            min: 1,
            max: 365,
            description: 'Backup retention in days'
          }
        }
      }
    };
  }

  /**
   * Get environment-specific configuration presets
   */
  static getEnvironmentPresets(): Record<string, Partial<any>> {
    return {
      development: {
        orchestrator: {
          agents: {
            maxAgents: 3,
            defaultTimeout: 60000
          },
          monitoring: {
            logLevel: 'debug',
            port: 3000
          },
          patterns: {
            swarm: { maxConcurrency: 3 },
            consensus: { maxRounds: 3 }
          }
        },
        security: {
          authentication: { enabled: false },
          authorization: { enabled: false },
          encryption: { enabled: false }
        },
        storage: {
          type: 'filesystem',
          path: './dev-data'
        }
      },
      testing: {
        orchestrator: {
          agents: {
            maxAgents: 2,
            defaultTimeout: 30000,
            retryAttempts: 1
          },
          monitoring: {
            logLevel: 'warn',
            port: 3001,
            metricsRetention: 3600000
          },
          memory: {
            maxEntries: 100,
            cacheSize: 50
          }
        },
        security: {
          authentication: { enabled: false },
          authorization: { enabled: false },
          encryption: { enabled: false }
        },
        storage: {
          type: 'memory'
        }
      },
      staging: {
        orchestrator: {
          agents: {
            maxAgents: 8,
            defaultTimeout: 180000
          },
          monitoring: {
            logLevel: 'info',
            port: 3000
          },
          patterns: {
            swarm: { maxConcurrency: 8 },
            consensus: { maxRounds: 5 }
          }
        },
        security: {
          authentication: { enabled: true, provider: 'jwt' },
          authorization: { enabled: true },
          encryption: { enabled: true }
        },
        storage: {
          type: 'filesystem',
          path: '/var/lib/claude-orchestrator',
          backup: { enabled: true, interval: 43200000 }
        }
      },
      production: {
        orchestrator: {
          agents: {
            maxAgents: 20,
            defaultTimeout: 300000,
            retryAttempts: 3
          },
          monitoring: {
            logLevel: 'warn',
            port: 3000,
            metricsRetention: 604800000
          },
          patterns: {
            swarm: { maxConcurrency: 20 },
            pipeline: { stageTimeout: 180000 },
            consensus: { maxRounds: 10 }
          },
          memory: {
            maxEntries: 100000,
            cacheSize: 10000
          }
        },
        claude: {
          subscription: {
            maxTokens: 8192,
            rateLimitRpm: 200
          },
          fallback: {
            enabled: true,
            timeout: 60000
          }
        },
        security: {
          authentication: { 
            enabled: true, 
            provider: 'oauth',
            sessionTimeout: 1800000
          },
          authorization: { enabled: true },
          encryption: { 
            enabled: true,
            keyRotationInterval: 604800000
          }
        },
        storage: {
          type: 'mongodb',
          backup: { 
            enabled: true, 
            interval: 21600000,
            retention: 30
          }
        }
      }
    };
  }

  /**
   * Get feature flags configuration
   */
  static getFeatureFlags(): ConfigDefinition {
    return {
      features: {
        experimental: {
          asyncPatterns: {
            type: 'boolean',
            default: false,
            description: 'Enable experimental async execution patterns'
          },
          aiOptimization: {
            type: 'boolean',
            default: false,
            description: 'Enable AI-driven optimization features'
          },
          distributedExecution: {
            type: 'boolean',
            default: false,
            description: 'Enable distributed execution across nodes'
          },
          advancedMemory: {
            type: 'boolean',
            default: false,
            description: 'Enable advanced memory management features'
          }
        },
        beta: {
          webInterface: {
            type: 'boolean',
            default: true,
            description: 'Enable web-based management interface'
          },
          restApi: {
            type: 'boolean',
            default: true,
            description: 'Enable REST API endpoints'
          },
          realTimeUpdates: {
            type: 'boolean',
            default: true,
            description: 'Enable real-time status updates'
          },
          metricsExport: {
            type: 'boolean',
            default: true,
            description: 'Enable metrics export functionality'
          }
        },
        stable: {
          cliInterface: {
            type: 'boolean',
            default: true,
            description: 'Enable command-line interface'
          },
          configurationManagement: {
            type: 'boolean',
            default: true,
            description: 'Enable configuration management'
          },
          basicMonitoring: {
            type: 'boolean',
            default: true,
            description: 'Enable basic monitoring features'
          },
          memoryPersistence: {
            type: 'boolean',
            default: true,
            description: 'Enable memory persistence'
          }
        }
      }
    };
  }

  /**
   * Get performance tuning configuration
   */
  static getPerformanceConfig(): ConfigDefinition {
    return {
      performance: {
        cpu: {
          maxCpuUsage: {
            type: 'number',
            default: 80,
            min: 10,
            max: 95,
            description: 'Maximum CPU usage percentage'
          },
          throttleThreshold: {
            type: 'number',
            default: 90,
            min: 50,
            max: 99,
            description: 'CPU throttling threshold'
          }
        },
        memory: {
          maxMemoryUsage: {
            type: 'number',
            default: 1073741824, // 1GB
            min: 134217728, // 128MB
            max: 17179869184, // 16GB
            description: 'Maximum memory usage in bytes'
          },
          gcInterval: {
            type: 'number',
            default: 300000,
            min: 30000,
            max: 3600000,
            description: 'Garbage collection interval in milliseconds'
          }
        },
        network: {
          maxConnections: {
            type: 'number',
            default: 1000,
            min: 10,
            max: 10000,
            description: 'Maximum concurrent connections'
          },
          connectionTimeout: {
            type: 'number',
            default: 30000,
            min: 5000,
            max: 300000,
            description: 'Connection timeout in milliseconds'
          },
          keepAliveTimeout: {
            type: 'number',
            default: 5000,
            min: 1000,
            max: 60000,
            description: 'Keep-alive timeout in milliseconds'
          }
        },
        cache: {
          maxCacheSize: {
            type: 'number',
            default: 104857600, // 100MB
            min: 1048576, // 1MB
            max: 1073741824, // 1GB
            description: 'Maximum cache size in bytes'
          },
          ttl: {
            type: 'number',
            default: 3600000,
            min: 60000,
            max: 86400000,
            description: 'Cache TTL in milliseconds'
          },
          compressionEnabled: {
            type: 'boolean',
            default: true,
            description: 'Enable cache compression'
          }
        }
      }
    };
  }

  /**
   * Merge multiple configuration schemas
   */
  static mergeSchemas(...schemas: ConfigDefinition[]): ConfigDefinition {
    const merged: ConfigDefinition = {};
    
    for (const schema of schemas) {
      this.deepMerge(merged, schema);
    }
    
    return merged;
  }

  /**
   * Get complete configuration schema for environment
   */
  static getCompleteSchema(environment = 'development'): ConfigDefinition {
    const baseSchema = this.getOrchestratorSchema();
    const featureFlags = this.getFeatureFlags();
    const performanceConfig = this.getPerformanceConfig();
    
    return this.mergeSchemas(baseSchema, featureFlags, performanceConfig);
  }

  /**
   * Get environment-specific configuration
   */
  static getEnvironmentConfig(environment: string): any {
    const presets = this.getEnvironmentPresets();
    return presets[environment] || presets.development;
  }

  /**
   * Validate environment name
   */
  static isValidEnvironment(environment: string): boolean {
    const validEnvironments = ['development', 'testing', 'staging', 'production'];
    return validEnvironments.includes(environment);
  }

  /**
   * Get recommended configuration for use case
   */
  static getRecommendedConfig(useCase: 'development' | 'testing' | 'demo' | 'production'): any {
    const recommendations = {
      development: {
        orchestrator: {
          agents: { maxAgents: 3, defaultTimeout: 60000 },
          monitoring: { logLevel: 'debug' },
          patterns: { swarm: { maxConcurrency: 3 } }
        },
        features: {
          experimental: { asyncPatterns: true },
          beta: { webInterface: true }
        }
      },
      testing: {
        orchestrator: {
          agents: { maxAgents: 2, retryAttempts: 1 },
          monitoring: { logLevel: 'error' },
          memory: { maxEntries: 100 }
        },
        features: {
          experimental: { asyncPatterns: false },
          beta: { webInterface: false }
        }
      },
      demo: {
        orchestrator: {
          agents: { maxAgents: 5, defaultTimeout: 30000 },
          monitoring: { logLevel: 'info' },
          patterns: { swarm: { maxConcurrency: 5 } }
        },
        features: {
          beta: { webInterface: true, realTimeUpdates: true }
        }
      },
      production: {
        orchestrator: {
          agents: { maxAgents: 20, defaultTimeout: 300000 },
          monitoring: { logLevel: 'warn', metricsRetention: 604800000 },
          patterns: { swarm: { maxConcurrency: 20 } }
        },
        security: {
          authentication: { enabled: true },
          authorization: { enabled: true },
          encryption: { enabled: true }
        },
        performance: {
          cpu: { maxCpuUsage: 70 },
          memory: { maxMemoryUsage: 2147483648 }
        }
      }
    };

    return recommendations[useCase] || recommendations.development;
  }

  private static deepMerge(target: any, source: any): void {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}