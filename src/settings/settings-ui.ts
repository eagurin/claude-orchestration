import { EventEmitter } from 'events';
import { ConfigManager, ConfigDefinition, ConfigValue, ConfigValidationResult } from './config-manager.js';
import { EnvironmentConfig } from './environment-config.js';
import { Logger } from '../utils/logger.js';

export interface UIComponent {
  type: 'input' | 'select' | 'checkbox' | 'slider' | 'textarea' | 'group';
  key: string;
  label: string;
  description?: string;
  value?: any;
  options?: Array<{ value: any; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  sensitive?: boolean;
  validation?: (value: any) => boolean | string;
  children?: UIComponent[];
}

export interface SettingsGroup {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  components: UIComponent[];
  priority: number;
}

export interface SettingsTheme {
  name: string;
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
}

export interface UIState {
  activeGroup: string;
  searchQuery: string;
  showAdvanced: boolean;
  theme: string;
  unsavedChanges: boolean;
  validationErrors: Record<string, string>;
}

/**
 * Settings UI Generator and Manager
 * Automatically generates web interface components from configuration schema
 */
export class SettingsUI extends EventEmitter {
  private logger: Logger;
  private configManager: ConfigManager;
  private settingsGroups: Map<string, SettingsGroup> = new Map();
  private uiState: UIState;
  private themes: SettingsTheme[];
  private pendingChanges: Map<string, any> = new Map();

  constructor(configManager: ConfigManager) {
    super();
    this.logger = new Logger('SettingsUI');
    this.configManager = configManager;
    this.uiState = {
      activeGroup: 'orchestrator',
      searchQuery: '',
      showAdvanced: false,
      theme: 'light',
      unsavedChanges: false,
      validationErrors: {}
    };
    this.themes = this.getDefaultThemes();
    this.setupEventHandlers();
  }

  /**
   * Initialize settings UI
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Settings UI');
      
      // Generate UI components from schema
      await this.generateSettingsGroups();
      
      // Load saved UI preferences
      await this.loadUIPreferences();
      
      this.logger.info('Settings UI initialized successfully');
      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Settings UI', error);
      throw error;
    }
  }

  /**
   * Generate settings groups from configuration schema
   */
  async generateSettingsGroups(): Promise<void> {
    const schema = this.configManager.getSchema();
    
    // Clear existing groups
    this.settingsGroups.clear();
    
    // Generate groups from schema
    for (const [groupKey, groupSchema] of Object.entries(schema)) {
      if (typeof groupSchema === 'object' && !('type' in groupSchema)) {
        const group = await this.createSettingsGroup(groupKey, groupSchema as ConfigDefinition);
        this.settingsGroups.set(groupKey, group);
      }
    }

    this.logger.debug('Generated settings groups', {
      count: this.settingsGroups.size,
      groups: Array.from(this.settingsGroups.keys())
    });
  }

  /**
   * Get all settings groups
   */
  getSettingsGroups(): SettingsGroup[] {
    return Array.from(this.settingsGroups.values()).sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get specific settings group
   */
  getSettingsGroup(groupId: string): SettingsGroup | undefined {
    return this.settingsGroups.get(groupId);
  }

  /**
   * Search settings by query
   */
  searchSettings(query: string): Array<{ group: SettingsGroup; component: UIComponent; path: string }> {
    const results: Array<{ group: SettingsGroup; component: UIComponent; path: string }> = [];
    const queryLower = query.toLowerCase();

    for (const group of this.settingsGroups.values()) {
      this.searchInComponents(group.components, group, '', queryLower, results);
    }

    return results.sort((a, b) => {
      // Prioritize exact matches in labels
      const aExact = a.component.label.toLowerCase().includes(queryLower);
      const bExact = b.component.label.toLowerCase().includes(queryLower);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });
  }

  /**
   * Get current UI state
   */
  getUIState(): UIState {
    return { ...this.uiState };
  }

  /**
   * Update UI state
   */
  updateUIState(updates: Partial<UIState>): void {
    const oldState = { ...this.uiState };
    this.uiState = { ...this.uiState, ...updates };
    
    this.emit('uiStateChanged', {
      oldState,
      newState: this.uiState,
      changes: updates
    });
  }

  /**
   * Get available themes
   */
  getThemes(): SettingsTheme[] {
    return this.themes;
  }

  /**
   * Apply theme
   */
  applyTheme(themeName: string): boolean {
    const theme = this.themes.find(t => t.name === themeName);
    if (!theme) {
      this.logger.warn(`Theme not found: ${themeName}`);
      return false;
    }

    this.updateUIState({ theme: themeName });
    this.emit('themeChanged', theme);
    return true;
  }

  /**
   * Add custom theme
   */
  addTheme(theme: SettingsTheme): void {
    const existingIndex = this.themes.findIndex(t => t.name === theme.name);
    if (existingIndex >= 0) {
      this.themes[existingIndex] = theme;
    } else {
      this.themes.push(theme);
    }
    
    this.emit('themeAdded', theme);
  }

  /**
   * Update setting value with validation
   */
  async updateSetting(path: string, value: any): Promise<boolean> {
    try {
      // Validate the value
      const validation = await this.configManager.validateValue(path, value);
      
      if (!validation.valid) {
        this.uiState.validationErrors[path] = validation.errors[0]?.message || 'Validation failed';
        this.emit('validationError', { path, errors: validation.errors });
        return false;
      }

      // Clear validation error
      delete this.uiState.validationErrors[path];
      
      // Store pending change
      this.pendingChanges.set(path, value);
      this.uiState.unsavedChanges = true;
      
      this.emit('settingChanged', { path, value, pending: true });
      return true;
    } catch (error) {
      this.logger.error(`Failed to update setting ${path}`, error);
      return false;
    }
  }

  /**
   * Apply all pending changes
   */
  async applyChanges(): Promise<boolean> {
    if (this.pendingChanges.size === 0) {
      return true;
    }

    try {
      const updates = Object.fromEntries(this.pendingChanges.entries());
      const success = await this.configManager.updateBatch(updates, 'user');
      
      if (success) {
        this.pendingChanges.clear();
        this.uiState.unsavedChanges = false;
        this.uiState.validationErrors = {};
        
        this.emit('changesApplied', { updates });
        this.logger.info('Settings changes applied successfully');
      }
      
      return success;
    } catch (error) {
      this.logger.error('Failed to apply settings changes', error);
      return false;
    }
  }

  /**
   * Discard pending changes
   */
  discardChanges(): void {
    this.pendingChanges.clear();
    this.uiState.unsavedChanges = false;
    this.uiState.validationErrors = {};
    
    this.emit('changesDiscarded');
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults(groupId?: string): Promise<boolean> {
    try {
      if (groupId) {
        // Reset specific group
        const group = this.settingsGroups.get(groupId);
        if (!group) {
          return false;
        }
        
        const paths = this.extractPathsFromComponents(group.components, groupId);
        for (const path of paths) {
          await this.configManager.resetToDefault(path);
        }
      } else {
        // Reset all settings
        const allConfigs = this.configManager.getAllWithMetadata();
        for (const [path] of Object.entries(allConfigs)) {
          await this.configManager.resetToDefault(path);
        }
      }
      
      this.pendingChanges.clear();
      this.uiState.unsavedChanges = false;
      this.uiState.validationErrors = {};
      
      this.emit('settingsReset', { groupId });
      return true;
    } catch (error) {
      this.logger.error('Failed to reset settings', error);
      return false;
    }
  }

  /**
   * Export settings as JSON
   */
  async exportSettings(includeDefaults = false): Promise<string> {
    const config = this.configManager.getAll();
    
    if (!includeDefaults) {
      // Filter out default values
      const filtered: any = {};
      const allConfigs = this.configManager.getAllWithMetadata();
      for (const [path, configValue] of Object.entries(allConfigs) as [string, any][]) {
        if (configValue.source !== 'default') {
          this.setNestedValue(filtered, path, configValue.value);
        }
      }
      return JSON.stringify(filtered, null, 2);
    }
    
    return JSON.stringify(config, null, 2);
  }

  /**
   * Import settings from JSON
   */
  async importSettings(jsonString: string): Promise<boolean> {
    try {
      const config = JSON.parse(jsonString);
      const flatConfig = this.flattenConfig(config);
      
      // Validate all settings first
      const validationPromises = Object.entries(flatConfig).map(async ([path, value]) => {
        const validation = await this.configManager.validateValue(path, value);
        return { path, value, validation };
      });
      
      const validations = await Promise.all(validationPromises);
      const errors = validations.filter(v => !v.validation.valid);
      
      if (errors.length > 0) {
        this.logger.error('Import validation failed', { errors: errors.length });
        return false;
      }
      
      // Apply settings
      return await this.configManager.updateBatch(flatConfig, 'user');
    } catch (error) {
      this.logger.error('Failed to import settings', error);
      return false;
    }
  }

  /**
   * Get component value with current/pending state
   */
  getComponentValue(path: string): any {
    // Check pending changes first
    if (this.pendingChanges.has(path)) {
      return this.pendingChanges.get(path);
    }
    
    // Return current value
    return this.configManager.get(path);
  }

  /**
   * Get validation error for path
   */
  getValidationError(path: string): string | undefined {
    return this.uiState.validationErrors[path];
  }

  /**
   * Generate configuration wizard steps
   */
  generateWizard(scenario: 'first-run' | 'quick-setup' | 'advanced'): Array<{
    id: string;
    title: string;
    description: string;
    components: UIComponent[];
  }> {
    const wizardSteps = {
      'first-run': [
        {
          id: 'basic',
          title: 'Basic Configuration',
          description: 'Essential settings to get started',
          paths: [
            'orchestrator.agents.maxAgents',
            'orchestrator.monitoring.logLevel',
            'claude.subscription.mode'
          ]
        },
        {
          id: 'patterns',
          title: 'Execution Patterns',
          description: 'Configure how agents work together',
          paths: [
            'orchestrator.patterns.swarm.enabled',
            'orchestrator.patterns.pipeline.enabled',
            'orchestrator.patterns.consensus.enabled'
          ]
        }
      ],
      'quick-setup': [
        {
          id: 'environment',
          title: 'Environment Setup',
          description: 'Choose your deployment environment',
          paths: [
            'orchestrator.agents.maxAgents',
            'orchestrator.monitoring.port',
            'security.authentication.enabled',
            'storage.type'
          ]
        }
      ],
      'advanced': [
        {
          id: 'performance',
          title: 'Performance Tuning',
          description: 'Optimize for your workload',
          paths: [
            'performance.cpu.maxCpuUsage',
            'performance.memory.maxMemoryUsage',
            'performance.network.maxConnections',
            'performance.cache.maxCacheSize'
          ]
        },
        {
          id: 'security',
          title: 'Security Configuration',
          description: 'Configure authentication and encryption',
          paths: [
            'security.authentication.enabled',
            'security.authentication.provider',
            'security.authorization.enabled',
            'security.encryption.enabled'
          ]
        }
      ]
    };

    const steps = wizardSteps[scenario] || wizardSteps['first-run'];
    
    return steps.map(step => ({
      ...step,
      components: this.generateComponentsForPaths(step.paths)
    }));
  }

  private async createSettingsGroup(groupKey: string, schema: ConfigDefinition): Promise<SettingsGroup> {
    const components = await this.generateComponents(schema, groupKey);
    
    const groupConfig = {
      orchestrator: {
        title: 'Orchestrator',
        description: 'Core orchestration and agent management settings',
        icon: '🎼',
        priority: 1
      },
      claude: {
        title: 'Claude Configuration',
        description: 'Claude AI integration and subscription settings',
        icon: '🤖',
        priority: 2
      },
      security: {
        title: 'Security',
        description: 'Authentication, authorization, and encryption settings',
        icon: '🔒',
        priority: 3
      },
      storage: {
        title: 'Storage',
        description: 'Data storage and backup configuration',
        icon: '💾',
        priority: 4
      },
      performance: {
        title: 'Performance',
        description: 'Resource usage and optimization settings',
        icon: '⚡',
        priority: 5
      },
      features: {
        title: 'Feature Flags',
        description: 'Enable or disable experimental features',
        icon: '🧪',
        priority: 6
      }
    };

    const config = groupConfig[groupKey as keyof typeof groupConfig] || {
      title: groupKey.charAt(0).toUpperCase() + groupKey.slice(1),
      description: `Configuration for ${groupKey}`,
      icon: '⚙️',
      priority: 10
    };

    return {
      id: groupKey,
      title: config.title,
      description: config.description,
      icon: config.icon,
      components,
      priority: config.priority
    };
  }

  private async generateComponents(schema: ConfigDefinition, prefix: string): Promise<UIComponent[]> {
    const components: UIComponent[] = [];

    for (const [key, schemaValue] of Object.entries(schema)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;

      if ('type' in schemaValue) {
        // Leaf configuration value
        const component = this.createUIComponent(key, fullPath, schemaValue);
        components.push(component);
      } else {
        // Nested group
        const childComponents = await this.generateComponents(schemaValue, fullPath);
        
        if (childComponents.length > 0) {
          const groupComponent: UIComponent = {
            type: 'group',
            key: fullPath,
            label: this.formatLabel(key),
            description: `Configuration group for ${key}`,
            children: childComponents
          };
          components.push(groupComponent);
        }
      }
    }

    return components;
  }

  private createUIComponent(key: string, path: string, schema: any): UIComponent {
    const baseComponent: UIComponent = {
      type: 'input',
      key: path,
      label: this.formatLabel(key),
      description: schema.description,
      value: this.configManager.get(path),
      required: schema.required,
      sensitive: schema.sensitive,
      validation: schema.validation
    };

    switch (schema.type) {
      case 'boolean':
        return { ...baseComponent, type: 'checkbox' };
      
      case 'number':
        return {
          ...baseComponent,
          type: schema.min !== undefined && schema.max !== undefined ? 'slider' : 'input',
          min: schema.min,
          max: schema.max,
          step: schema.step || 1
        };
      
      case 'string':
        if (schema.enum) {
          return {
            ...baseComponent,
            type: 'select',
            options: schema.enum.map((value: any) => ({
              value,
              label: this.formatLabel(String(value))
            }))
          };
        }
        
        if (schema.description && schema.description.includes('multiline')) {
          return { ...baseComponent, type: 'textarea' };
        }
        
        return baseComponent;
      
      case 'array':
        return {
          ...baseComponent,
          type: 'textarea',
          description: `${schema.description} (one per line)`
        };
      
      default:
        return baseComponent;
    }
  }

  private formatLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  private searchInComponents(
    components: UIComponent[],
    group: SettingsGroup,
    parentPath: string,
    query: string,
    results: Array<{ group: SettingsGroup; component: UIComponent; path: string }>
  ): void {
    for (const component of components) {
      const currentPath = parentPath ? `${parentPath}.${component.key}` : component.key;
      
      const matches = 
        component.label.toLowerCase().includes(query) ||
        (component.description && component.description.toLowerCase().includes(query)) ||
        component.key.toLowerCase().includes(query);
      
      if (matches && component.type !== 'group') {
        results.push({ group, component, path: currentPath });
      }
      
      if (component.children) {
        this.searchInComponents(component.children, group, currentPath, query, results);
      }
    }
  }

  private extractPathsFromComponents(components: UIComponent[], prefix: string): string[] {
    const paths: string[] = [];
    
    for (const component of components) {
      const fullPath = prefix ? `${prefix}.${component.key}` : component.key;
      
      if (component.type !== 'group') {
        paths.push(fullPath);
      }
      
      if (component.children) {
        paths.push(...this.extractPathsFromComponents(component.children, fullPath));
      }
    }
    
    return paths;
  }

  private generateComponentsForPaths(paths: string[]): UIComponent[] {
    const components: UIComponent[] = [];
    
    for (const path of paths) {
      const schema = this.getSchemaForPath(path);
      if (schema) {
        const key = path.split('.').pop() || path;
        const component = this.createUIComponent(key, path, schema);
        components.push(component);
      }
    }
    
    return components;
  }

  private getSchemaForPath(path: string): any {
    const schema = this.configManager.getSchema();
    const keys = path.split('.');
    let current: any = schema;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return 'type' in current ? current : undefined;
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

  private getDefaultThemes(): SettingsTheme[] {
    return [
      {
        name: 'light',
        primary: '#1976d2',
        secondary: '#dc004e',
        background: '#fafafa',
        surface: '#ffffff',
        text: '#212121',
        accent: '#ff5722'
      },
      {
        name: 'dark',
        primary: '#90caf9',
        secondary: '#f48fb1',
        background: '#121212',
        surface: '#1e1e1e',
        text: '#ffffff',
        accent: '#ff9800'
      },
      {
        name: 'claude',
        primary: '#7c3aed',
        secondary: '#06b6d4',
        background: '#f8fafc',
        surface: '#ffffff',
        text: '#1e293b',
        accent: '#f59e0b'
      }
    ];
  }

  private async loadUIPreferences(): Promise<void> {
    // Load from localStorage or configuration
    const savedTheme = this.configManager.get('ui.theme');
    if (savedTheme) {
      this.uiState.theme = savedTheme;
    }
    
    const savedActiveGroup = this.configManager.get('ui.activeGroup');
    if (savedActiveGroup) {
      this.uiState.activeGroup = savedActiveGroup;
    }
  }

  private setupEventHandlers(): void {
    this.configManager.on('configChanged', (event: any) => {
      // Update UI components when config changes
      this.emit('configUpdated', event);
    });
    
    // Auto-save UI preferences
    this.on('uiStateChanged', async (event: any) => {
      if (event.changes.theme) {
        await this.configManager.set('ui.theme', event.changes.theme, 'user');
      }
      if (event.changes.activeGroup) {
        await this.configManager.set('ui.activeGroup', event.changes.activeGroup, 'user');
      }
    });
  }
}