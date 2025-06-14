import type { MCPConfig } from '../types/index.js';

export class MCPManager {
  private config: MCPConfig;
  
  constructor(config: MCPConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    // TODO: Start MCP servers
  }

  async stop(): Promise<void> {
    // TODO: Stop MCP servers
  }

  getStatus(): any {
    // TODO: Return MCP status
    return { activeServers: [] };
  }
}