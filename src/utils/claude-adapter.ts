/**
 * Adapter for Claude integration that works with both API keys and Claude Code subscription
 */

import { ClaudeCodeAgent } from '../agents/claude-code-agent.js';
import type { Agent, AgentConfig } from '../types/index.js';

export class ClaudeAdapter {
  private mode: 'api' | 'subscription';
  private config: AgentConfig;

  constructor(config: AgentConfig, mode: 'api' | 'subscription' = 'subscription') {
    this.config = config;
    this.mode = mode;
  }

  /**
   * Create an agent based on the configured mode
   */
  createAgent(id: string, workingDirectory?: string): Agent {
    if (this.mode === 'subscription') {
      return new ClaudeCodeAgent(id, this.config, workingDirectory);
    } else {
      // Fallback to API mode if available
      throw new Error('API mode requires ANTHROPIC_API_KEY environment variable');
    }
  }

  /**
   * Check if the current configuration is valid
   */
  validateConfiguration(): { valid: boolean; error?: string } {
    if (this.mode === 'subscription') {
      // For subscription mode, we just need Claude Code to be available
      return { valid: true };
    } else {
      // For API mode, check for API key
      if (!process.env.ANTHROPIC_API_KEY) {
        return {
          valid: false,
          error: 'ANTHROPIC_API_KEY environment variable is required for API mode'
        };
      }
      return { valid: true };
    }
  }

  /**
   * Get information about the current configuration
   */
  getInfo(): { mode: string; available: boolean; description: string } {
    if (this.mode === 'subscription') {
      return {
        mode: 'subscription',
        available: true,
        description: 'Using Claude Code subscription (no API key required)'
      };
    } else {
      return {
        mode: 'api',
        available: !!process.env.ANTHROPIC_API_KEY,
        description: 'Using Anthropic API (requires API key)'
      };
    }
  }

  /**
   * Determine the best mode based on environment
   */
  static detectMode(): 'api' | 'subscription' {
    const claudeMode = process.env.CLAUDE_MODE?.toLowerCase();
    
    if (claudeMode === 'api' && process.env.ANTHROPIC_API_KEY) {
      return 'api';
    }
    
    // Default to subscription mode (Claude Code)
    return 'subscription';
  }
}

/**
 * Factory function to create the appropriate Claude adapter
 */
export function createClaudeAdapter(config: AgentConfig): ClaudeAdapter {
  const mode = ClaudeAdapter.detectMode();
  const adapter = new ClaudeAdapter(config, mode);
  
  const validation = adapter.validateConfiguration();
  if (!validation.valid) {
    console.warn(`⚠️  ${validation.error}`);
    console.log('💡 Switching to subscription mode (Claude Code)');
    return new ClaudeAdapter(config, 'subscription');
  }
  
  const info = adapter.getInfo();
  console.log(`🤖 Claude mode: ${info.description}`);
  
  return adapter;
}