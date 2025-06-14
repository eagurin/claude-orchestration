// Export main classes
export { Supervisor } from './supervisor.js';
export { SupervisorManager } from './supervisor-manager.js';
export { GitHubIssueHandler } from './github-issue-handler.js';
export { OrchestrationDirector } from './orchestration-director.js';

// Export types (all types are now in types/index.ts)
export type {
  SupervisorConfig,
  TeamMetrics,
  WorkSession,
  SupervisorManagerConfig,
  GitHubIssue,
  IssueAnalysis,
  OrchestrationDirectorConfig
} from '../types/index.js';