import { EventEmitter } from 'events';
import { promises as fs, watch, FSWatcher } from 'fs';
import { resolve, dirname } from 'path';
import YAML from 'yaml';
import { Logger } from '../utils/logger.js';

export interface ConfigSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  enum?: any[];
  description?: string;
  validation?: (value: any) => boolean | string;
  sensitive?: boolean;
}

export interface ConfigDefinition {
  [key: string]: ConfigSchema | ConfigDefinition;
}

export interface ConfigValue {
  value: any;
  source: 'default' | 'file' | 'env' | 'runtime' | 'user';
  timestamp: number;
  validated: boolean;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    value: any;
  }>;
  warnings: Array<{
    path: string;
    message: string;
    value: any;
  }>;
}

export interface ConfigUpdateEvent {
  path: string;
  oldValue: any;
  newValue: any;
  source: ConfigValue['source'];
  timestamp: number;
}

/**
 * Hierarchical Configuration Manager
 * Supports multiple config sources with priority ordering and validation
 */
export class ConfigManager extends EventEmitter {
  private logger: Logger;
  private config: Map<string, ConfigValue> = new Map();
  private schema: ConfigDefinition = {};
  private watchers: Map<string, FSWatcher> = new Map();
  private configPaths: string[] = [];
  private environment: string;
  private readonly sources = ['default', 'file', 'env', 'runtime', 'user'] as const;
  
  constructor(environment = 'development') {
    super();
    this.logger = new Logger('ConfigManager');
    this.environment = environment;
  }

  /**
   * Initialize configuration system
   */
  async initialize(options: {
    configPaths?: string[];
    schema?: ConfigDefinition;
    watchFiles?: boolean;
  } = {}): Promise<void> {
    try {
      this.logger.info('Initializing configuration manager', {
        environment: this.environment,
        configPaths: options.configPaths?.length || 0
      });

      // Set schema
      if (options.schema) {
        this.schema = options.schema;
      }

      // Load default values from schema
      await this.loadDefaults();

      // Load configuration files
      if (options.configPaths) {
        this.configPaths = options.configPaths;
        await this.loadConfigFiles();
      }

      // Load environment variables
      await this.loadEnvironmentVariables();

      // Set up file watchers
      if (options.watchFiles && options.configPaths) {
        await this.setupFileWatchers();
      }

      // Validate all configuration
      const validation = await this.validateAll();
      if (!validation.valid) {
        this.logger.warn('Configuration validation issues found', {
          errors: validation.errors.length,
          warnings: validation.warnings.length
        });
      }

      this.logger.info('Configuration manager initialized successfully');
      this.emit('initialized', { environment: this.environment });
    } catch (error) {
      this.logger.error('Failed to initialize configuration manager', error);
      throw error;
    }
  }

  /**
   * Get configuration value with type safety
   */
  get<T = any>(path: string): T | undefined {
    const configValue = this.config.get(path);
    return configValue?.value as T;
  }

  /**
   * Get configuration value with default fallback
   */
  getWithDefault<T = any>(path: string, defaultValue: T): T {
    const value = this.get<T>(path);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set configuration value at runtime
   */
  async set(path: string, value: any, source: 'runtime' | 'user' = 'runtime'): Promise<boolean> {
    try {
      const oldValue = this.get(path);
      
      // Validate the new value
      const validation = await this.validateValue(path, value);
      if (!validation.valid) {
        this.logger.error(`Invalid configuration value for ${path}`, validation.errors);
        return false;
      }

      // Update configuration
      const configValue: ConfigValue = {
        value,
        source,
        timestamp: Date.now(),
        validated: true
      };

      this.config.set(path, configValue);

      // Emit change event
      const updateEvent: ConfigUpdateEvent = {
        path,
        oldValue,
        newValue: value,
        source,
        timestamp: configValue.timestamp
      };

      this.emit('configChanged', updateEvent);
      this.logger.debug(`Configuration updated: ${path}`, {
        oldValue,
        newValue: value,
        source
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to set configuration ${path}`, error);
      return false;
    }
  }

  /**
   * Update multiple configuration values atomically
   */
  async updateBatch(updates: Record<string, any>, source: 'runtime' | 'user' = 'runtime'): Promise<boolean> {
    const rollbackData: Array<{ path: string; oldValue: any }> = [];
    
    try {
      // Validate all updates first
      for (const [path, value] of Object.entries(updates)) {
        const validation = await this.validateValue(path, value);
        if (!validation.valid) {
          this.logger.error(`Batch update validation failed for ${path}`, validation.errors);
          return false;
        }
      }

      // Apply all updates
      for (const [path, value] of Object.entries(updates)) {
        const oldValue = this.get(path);
        rollbackData.push({ path, oldValue });

        const configValue: ConfigValue = {
          value,
          source,
          timestamp: Date.now(),
          validated: true
        };

        this.config.set(path, configValue);
      }

      // Emit batch change event
      this.emit('configBatchChanged', {
        updates,
        source,
        timestamp: Date.now()
      });

      this.logger.info(`Batch configuration update applied`, {
        count: Object.keys(updates).length,
        source
      });

      return true;
    } catch (error) {
      // Rollback changes
      for (const { path, oldValue } of rollbackData) {
        if (oldValue !== undefined) {
          await this.set(path, oldValue, 'runtime');
        } else {
          this.config.delete(path);
        }
      }
      
      this.logger.error('Batch configuration update failed, rolled back', error);
      return false;
    }
  }

  /**
   * Reset configuration value to default
   */
  async resetToDefault(path: string): Promise<boolean> {
    const defaultValue = this.getDefaultValue(path);
    if (defaultValue !== undefined) {
      return await this.set(path, defaultValue, 'runtime');
    }
    return false;
  }

  /**
   * Get configuration with metadata
   */
  getConfigInfo(path: string): ConfigValue | undefined {
    return this.config.get(path);
  }

  /**
   * Get all configuration as object
   */
  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [path, configValue] of this.config.entries()) {
      this.setNestedValue(result, path, configValue.value);
    }
    return result;
  }

  /**
   * Get all configuration with metadata
   */
  getAllWithMetadata(): Record<string, ConfigValue> {
    return Object.fromEntries(this.config.entries());
  }

  /**
   * Validate specific configuration value
   */
  async validateValue(path: string, value: any): Promise<ConfigValidationResult> {
    const schema = this.getSchemaForPath(path);
    if (!schema) {
      return {
        valid: true,
        errors: [],
        warnings: [{ path, message: 'No schema defined for this path', value }]
      };
    }

    return this.validateValueAgainstSchema(path, value, schema);
  }

  /**
   * Validate all configuration
   */
  async validateAll(): Promise<ConfigValidationResult> {
    const errors: ConfigValidationResult['errors'] = [];
    const warnings: ConfigValidationResult['warnings'] = [];

    for (const [path, configValue] of this.config.entries()) {
      const validation = await this.validateValue(path, configValue.value);
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Export configuration
   */
  async exportConfig(format: 'json' | 'yaml' = 'yaml', includeSensitive = false): Promise<string> {
    const config = this.getAll();
    
    if (!includeSensitive) {
      this.removeSensitiveValues(config);
    }

    if (format === 'json') {
      return JSON.stringify(config, null, 2);
    } else {
      return YAML.stringify(config);
    }
  }

  /**
   * Import configuration from string
   */
  async importConfig(configString: string, format: 'json' | 'yaml' = 'yaml', source: 'runtime' | 'user' = 'user'): Promise<boolean> {
    try {
      let config: any;
      
      if (format === 'json') {
        config = JSON.parse(configString);
      } else {
        config = YAML.parse(configString);
      }

      const flatConfig = this.flattenConfig(config);
      return await this.updateBatch(flatConfig, source);
    } catch (error) {
      this.logger.error('Failed to import configuration', error);
      return false;
    }
  }

  /**
   * Watch configuration path for changes
   */
  watch(path: string, callback: (event: ConfigUpdateEvent) => void): () => void {
    const listener = (event: ConfigUpdateEvent) => {
      if (event.path === path || event.path.startsWith(path + '.')) {
        callback(event);
      }
    };

    this.on('configChanged', listener);
    
    // Return unsubscribe function
    return () => {
      this.off('configChanged', listener);
    };
  }

  /**
   * Get configuration schema
   */
  getSchema(): ConfigDefinition {
    return this.schema;
  }

  /**
   * Update configuration schema
   */
  async updateSchema(newSchema: ConfigDefinition): Promise<void> {
    this.schema = { ...this.schema, ...newSchema };
    
    // Revalidate all configuration
    const validation = await this.validateAll();
    if (!validation.valid) {
      this.logger.warn('Schema update caused validation issues', {
        errors: validation.errors.length,
        warnings: validation.warnings.length
      });
    }

    this.emit('schemaUpdated', { schema: this.schema });
  }

  /**
   * Get configuration statistics
   */
  getStats(): {
    totalKeys: number;
    sourceBreakdown: Record<string, number>;
    validationStatus: { valid: number; invalid: number };
    lastUpdated: number;
  } {
    const sourceBreakdown: Record<string, number> = {};
    let validCount = 0;
    let invalidCount = 0;
    let lastUpdated = 0;

    for (const configValue of this.config.values()) {
      sourceBreakdown[configValue.source] = (sourceBreakdown[configValue.source] || 0) + 1;
      
      if (configValue.validated) {
        validCount++;
      } else {
        invalidCount++;
      }

      if (configValue.timestamp > lastUpdated) {
        lastUpdated = configValue.timestamp;
      }
    }

    return {
      totalKeys: this.config.size,
      sourceBreakdown,
      validationStatus: { valid: validCount, invalid: invalidCount },
      lastUpdated
    };
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    // Close file watchers
    for (const watcher of this.watchers.values()) {
      await watcher.close();
    }
    this.watchers.clear();

    // Clear configuration
    this.config.clear();

    this.logger.info('Configuration manager disposed');
    this.emit('disposed');
  }

  private async loadDefaults(): Promise<void> {
    const defaults = this.extractDefaultsFromSchema(this.schema);
    for (const [path, value] of Object.entries(defaults)) {
      this.config.set(path, {
        value,
        source: 'default',
        timestamp: Date.now(),
        validated: true
      });
    }
  }

  private async loadConfigFiles(): Promise<void> {
    for (const configPath of this.configPaths) {
      try {
        await this.loadConfigFile(configPath);
      } catch (error) {
        this.logger.warn(`Failed to load config file: ${configPath}`, error);
      }
    }
  }

  private async loadConfigFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = filePath.toLowerCase().split('.').pop();
      
      let config: any;
      if (ext === 'json') {
        config = JSON.parse(content);
      } else if (ext === 'yaml' || ext === 'yml') {
        config = YAML.parse(content);
      } else {
        throw new Error(`Unsupported config file format: ${ext}`);
      }

      const flatConfig = this.flattenConfig(config);
      for (const [path, value] of Object.entries(flatConfig)) {
        this.config.set(path, {
          value,
          source: 'file',
          timestamp: Date.now(),
          validated: false
        });
      }

      this.logger.debug(`Loaded config file: ${filePath}`, {
        keys: Object.keys(flatConfig).length
      });
    } catch (error) {
      this.logger.error(`Failed to load config file: ${filePath}`, error);
      throw error;
    }
  }

  private async loadEnvironmentVariables(): Promise<void> {
    const envPrefix = 'CLAUDE_ORCHESTRATOR_';
    let count = 0;

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(envPrefix)) {
        const configPath = key
          .substring(envPrefix.length)
          .toLowerCase()
          .replace(/_/g, '.');

        // Parse environment variable value
        const parsedValue = this.parseEnvValue(value || '');

        this.config.set(configPath, {
          value: parsedValue,
          source: 'env',
          timestamp: Date.now(),
          validated: false
        });

        count++;
      }
    }

    if (count > 0) {
      this.logger.debug(`Loaded ${count} environment variables`);
    }
  }

  private async setupFileWatchers(): Promise<void> {
    for (const configPath of this.configPaths) {
      try {
        const watcher = watch(configPath, async (eventType) => {
          if (eventType === 'change') {
            this.logger.info(`Config file changed: ${configPath}`);
            try {
              await this.loadConfigFile(configPath);
              this.emit('configFileChanged', { filePath: configPath });
            } catch (error) {
              this.logger.error(`Failed to reload config file: ${configPath}`, error);
            }
          }
        });

        this.watchers.set(configPath, watcher);
      } catch (error) {
        this.logger.warn(`Failed to watch config file: ${configPath}`, error);
      }
    }
  }

  private parseEnvValue(value: string): any {
    // Try to parse as JSON first
    if (value.startsWith('{') || value.startsWith('[') || value === 'true' || value === 'false' || value === 'null') {
      try {
        return JSON.parse(value);
      } catch {
        // Fall through to string parsing
      }
    }

    // Try to parse as number
    const num = Number(value);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }

    // Return as string
    return value;
  }

  private extractDefaultsFromSchema(schema: ConfigDefinition, prefix = ''): Record<string, any> {
    const defaults: Record<string, any> = {};

    for (const [key, schemaValue] of Object.entries(schema)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;

      if ('type' in schemaValue) {
        if (schemaValue.default !== undefined) {
          defaults[fullPath] = schemaValue.default;
        }
      } else {
        // Nested object
        Object.assign(defaults, this.extractDefaultsFromSchema(schemaValue, fullPath));
      }
    }

    return defaults;
  }

  private flattenConfig(config: any, prefix = ''): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(config)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this.flattenConfig(value, fullPath));
      } else {
        result[fullPath] = value;
      }
    }

    return result;
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  private getSchemaForPath(path: string): ConfigSchema | undefined {
    const keys = path.split('.');
    let current: ConfigDefinition | ConfigSchema = this.schema;

    for (const key of keys) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }

      if ('type' in current) {
        return undefined; // Can't go deeper into a schema leaf
      }

      current = current[key];
    }

    return current && 'type' in current ? current as ConfigSchema : undefined;
  }

  private getDefaultValue(path: string): any {
    const schema = this.getSchemaForPath(path);
    return schema?.default;
  }

  private async validateValueAgainstSchema(path: string, value: any, schema: ConfigSchema): Promise<ConfigValidationResult> {
    const errors: ConfigValidationResult['errors'] = [];
    const warnings: ConfigValidationResult['warnings'] = [];

    // Check required
    if (schema.required && (value === undefined || value === null)) {
      errors.push({
        path,
        message: 'Required value is missing',
        value
      });
      return { valid: false, errors, warnings };
    }

    if (value === undefined || value === null) {
      return { valid: true, errors, warnings };
    }

    // Check type
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== schema.type) {
      errors.push({
        path,
        message: `Expected type ${schema.type}, got ${actualType}`,
        value
      });
    }

    // Check range for numbers
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        errors.push({
          path,
          message: `Value ${value} is below minimum ${schema.min}`,
          value
        });
      }
      if (schema.max !== undefined && value > schema.max) {
        errors.push({
          path,
          message: `Value ${value} is above maximum ${schema.max}`,
          value
        });
      }
    }

    // Check enum
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        value
      });
    }

    // Custom validation
    if (schema.validation) {
      const result = schema.validation(value);
      if (typeof result === 'string') {
        errors.push({
          path,
          message: result,
          value
        });
      } else if (!result) {
        errors.push({
          path,
          message: 'Custom validation failed',
          value
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private removeSensitiveValues(config: any): void {
    const removeRecursive = (obj: any, path = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        const schema = this.getSchemaForPath(fullPath);
        
        if (schema?.sensitive) {
          obj[key] = '***REDACTED***';
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
          removeRecursive(value, fullPath);
        }
      }
    };

    removeRecursive(config);
  }
}