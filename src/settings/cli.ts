#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { ConfigManager } from './config-manager.js';
import { EnvironmentConfig } from './environment-config.js';
import { SettingsUI } from './settings-ui.js';
import { SettingsTUI } from './settings-tui.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger('SettingsCLI');

const program = new Command();

program
  .name('claude-settings')
  .description('Claude Orchestration Settings Management')
  .version('1.0.0');

// Interactive TUI command
program
  .command('tui')
  .alias('ui')
  .description('Launch interactive settings interface')
  .option('-e, --environment <env>', 'Environment preset', 'development')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager(options.environment);
      const settingsUI = new SettingsUI(configManager);
      
      // Initialize with schema and config paths
      const schema = EnvironmentConfig.getCompleteSchema(options.environment);
      const configPaths = options.config ? [options.config] : [
        `./config/${options.environment}.yaml`,
        './config/orchestrator.yaml',
        './orchestrator.config.yaml'
      ];
      
      await configManager.initialize({
        schema,
        configPaths,
        watchFiles: true
      });
      
      await settingsUI.initialize();
      
      const tui = new SettingsTUI(configManager, settingsUI);
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        await tui.stop();
        await configManager.dispose();
        process.exit(0);
      });
      
      await tui.start();
    } catch (error) {
      logger.error('Failed to start settings TUI', error);
      process.exit(1);
    }
  });

// Configuration management commands
const configCmd = program
  .command('config')
  .description('Configuration management commands');

configCmd
  .command('get <path>')
  .description('Get configuration value')
  .option('-e, --environment <env>', 'Environment', 'development')
  .action(async (path, options) => {
    try {
      const configManager = new ConfigManager(options.environment);
      const schema = EnvironmentConfig.getCompleteSchema(options.environment);
      
      await configManager.initialize({ schema });
      
      const value = configManager.get(path);
      console.log(JSON.stringify(value, null, 2));
    } catch (error) {
      logger.error(`Failed to get config value: ${path}`, error);
      process.exit(1);
    }
  });

configCmd
  .command('set <path> <value>')
  .description('Set configuration value')
  .option('-e, --environment <env>', 'Environment', 'development')
  .action(async (path, value, options) => {
    try {
      const configManager = new ConfigManager(options.environment);
      const schema = EnvironmentConfig.getCompleteSchema(options.environment);
      
      await configManager.initialize({ schema });
      
      // Parse value
      let parsedValue: any;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }
      
      const success = await configManager.set(path, parsedValue, 'user');
      
      if (success) {
        console.log(`✓ Set ${path} = ${JSON.stringify(parsedValue)}`);
      } else {
        console.error(`✗ Failed to set ${path}`);
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Failed to set config value: ${path}`, error);
      process.exit(1);
    }
  });

configCmd
  .command('validate')
  .description('Validate configuration')
  .option('-e, --environment <env>', 'Environment', 'development')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager(options.environment);
      const schema = EnvironmentConfig.getCompleteSchema(options.environment);
      const configPaths = options.config ? [options.config] : [];
      
      await configManager.initialize({ schema, configPaths });
      
      const validation = await configManager.validateAll();
      
      console.log(`\n=== Configuration Validation ===`);
      console.log(`Environment: ${options.environment}`);
      console.log(`Status: ${validation.valid ? '✓ Valid' : '✗ Invalid'}`);
      
      if (validation.errors.length > 0) {
        console.log(`\nErrors (${validation.errors.length}):`);
        for (const error of validation.errors) {
          console.log(`  ✗ ${error.path}: ${error.message}`);
        }
      }
      
      if (validation.warnings.length > 0) {
        console.log(`\nWarnings (${validation.warnings.length}):`);
        for (const warning of validation.warnings) {
          console.log(`  ⚠ ${warning.path}: ${warning.message}`);
        }
      }
      
      if (validation.valid) {
        console.log(`\n✓ Configuration is valid!`);
      } else {
        process.exit(1);
      }
    } catch (error) {
      logger.error('Failed to validate configuration', error);
      process.exit(1);
    }
  });

configCmd
  .command('export')
  .description('Export configuration')
  .option('-e, --environment <env>', 'Environment', 'development')
  .option('-f, --format <format>', 'Export format', 'yaml')
  .option('-o, --output <file>', 'Output file')
  .option('--include-sensitive', 'Include sensitive values')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager(options.environment);
      const schema = EnvironmentConfig.getCompleteSchema(options.environment);
      
      await configManager.initialize({ schema });
      
      const exported = await configManager.exportConfig(
        options.format as 'json' | 'yaml',
        options.includeSensitive
      );
      
      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, exported);
        console.log(`✓ Configuration exported to ${options.output}`);
      } else {
        console.log(exported);
      }
    } catch (error) {
      logger.error('Failed to export configuration', error);
      process.exit(1);
    }
  });

configCmd
  .command('import <file>')
  .description('Import configuration from file')
  .option('-e, --environment <env>', 'Environment', 'development')
  .option('-f, --format <format>', 'Import format', 'yaml')
  .action(async (file, options) => {
    try {
      const fs = await import('fs/promises');
      const configManager = new ConfigManager(options.environment);
      const schema = EnvironmentConfig.getCompleteSchema(options.environment);
      
      await configManager.initialize({ schema });
      
      const content = await fs.readFile(file, 'utf-8');
      const success = await configManager.importConfig(content, options.format);
      
      if (success) {
        console.log(`✓ Configuration imported from ${file}`);
      } else {
        console.error(`✗ Failed to import configuration from ${file}`);
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Failed to import configuration from ${file}`, error);
      process.exit(1);
    }
  });

// Environment commands
const envCmd = program
  .command('env')
  .description('Environment management commands');

envCmd
  .command('list')
  .description('List available environments')
  .action(() => {
    const environments = ['development', 'testing', 'staging', 'production'];
    console.log('\nAvailable environments:');
    for (const env of environments) {
      const config = EnvironmentConfig.getEnvironmentConfig(env);
      console.log(`  ${env}${env === 'development' ? ' (default)' : ''}`);
    }
  });

envCmd
  .command('preset <environment>')
  .description('Show environment preset configuration')
  .action((environment) => {
    if (!EnvironmentConfig.isValidEnvironment(environment)) {
      console.error(`Invalid environment: ${environment}`);
      process.exit(1);
    }
    
    const preset = EnvironmentConfig.getEnvironmentConfig(environment);
    console.log(`\n=== ${environment.toUpperCase()} Environment Preset ===`);
    console.log(JSON.stringify(preset, null, 2));
  });

envCmd
  .command('apply <environment>')
  .description('Apply environment preset')
  .option('-c, --config <path>', 'Configuration file to create')
  .action(async (environment, options) => {
    try {
      if (!EnvironmentConfig.isValidEnvironment(environment)) {
        console.error(`Invalid environment: ${environment}`);
        process.exit(1);
      }
      
      const configManager = new ConfigManager(environment);
      const schema = EnvironmentConfig.getCompleteSchema(environment);
      const preset = EnvironmentConfig.getEnvironmentConfig(environment);
      
      await configManager.initialize({ schema });
      
      // Flatten preset configuration
      const flatConfig = flattenObject(preset);
      const success = await configManager.updateBatch(flatConfig, 'user');
      
      if (success && options.config) {
        const exported = await configManager.exportConfig('yaml');
        const fs = await import('fs/promises');
        await fs.writeFile(options.config, exported);
        console.log(`✓ Applied ${environment} preset to ${options.config}`);
      } else if (success) {
        console.log(`✓ Applied ${environment} preset to runtime configuration`);
      } else {
        console.error(`✗ Failed to apply ${environment} preset`);
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Failed to apply environment preset: ${environment}`, error);
      process.exit(1);
    }
  });

// Wizard command
program
  .command('wizard [scenario]')
  .description('Launch configuration wizard')
  .option('-e, --environment <env>', 'Environment', 'development')
  .action(async (scenario = 'first-run', options) => {
    try {
      const configManager = new ConfigManager(options.environment);
      const settingsUI = new SettingsUI(configManager);
      const schema = EnvironmentConfig.getCompleteSchema(options.environment);
      
      await configManager.initialize({ schema });
      await settingsUI.initialize();
      
      const wizardSteps = settingsUI.generateWizard(scenario as any);
      
      console.log(`\n🧙 Configuration Wizard - ${scenario}`);
      console.log('=====================================\n');
      
      for (const [index, step] of wizardSteps.entries()) {
        console.log(`Step ${index + 1}: ${step.title}`);
        console.log(step.description);
        console.log('---');
        
        for (const component of step.components) {
          const currentValue = configManager.get(component.key);
          console.log(`${component.label}: ${currentValue}`);
          
          if (component.description) {
            console.log(`  ${component.description}`);
          }
        }
        
        console.log('');
      }
      
      console.log('Use "claude-settings tui" for interactive configuration.');
    } catch (error) {
      logger.error('Failed to run configuration wizard', error);
      process.exit(1);
    }
  });

// Utility functions
function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  
  return result;
}

// Parse CLI arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}