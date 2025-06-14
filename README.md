# Claude Orchestration 🎼️ - Multi-Agent Coordination System

[![Node Version](https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blueviolet.svg)](https://modelcontextprotocol.io/)

A powerful orchestration system for managing multiple Claude agents using Model Context Protocol (MCP), unified tool access, and intelligent task distribution.

## 🚀 Features

- **MCP Integration**: Seamless tool sharing across all agents via Model Context Protocol
- **Intelligent Routing**: Smart task distribution based on agent capabilities
- **Persistent Memory**: Shared knowledge base using mem0 for continuous learning
- **Real-time Monitoring**: Live dashboard for agent status and performance
- **Orchestration Patterns**: Swarm, Pipeline, Consensus, and MapReduce patterns
- **Fault Tolerance**: Automatic recovery and retry mechanisms

## 🏃‍♂️ Quick Start

### С подпиской Claude Code (без API ключей)

```bash
# Clone the repository
git clone https://github.com/eagurin/claude-orchestration.git
cd claude_orchestration

# Install dependencies
npm install

# Setup for subscription mode (no API key needed)
echo "CLAUDE_MODE=subscription" > .env
npm run setup

# Start the orchestrator
npm run build && npm start

# In another terminal, submit a task
npm run task:submit -- --pattern swarm "Refactor this codebase for better performance"
```

### С API ключом Anthropic

```bash
# Same steps, but configure API mode
echo "CLAUDE_MODE=api" > .env
echo "ANTHROPIC_API_KEY=your_key_here" >> .env
npm run setup && npm start
```

📖 **Подробная инструкция для работы без API ключей**: [README_NO_API.md](./README_NO_API.md)

## 🏗️ Architecture

```bash
┌──────────────────────────────────────────────────────────────┐
│                  ORCHESTRATOR (Node.js)                      │
│  ┌───────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ MCP Manager   │  │ Task Queue  │  │ Agent Pool   │  │
│  │ (Tool Router) │  │ (Priority)  │  │ (Lifecycle)  │  │
│  └───────────────┘  └─────────────┘  └──────────────┘  │
└─────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│   AGENT 1      │   │   AGENT 2      │   │   AGENT N      │
│ ┌────────────┐ │   │ ┌────────────┐ │   │ ┌────────────┐ │
│ │Claude Code │ │   │ │Claude Code │ │   │ │Claude Code │ │
│ └────────────┘ │   │ └────────────┘ │   │ └────────────┘ │
│ ┌────────────┐ │   │ ┌────────────┐ │   │ ┌────────────┐ │
│ │MCP Client  │ │   │ │MCP Client  │ │   │ │MCP Client  │ │
│ └────────────┘ │   │ └────────────┘ │   │ └────────────┘ │
└────────────────┘   └────────────────┘   └────────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │  MCP SERVERS     │
                    │ • filesystem     │
                    │ • memory (mem0)  │
                    │ • github         │
                    │ • web-search     │
                    └──────────────────┘
```

## 📊 Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Agent Spawn | < 2s | 1.8s |
| Task Distribution | < 50ms | 35ms |
| Tool Call Overhead | < 100ms | 85ms |
| Memory/Agent | < 200MB | 180MB |
| Concurrent Agents | > 10 | 15 |

## 🎯 Orchestration Patterns

### Swarm Pattern

Multiple agents explore solutions in parallel:

```typescript
await orchestrator.execute({
    pattern: 'swarm',
    task: 'Optimize this algorithm',
    config: {
        agents: 5,
        strategy: 'diverse',
        timeout: 30000
    }
});
```

### Pipeline Pattern

Sequential processing through specialized agents:

```typescript
await orchestrator.execute({
    pattern: 'pipeline',
    stages: [
        { name: 'analyze', agent: 'researcher' },
        { name: 'implement', agent: 'coder' },
        { name: 'test', agent: 'tester' }
    ]
});
```

### Consensus Pattern

Multiple agents validate results:

```typescript
await orchestrator.execute({
    pattern: 'consensus',
    task: 'Review this architecture',
    config: {
        minAgents: 3,
        agreementThreshold: 0.8 // 80% agreement
    }
});
```

## 🔧 Configuration

```yaml
# orchestrator.yaml
orchestrator:
  maxAgents: 20
  taskTimeout: 300000 # 5 minutes
  retryAttempts: 3

agents:
  defaultModel: claude-3-sonnet-20240229
  maxTokens: 100000
  temperature: 0.7
  
mcp:
  servers:
    - filesystem
    - memory
    - github
    - web-search
  
monitoring:
  port: 3000
  metricsInterval: 1000
```

## 🛠️ Development

### Prerequisites

- Node.js 20+
- npm or yarn
- Claude API key
- MCP-compatible environment

### Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your API keys

# Initialize MCP servers
npm run setup:mcp

# Run tests
npm test
```

### Project Structure

```bash
claude_orchestration/
├── src/                    # Source code
│   ├── orchestrator/      # Core orchestration
│   ├── agents/            # Agent implementations
│   ├── mcp/               # MCP integration
│   ├── patterns/          # Orchestration patterns
│   └── cli/               # CLI interface
├── config/                # Configuration files
├── tests/                 # Test suites
└── examples/              # Usage examples
```

## 📚 Examples

### Basic Swarm

```typescript
import { Orchestrator } from 'claude-orchestration';

// Create orchestrator
const orchestrator = new Orchestrator({
    maxAgents: 10,
    mcpServers: ['filesystem', 'memory']
});

// Start orchestrator
await orchestrator.start();

// Execute swarm task
const result = await orchestrator.execute({
    pattern: 'swarm',
    task: 'Refactor the legacy authentication module',
    agents: 5
});

console.log(result.consensus);
```

### Advanced Pipeline

```typescript
// Multi-stage processing
const pipeline = await orchestrator.createPipeline([
    { name: 'parse', agents: 2, role: 'analyzer' },
    { name: 'refactor', agents: 3, role: 'developer' },
    { name: 'test', agents: 1, role: 'tester' }
]);

// Process with progress tracking
const result = await pipeline.process(inputData, {
    onProgress: (stage, progress) => {
        console.log(`${stage}: ${progress}%`);
    }
});
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📜 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Built on [Model Context Protocol](https://modelcontextprotocol.io/) for tool integration
- Inspired by [claude-squad](https://github.com/github/claude-squad) for multi-agent patterns
- Uses [claude-code](https://github.com/anthropics/claude-code) as the primary agent runtime

## 🔗 Related Projects

- [claude-code](https://github.com/anthropics/claude-code) - Official Claude CLI
- [claude-squad](https://github.com/github/claude-squad) - Multi-session management
- [aider](https://github.com/paul-gauthier/aider) - AI pair programming tool

---

**🤖 Intelligent orchestration. Unified tools. Collective intelligence.**
