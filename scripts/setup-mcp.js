#!/usr/bin/env node

/**
 * Setup script for MCP servers
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

async function setupMCPServers() {
  console.log('🔧 Setting up MCP servers...');
  
  try {
    // Ensure directories exist
    const configDir = join(projectRoot, 'config');
    const logsDir = join(projectRoot, 'logs');
    
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
    }
    
    if (!existsSync(logsDir)) {
      await mkdir(logsDir, { recursive: true });
    }
    
    // Check if MCP servers config exists
    const mcpConfigPath = join(configDir, 'mcp-servers.json');
    if (!existsSync(mcpConfigPath)) {
      console.log('⚠️  MCP servers config not found, using default configuration');
      return;
    }
    
    const mcpConfig = JSON.parse(await readFile(mcpConfigPath, 'utf-8'));
    
    console.log('✅ Found MCP servers configuration');
    console.log('📋 Available servers:');
    
    for (const [name, config] of Object.entries(mcpConfig.mcpServers)) {
      console.log(`  • ${name}: ${config.command} ${(config.args || []).join(' ')}`);
    }
    
    console.log('\\n🎯 Next steps:');
    console.log('1. Set required environment variables in .env file');
    console.log('2. Install required MCP server packages:');
    console.log('   npm install -g @modelcontextprotocol/server-filesystem');
    console.log('   npm install -g @modelcontextprotocol/server-github');
    console.log('   npm install -g @modelcontextprotocol/server-brave-search');
    console.log('3. Run: npm start');
    
  } catch (error) {
    console.error('❌ Failed to setup MCP servers:', error.message);
    process.exit(1);
  }
}

// Create example .env if it doesn't exist
async function createExampleEnv() {
  const envPath = join(projectRoot, '.env');
  const envExamplePath = join(projectRoot, '.env.example');
  
  if (!existsSync(envPath) && existsSync(envExamplePath)) {
    console.log('📄 Creating .env file from .env.example...');
    const envExample = await readFile(envExamplePath, 'utf-8');
    await writeFile(envPath, envExample);
    console.log('✅ Created .env file - please update with your actual API keys');
  }
}

async function main() {
  console.log('🚀 Claude Orchestration Setup');
  console.log('=============================\\n');
  
  await createExampleEnv();
  await setupMCPServers();
  
  console.log('\\n✨ Setup complete!');
}

main().catch(console.error);