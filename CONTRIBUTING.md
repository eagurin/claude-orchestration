# Contributing to Claude Orchestration

Thank you for your interest in contributing to Claude Orchestration! This document provides guidelines and information for contributors.

## 🚀 Quick Start

1. **Fork the repository**
2. **Clone your fork**: `git clone https://github.com/yourusername/claude-orchestration.git`
3. **Install dependencies**: `npm install`
4. **Set up environment**: `echo "CLAUDE_MODE=subscription" > .env`
5. **Build and test**: `npm run build && npm test`

## 🏗️ Development Workflow

### Prerequisites

- Node.js 20+
- npm or yarn
- Claude Code subscription (for testing)
- Git

### Setup

```bash
# Install dependencies
npm install

# Set up development environment
cp .env.example .env
# Edit .env with your configuration

# Build project
npm run build

# Start development server
npm run dev
```

### Code Style

- **TypeScript**: All code must be in TypeScript
- **ESLint**: Follow the project's ESLint configuration
- **Formatting**: Use consistent formatting (spaces, not tabs)
- **Comments**: Document complex logic and public APIs

### Running Quality Checks

```bash
# Linting
npm run lint
npm run lint:fix

# Type checking
npm run build

# Tests
npm test
```

## 📋 Pull Request Process

1. **Create a feature branch**: `git checkout -b feature/amazing-feature`
2. **Make your changes**: Follow coding standards and add tests
3. **Test thoroughly**: Ensure all tests pass and no regressions
4. **Update documentation**: Update relevant docs and CHANGELOG.md
5. **Commit with clear messages**: Use conventional commits format
6. **Push and create PR**: Provide detailed description

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(orchestrator): add new swarm pattern implementation
fix(cli): resolve task submission timeout issue  
docs(readme): update installation instructions
test(patterns): add unit tests for consensus pattern
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `ci`, `chore`

## 🎯 Areas for Contribution

### High Priority

- **Pattern Implementations**: Complete Swarm, Pipeline, Consensus, MapReduce patterns
- **MCP Integration**: Enhance tool server integration and error handling
- **Memory System**: Implement full mem0 integration for persistent knowledge
- **Testing**: Add comprehensive unit and integration tests
- **Documentation**: Improve guides and API documentation

### Medium Priority

- **Web Dashboard**: Real-time monitoring interface
- **Performance**: Optimize agent spawning and task distribution
- **Error Handling**: Improve error recovery and retry mechanisms
- **Security**: Add authentication and authorization features

### Nice to Have

- **Docker Support**: Containerization and deployment scripts
- **More Patterns**: Additional orchestration strategies
- **Plugins**: Extension system for custom functionality
- **Metrics Export**: Prometheus/Grafana integration

## 🧪 Testing Guidelines

### Test Structure

- **Unit Tests**: Individual component testing
- **Integration Tests**: Multi-component workflows
- **E2E Tests**: Full system scenarios
- **Performance Tests**: Load and latency testing

### Test Naming

```typescript
describe('OrchestoratorPattern', () => {
  describe('swarm execution', () => {
    it('should distribute tasks to multiple agents', () => {
      // Test implementation
    });
    
    it('should aggregate results from all agents', () => {
      // Test implementation
    });
  });
});
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Specific test file
npm test -- src/orchestrator/index.test.ts

# Coverage report
npm run test:coverage
```

## 📝 Documentation Standards

### Code Documentation

- **JSDoc**: Document all public methods and classes
- **Type Annotations**: Use comprehensive TypeScript types
- **README**: Keep project README up to date
- **Examples**: Include practical usage examples

### Documentation Updates

Always update relevant documentation when making changes:

- `README.md` - Main project overview
- `README_NO_API.md` - Subscription mode guide  
- `CLAUDE.md` - Technical development guide
- `CHANGELOG.md` - Version history
- Inline code comments for complex logic

## 🐛 Issue Reporting

### Bug Reports

Include:
- **Environment**: OS, Node.js version, package version
- **Steps to reproduce**: Clear, minimal reproduction steps
- **Expected behavior**: What should happen
- **Actual behavior**: What actually happens
- **Logs**: Relevant error messages and logs
- **Configuration**: Relevant config settings (redact secrets)

### Feature Requests

Include:
- **Use case**: Why is this feature needed?
- **Proposed solution**: How should it work?
- **Alternatives**: Other approaches considered
- **Implementation**: Technical details if applicable

## 🔄 Release Process

### Version Bumping

- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features, backward compatible
- **Patch** (1.0.0 → 1.0.1): Bug fixes, backward compatible

### Release Checklist

1. Update version in `package.json`
2. Update `CHANGELOG.md` with new version
3. Run full test suite
4. Create release PR
5. Tag release after merge
6. Create GitHub release with notes

## 🤝 Code of Conduct

- **Be respectful**: Treat all contributors with respect
- **Be collaborative**: Help others and ask for help when needed
- **Be constructive**: Provide helpful feedback and suggestions
- **Be patient**: Remember that everyone is learning

## 📞 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Documentation**: Check existing docs first
- **Code Examples**: See `examples/` directory

## 🙏 Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes for significant contributions
- Project documentation for major features

Thank you for contributing to Claude Orchestration! 🎼✨