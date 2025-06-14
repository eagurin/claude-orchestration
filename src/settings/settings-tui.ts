import { EventEmitter } from 'events';
import * as blessed from 'blessed';
import { ConfigManager, ConfigValidationResult } from './config-manager.js';
import { SettingsUI, SettingsGroup, UIComponent } from './settings-ui.js';
import { EnvironmentConfig } from './environment-config.js';
import { Logger } from '../utils/logger.js';

export interface TUIState {
  activeGroup: string;
  selectedComponent: string;
  showHelp: boolean;
  searchMode: boolean;
  searchQuery: string;
  showAdvanced: boolean;
  unsavedChanges: boolean;
}

/**
 * Terminal User Interface for Settings Management
 * Inspired by claude-squad's TUI approach with tmux-like navigation
 */
export class SettingsTUI extends EventEmitter {
  private logger: Logger;
  private configManager: ConfigManager;
  private settingsUI: SettingsUI;
  private screen: blessed.Widgets.Screen;
  private state: TUIState;
  private components: Map<string, blessed.Widgets.Node> = new Map();
  private currentValues: Map<string, any> = new Map();
  private validationErrors: Map<string, string> = new Map();

  // Layout components
  private sidebar!: blessed.Widgets.ListElement;
  private mainPanel!: blessed.Widgets.BoxElement;
  private statusBar!: blessed.Widgets.BoxElement;
  private helpPanel!: blessed.Widgets.BoxElement;
  private searchBox!: blessed.Widgets.TextboxElement;

  constructor(configManager: ConfigManager, settingsUI: SettingsUI) {
    super();
    this.logger = new Logger('SettingsTUI');
    this.configManager = configManager;
    this.settingsUI = settingsUI;
    this.state = {
      activeGroup: 'orchestrator',
      selectedComponent: '',
      showHelp: false,
      searchMode: false,
      searchQuery: '',
      showAdvanced: false,
      unsavedChanges: false
    };
    
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Claude Orchestration Settings',
      dockBorders: true,
      fullUnicode: true,
      autoPadding: true
    });

    this.initializeComponents();
    this.setupKeybindings();
    this.setupEventHandlers();
  }

  /**
   * Start the TUI interface
   */
  async start(): Promise<void> {
    try {
      this.logger.info('Starting Settings TUI');
      
      // Load initial data
      await this.refreshData();
      
      // Render interface
      this.render();
      
      // Focus screen
      this.screen.render();
      this.sidebar.focus();
      
      this.logger.info('Settings TUI started successfully');
      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start Settings TUI', error);
      throw error;
    }
  }

  /**
   * Stop the TUI interface
   */
  async stop(): Promise<void> {
    this.screen.destroy();
    this.logger.info('Settings TUI stopped');
    this.emit('stopped');
  }

  /**
   * Handle screen resize
   */
  resize(): void {
    this.screen.alloc();
    this.render();
  }

  private initializeComponents(): void {
    // Sidebar for settings groups
    this.sidebar = blessed.list({
      parent: this.screen,
      label: ' Settings Groups ',
      top: 0,
      left: 0,
      width: '25%',
      height: '90%',
      border: {
        type: 'line'
      },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'blue', fg: 'white' },
        item: 'white',
        label: 'cyan'
      },
      keys: true,
      vi: true,
      mouse: true,
      tags: true
    });

    // Main panel for settings
    this.mainPanel = blessed.box({
      parent: this.screen,
      label: ' Configuration ',
      top: 0,
      left: '25%',
      width: '75%',
      height: '90%',
      border: {
        type: 'line'
      },
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan' }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      tags: true
    });

    // Status bar
    this.statusBar = blessed.box({
      parent: this.screen,
      top: '90%',
      left: 0,
      width: '100%',
      height: '10%',
      border: {
        type: 'line'
      },
      style: {
        border: { fg: 'yellow' },
        bg: 'black',
        fg: 'white'
      },
      tags: true
    });

    // Help panel (initially hidden)
    this.helpPanel = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      border: {
        type: 'line'
      },
      style: {
        border: { fg: 'green' },
        bg: 'black',
        fg: 'white'
      },
      hidden: true,
      tags: true,
      scrollable: true,
      label: ' Help - Press ESC to close '
    });

    // Search box (initially hidden)
    this.searchBox = blessed.textbox({
      parent: this.screen,
      top: 1,
      left: 'center',
      width: '50%',
      height: 3,
      border: {
        type: 'line'
      },
      style: {
        border: { fg: 'yellow' },
        bg: 'black',
        fg: 'white'
      },
      hidden: true,
      tags: true,
      label: ' Search Settings '
    });
  }

  private setupKeybindings(): void {
    // Global keybindings
    this.screen.key(['escape', 'q', 'C-c'], () => {
      if (this.state.showHelp) {
        this.toggleHelp();
      } else if (this.state.searchMode) {
        this.toggleSearch();
      } else {
        this.confirmExit();
      }
    });

    this.screen.key(['h', '?'], () => {
      this.toggleHelp();
    });

    this.screen.key(['/', 'C-f'], () => {
      this.toggleSearch();
    });

    this.screen.key(['s', 'C-s'], () => {
      this.saveSettings();
    });

    this.screen.key(['r', 'C-r'], () => {
      this.resetGroup();
    });

    this.screen.key(['a'], () => {
      this.state.showAdvanced = !this.state.showAdvanced;
      this.refreshMainPanel();
    });

    this.screen.key(['tab'], () => {
      this.switchFocus();
    });

    // Sidebar keybindings
    this.sidebar.key(['enter'], () => {
      const selected = (this.sidebar as any).selected;
      if (selected >= 0) {
        const groups = this.settingsUI.getSettingsGroups();
        if (groups[selected]) {
          this.state.activeGroup = groups[selected].id;
          this.refreshMainPanel();
        }
      }
    });

    // Search box keybindings
    this.searchBox.key(['enter'], () => {
      this.performSearch();
    });

    this.searchBox.key(['escape'], () => {
      this.toggleSearch();
    });
  }

  private setupEventHandlers(): void {
    this.configManager.on('configChanged', () => {
      this.state.unsavedChanges = false;
      this.updateStatusBar();
    });

    this.settingsUI.on('settingChanged', () => {
      this.state.unsavedChanges = true;
      this.updateStatusBar();
    });

    this.settingsUI.on('validationError', (event: any) => {
      this.validationErrors.set(event.path, event.errors[0]?.message || 'Validation failed');
      this.updateStatusBar();
    });

    // Handle screen resize
    this.screen.on('resize', () => {
      this.resize();
    });
  }

  private async refreshData(): Promise<void> {
    await this.settingsUI.generateSettingsGroups();
    this.refreshSidebar();
    this.refreshMainPanel();
    this.updateStatusBar();
  }

  private refreshSidebar(): void {
    const groups = this.settingsUI.getSettingsGroups();
    const items = groups.map(group => {
      const icon = group.icon || '⚙️';
      const status = this.getGroupStatus(group.id);
      return `${icon} ${group.title} ${status}`;
    });

    this.sidebar.setItems(items);
    
    // Select active group
    const activeIndex = groups.findIndex(g => g.id === this.state.activeGroup);
    if (activeIndex >= 0) {
      this.sidebar.select(activeIndex);
    }
  }

  private refreshMainPanel(): void {
    this.mainPanel.setContent('');
    
    const group = this.settingsUI.getSettingsGroup(this.state.activeGroup);
    if (!group) {
      this.mainPanel.setContent('{center}No settings group selected{/center}');
      this.screen.render();
      return;
    }

    // Group header
    let content = `{bold}{cyan-fg}${group.icon} ${group.title}{/}\n`;
    if (group.description) {
      content += `{dim}${group.description}{/}\n\n`;
    }

    // Render components
    content += this.renderComponents(group.components, 0);

    this.mainPanel.setContent(content);
    this.screen.render();
  }

  private renderComponents(components: UIComponent[], indent: number): string {
    let content = '';
    const prefix = '  '.repeat(indent);

    for (const component of components) {
      if (component.type === 'group') {
        content += `${prefix}{bold}${component.label}{/}\n`;
        if (component.description) {
          content += `${prefix}{dim}${component.description}{/}\n`;
        }
        if (component.children) {
          content += this.renderComponents(component.children, indent + 1);
        }
        content += '\n';
      } else {
        // Skip advanced settings if not enabled
        if (!this.state.showAdvanced && this.isAdvancedSetting(component)) {
          continue;
        }

        content += this.renderComponent(component, prefix);
      }
    }

    return content;
  }

  private renderComponent(component: UIComponent, prefix: string): string {
    const value = this.settingsUI.getComponentValue(component.key);
    const error = this.settingsUI.getValidationError(component.key);
    const hasChanges = this.currentValues.has(component.key);
    
    let content = `${prefix}{bold}${component.label}{/}`;
    
    if (component.required) {
      content += ' {red-fg}*{/}';
    }
    
    if (hasChanges) {
      content += ' {yellow-fg}(modified){/}';
    }
    
    content += '\n';
    
    if (component.description) {
      content += `${prefix}  {dim}${component.description}{/}\n`;
    }
    
    // Render value based on type
    switch (component.type) {
      case 'checkbox':
        const checked = value ? '☑' : '☐';
        content += `${prefix}  ${checked} ${value ? 'Enabled' : 'Disabled'}\n`;
        break;
      
      case 'select':
        content += `${prefix}  Value: {cyan-fg}${value}{/}\n`;
        if (component.options) {
          content += `${prefix}  Options: ${component.options.map(o => o.label).join(', ')}\n`;
        }
        break;
      
      case 'slider':
        const min = component.min || 0;
        const max = component.max || 100;
        const percentage = ((value - min) / (max - min)) * 100;
        const bar = this.createProgressBar(percentage, 20);
        content += `${prefix}  ${bar} {cyan-fg}${value}{/} (${min}-${max})\n`;
        break;
      
      default:
        if (component.sensitive && value) {
          content += `${prefix}  Value: {dim}***hidden***{/}\n`;
        } else {
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          content += `${prefix}  Value: {cyan-fg}${displayValue}{/}\n`;
        }
    }
    
    if (error) {
      content += `${prefix}  {red-fg}Error: ${error}{/}\n`;
    }
    
    content += '\n';
    return content;
  }

  private createProgressBar(percentage: number, width: number): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private getGroupStatus(groupId: string): string {
    const group = this.settingsUI.getSettingsGroup(groupId);
    if (!group) return '';
    
    const hasErrors = this.hasGroupErrors(group);
    const hasChanges = this.hasGroupChanges(group);
    
    if (hasErrors) return '{red-fg}✗{/}';
    if (hasChanges) return '{yellow-fg}●{/}';
    return '{green-fg}✓{/}';
  }

  private hasGroupErrors(group: SettingsGroup): boolean {
    return this.getGroupComponentPaths(group).some(path => 
      this.validationErrors.has(path)
    );
  }

  private hasGroupChanges(group: SettingsGroup): boolean {
    return this.getGroupComponentPaths(group).some(path => 
      this.currentValues.has(path)
    );
  }

  private getGroupComponentPaths(group: SettingsGroup): string[] {
    const paths: string[] = [];
    
    const extractPaths = (components: UIComponent[]) => {
      for (const component of components) {
        if (component.type !== 'group') {
          paths.push(component.key);
        }
        if (component.children) {
          extractPaths(component.children);
        }
      }
    };
    
    extractPaths(group.components);
    return paths;
  }

  private isAdvancedSetting(component: UIComponent): boolean {
    // Consider settings advanced if they have certain keywords or are deeply nested
    const advancedKeywords = ['debug', 'timeout', 'advanced', 'experimental', 'internal'];
    const path = component.key.toLowerCase();
    
    return advancedKeywords.some(keyword => path.includes(keyword)) ||
           path.split('.').length > 3;
  }

  private updateStatusBar(): void {
    let content = '';
    
    // Left side - current group and status
    const group = this.settingsUI.getSettingsGroup(this.state.activeGroup);
    if (group) {
      content += `{bold}${group.title}{/}`;
    }
    
    // Middle - status indicators
    if (this.state.unsavedChanges) {
      content += ' {yellow-fg}● Unsaved changes{/}';
    }
    
    const errorCount = this.validationErrors.size;
    if (errorCount > 0) {
      content += ` {red-fg}✗ ${errorCount} errors{/}`;
    }
    
    if (this.state.showAdvanced) {
      content += ' {dim}[Advanced mode]{/}';
    }
    
    // Right side - keybindings
    content += '\n{dim}';
    content += 'TAB: Switch focus | ';
    content += 'ENTER: Edit | ';
    content += 'S: Save | ';
    content += 'R: Reset | ';
    content += 'A: Advanced | ';
    content += '/: Search | ';
    content += '?: Help | ';
    content += 'Q: Quit';
    content += '{/}';
    
    this.statusBar.setContent(content);
    this.screen.render();
  }

  private toggleHelp(): void {
    this.state.showHelp = !this.state.showHelp;
    
    if (this.state.showHelp) {
      const helpContent = this.generateHelpContent();
      this.helpPanel.setContent(helpContent);
      this.helpPanel.show();
      this.helpPanel.focus();
    } else {
      this.helpPanel.hide();
      this.sidebar.focus();
    }
    
    this.screen.render();
  }

  private generateHelpContent(): string {
    return `{center}{bold}Claude Orchestration Settings Help{/}{/}

{bold}Navigation:{/}
  ↑/↓ or j/k     Navigate items
  Enter          Select/Edit setting
  Tab            Switch between panels
  ESC            Cancel current action

{bold}Actions:{/}
  s              Save all changes
  r              Reset current group to defaults
  a              Toggle advanced settings view
  /              Search settings
  ?              Show/hide this help
  q              Quit (with confirmation if unsaved changes)

{bold}Setting Types:{/}
  ☑/☐            Checkbox - Use Enter to toggle
  [Select]       Dropdown - Use Enter to see options
  [Slider]       Number range - Use +/- or Enter to edit
  [Input]        Text input - Use Enter to edit

{bold}Status Indicators:{/}
  ✓              Group has no errors
  ●              Group has unsaved changes
  ✗              Group has validation errors
  *              Required setting

{bold}Tips:{/}
  • Use advanced mode (a) to see all configuration options
  • Search (/) to quickly find specific settings
  • Settings are validated in real-time
  • Use environment presets for quick configuration

{bold}Environments:{/}
  development    Minimal setup for local development
  testing        Optimized for automated testing
  staging        Pre-production configuration
  production     Full security and performance settings

Press ESC to close this help.`;
  }

  private toggleSearch(): void {
    this.state.searchMode = !this.state.searchMode;
    
    if (this.state.searchMode) {
      this.searchBox.show();
      this.searchBox.focus();
      this.searchBox.setValue('');
    } else {
      this.searchBox.hide();
      this.sidebar.focus();
      this.state.searchQuery = '';
    }
    
    this.screen.render();
  }

  private performSearch(): void {
    const query = this.searchBox.getValue();
    this.state.searchQuery = query;
    
    if (query.trim()) {
      const results = this.settingsUI.searchSettings(query);
      this.displaySearchResults(results);
    }
    
    this.toggleSearch();
  }

  private displaySearchResults(results: Array<{ group: any; component: UIComponent; path: string }>): void {
    if (results.length === 0) {
      this.mainPanel.setContent('{center}No settings found matching your search.{/center}');
      this.screen.render();
      return;
    }

    let content = `{bold}Search Results for "${this.state.searchQuery}"{/}\n\n`;
    
    for (const result of results) {
      content += `{bold}${result.group.title}{/} > {cyan-fg}${result.component.label}{/}\n`;
      content += `  Path: {dim}${result.path}{/}\n`;
      if (result.component.description) {
        content += `  ${result.component.description}\n`;
      }
      const value = this.settingsUI.getComponentValue(result.path);
      content += `  Current: {yellow-fg}${value}{/}\n\n`;
    }
    
    this.mainPanel.setContent(content);
    this.screen.render();
  }

  private async saveSettings(): Promise<void> {
    try {
      const success = await this.settingsUI.applyChanges();
      
      if (success) {
        this.currentValues.clear();
        this.validationErrors.clear();
        this.state.unsavedChanges = false;
        this.showNotification('Settings saved successfully!', 'success');
      } else {
        this.showNotification('Failed to save settings. Check for errors.', 'error');
      }
      
      this.updateStatusBar();
    } catch (error) {
      this.logger.error('Failed to save settings', error);
      this.showNotification('Error saving settings.', 'error');
    }
  }

  private async resetGroup(): Promise<void> {
    const confirmed = await this.showConfirmation(
      'Reset Group',
      `Reset all settings in "${this.state.activeGroup}" group to defaults?`
    );
    
    if (confirmed) {
      try {
        await this.settingsUI.resetToDefaults(this.state.activeGroup);
        this.refreshMainPanel();
        this.showNotification('Group reset to defaults.', 'success');
      } catch (error) {
        this.logger.error('Failed to reset group', error);
        this.showNotification('Failed to reset group.', 'error');
      }
    }
  }

  private switchFocus(): void {
    if ((this.sidebar as any).focused) {
      this.mainPanel.focus();
    } else {
      this.sidebar.focus();
    }
  }

  private confirmExit(): void {
    if (this.state.unsavedChanges) {
      this.showConfirmation(
        'Exit',
        'You have unsaved changes. Exit anyway?'
      ).then(confirmed => {
        if (confirmed) {
          process.exit(0);
        }
      });
    } else {
      process.exit(0);
    }
  }

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const colors = {
      success: 'green',
      error: 'red',
      info: 'blue'
    };
    
    const notification = blessed.message({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: { type: 'line' },
      style: {
        border: { fg: colors[type] },
        bg: 'black',
        fg: 'white'
      },
      tags: true
    });
    
    notification.display(`{${colors[type]}-fg}${message}{/}`, 3000, () => {
      notification.destroy();
      this.screen.render();
    });
  }

  private async showConfirmation(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const question = blessed.question({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: '60%',
        height: 'shrink',
        border: { type: 'line' },
        style: {
          border: { fg: 'yellow' },
          bg: 'black',
          fg: 'white'
        },
        tags: true,
        label: ` ${title} `
      });
      
      question.ask(`${message}\n\nPress 'y' for Yes, 'n' for No.`, (err, value) => {
        question.destroy();
        this.screen.render();
        resolve(value === 'y' || value === 'Y');
      });
    });
  }

  private render(): void {
    this.screen.render();
  }
}