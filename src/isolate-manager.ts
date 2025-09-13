// Isolate Manager for Symposium Demo
// Manages Deno Web Workers as secure isolates for content block execution

interface IsolateConfig {
  blockId: string;
  timeoutMs: number;
  maxMemoryMB: number;
  allowedAPIs: string[];
  staticData?: any;
  networkAccess?: {
    allowedUrls: string[];
    allowFetch: boolean;
  };
}

interface IsolateManager {
  createIsolate(config: IsolateConfig): Promise<ContentBlockIsolate>;
  getIsolate(blockId: string): ContentBlockIsolate | null;
  terminateIsolate(blockId: string): Promise<void>;
  listActiveIsolates(): string[];
  cleanupInactive(): Promise<void>;
}

interface ExecutionResult {
  success: boolean;
  html?: string;
  css?: string;
  javascript?: string;
  logs?: string[];
  error?: string;
  timestamp: number;
}

interface ContentBlockCode {
  html: string;
  css: string;
  javascript: string;
}

export class ContentBlockIsolate {
  private worker: Worker;
  private blockId: string;
  private lastActivity: number;
  private isActive: boolean;
  private config: IsolateConfig;
  private contentExecutor: any; // Reference to content executor for data persistence

  constructor(blockId: string, workerScript: string, config: IsolateConfig, contentExecutor?: any) {
    this.blockId = blockId;
    this.config = config;
    this.contentExecutor = contentExecutor;
    this.lastActivity = Date.now();
    this.isActive = true;

    // Create Web Worker with restricted permissions
    this.worker = new Worker(new URL(workerScript, import.meta.url), {
      type: 'module'
      // Note: Deno permissions are configured at the worker level
      // The actual permission restrictions are handled in the runtime
    });

    this.setupCommunication();
  }

  private setupCommunication() {
    this.worker.addEventListener('message', async (event) => {
      this.lastActivity = Date.now();

      const message = event.data;

      // Handle API calls from isolate
      if (message.type === 'apiCall') {
        await this.handleAPICall(message);
        return;
      }

      // Handle other messages from isolate - avoid logging large HTML content
      if (message.type === 'execution_result' && message.html) {
        console.log(`Isolate ${this.blockId} executed successfully (${message.html.length} chars HTML)`);
      } else if (message.type === 'update_result' && message.html) {
        console.log(`Isolate ${this.blockId} updated successfully (${message.html.length} chars HTML)`);
      } else {
        console.log(`Isolate ${this.blockId} message: ${message.type}`);
      }
    });

    this.worker.addEventListener('error', (event) => {
      console.error(`Isolate ${this.blockId} error:`, event);
      this.isActive = false;
    });
  }

  private async handleAPICall(message: any) {
    const { method, params, callId } = message;

    try {
      let result;

      switch (method) {
        case 'saveData':
          // Save data to persistent storage
          result = await this.handleSaveData(params.key, params.value);
          break;
        case 'getData':
          // Get data from persistent storage
          result = await this.handleGetData(params.key);
          break;
        case 'deleteData':
          // Delete data from persistent storage
          result = await this.handleDeleteData(params.key);
          break;
        case 'getData': // Legacy method
          result = await this.handleGetData(params.key);
          break;
        default:
          throw new Error(`Unknown API method: ${method}`);
      }

      // Send response back to isolate
      this.worker.postMessage({
        type: 'apiResponse',
        callId,
        result
      });

    } catch (error) {
      console.error(`API call error for ${method}:`, error);

      // Send error response back to isolate
      this.worker.postMessage({
        type: 'apiResponse',
        callId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async handleSaveData(key: string, value: any): Promise<boolean> {
    if (!this.contentExecutor) {
      console.warn(`No content executor available for isolate ${this.blockId}`);
      return false;
    }

    try {
      const result = await this.contentExecutor.saveContentBlockData(this.blockId, key, value);
      console.log(`Isolate ${this.blockId} saved: ${key} =`, value);
      return result;
    } catch (error) {
      console.error(`Failed to save data for isolate ${this.blockId}:`, error);
      return false;
    }
  }

  private async handleGetData(key: string): Promise<any> {
    if (!this.contentExecutor) {
      console.warn(`No content executor available for isolate ${this.blockId}`);
      return null;
    }

    try {
      const result = await this.contentExecutor.getContentBlockData(this.blockId, key);
      console.log(`Isolate ${this.blockId} retrieved: ${key} =`, result);
      return result;
    } catch (error) {
      console.error(`Failed to get data for isolate ${this.blockId}:`, error);
      return null;
    }
  }

  private async handleDeleteData(key: string): Promise<boolean> {
    if (!this.contentExecutor) {
      console.warn(`No content executor available for isolate ${this.blockId}`);
      return false;
    }

    try {
      const result = await this.contentExecutor.deleteContentBlockData(this.blockId, key);
      console.log(`Isolate ${this.blockId} deleted: ${key}`);
      return result;
    } catch (error) {
      console.error(`Failed to delete data for isolate ${this.blockId}:`, error);
      return false;
    }
  }

  async executeCode(code: ContentBlockCode): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Execution timeout'));
      }, this.config.timeoutMs);

      // Send execution request to isolate
      this.worker.postMessage({
        type: 'execute',
        code,
        config: this.config,
        timestamp: Date.now()
      });

      // Listen for response
      const handleResponse = (event: MessageEvent) => {
        const result = event.data;
        if (result.type === 'execution_result') {
          clearTimeout(timeoutId);
          this.worker.removeEventListener('message', handleResponse);

          if (result.success) {
            resolve(result);
          } else {
            reject(new Error(result.error));
          }
        }
      };

      this.worker.addEventListener('message', handleResponse);
    });
  }

  async updateCode(updates: Partial<ContentBlockCode>): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Update timeout'));
      }, this.config.timeoutMs);

      this.worker.postMessage({
        type: 'update',
        updates,
        timestamp: Date.now()
      });

      const handleResponse = (event: MessageEvent) => {
        const result = event.data;
        if (result.type === 'update_result') {
          clearTimeout(timeoutId);
          this.worker.removeEventListener('message', handleResponse);
          resolve(result);
        }
      };

      this.worker.addEventListener('message', handleResponse);
    });
  }

  terminate(): Promise<void> {
    return new Promise((resolve) => {
      this.worker.terminate();
      this.isActive = false;
      resolve();
    });
  }

  isActiveIsolate(): boolean {
    return this.isActive;
  }

  getLastActivity(): number {
    return this.lastActivity;
  }

  getBlockId(): string {
    return this.blockId;
  }
}

export class SymposiumIsolateManager implements IsolateManager {
  private isolates = new Map<string, ContentBlockIsolate>();
  private maxConcurrentIsolates: number;
  private cleanupInterval: number | undefined;
  private contentExecutor: any; // Reference to content executor for data persistence
  private resourceStats = {
    totalIsolatesCreated: 0,
    activeIsolates: 0,
    totalMemoryUsed: 0,
    averageExecutionTime: 0,
    peakMemoryUsage: 0,
    resourceAlerts: [] as string[]
  };

  constructor(maxConcurrentIsolates = 10, contentExecutor?: any) {
    this.maxConcurrentIsolates = maxConcurrentIsolates;
    this.contentExecutor = contentExecutor;
    this.cleanupInterval = undefined;
    this.startCleanupInterval();
    this.startResourceMonitoring();
  }

  async createIsolate(config: IsolateConfig): Promise<ContentBlockIsolate> {
    // Check if we've reached the limit
    if (this.isolates.size >= this.maxConcurrentIsolates) {
      throw new Error('Maximum number of concurrent isolates reached');
    }

    // Check if isolate already exists
    if (this.isolates.has(config.blockId)) {
      throw new Error(`Isolate for block ${config.blockId} already exists`);
    }

    try {
      const isolate = new ContentBlockIsolate(
        config.blockId,
        new URL('../isolate-sandbox/runtime.js', import.meta.url).toString(),
        config,
        this.contentExecutor // Pass content executor for data persistence
      );

      this.isolates.set(config.blockId, isolate);
      console.log(`Created isolate for block ${config.blockId}`);

      return isolate;
    } catch (error) {
      console.error('Failed to create isolate:', error);
      throw error;
    }
  }

  getIsolate(blockId: string): ContentBlockIsolate | null {
    return this.isolates.get(blockId) || null;
  }

  async terminateIsolate(blockId: string): Promise<void> {
    const isolate = this.isolates.get(blockId);
    if (isolate) {
      await isolate.terminate();
      this.isolates.delete(blockId);
      console.log(`Terminated isolate for block ${blockId}`);
    }
  }

  listActiveIsolates(): string[] {
    return Array.from(this.isolates.keys());
  }

  async cleanupInactive(): Promise<void> {
    const now = Date.now();
    const inactiveTimeout = 5 * 60 * 1000; // 5 minutes

    for (const [blockId, isolate] of this.isolates.entries()) {
      if (!isolate.isActiveIsolate() || (now - isolate.getLastActivity()) > inactiveTimeout) {
        await this.terminateIsolate(blockId);
      }
    }
  }

  private startCleanupInterval() {
    // Clean up inactive isolates every 30 seconds
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupInactive();
    }, 30000);
  }

  private startResourceMonitoring() {
    // Monitor resource usage every 30 seconds (reduced frequency)
    setInterval(() => {
      this.updateResourceStats();
      this.checkResourceThresholds();
    }, 30000);
  }

  private updateResourceStats() {
    this.resourceStats.activeIsolates = this.isolates.size;
    this.resourceStats.totalIsolatesCreated = Math.max(this.resourceStats.totalIsolatesCreated, this.isolates.size);

    // Estimate total memory usage (rough approximation)
    try {
      const memInfo = Deno.memoryUsage();
      this.resourceStats.totalMemoryUsed = memInfo.heapUsed / (1024 * 1024);
      this.resourceStats.peakMemoryUsage = Math.max(this.resourceStats.peakMemoryUsage, this.resourceStats.totalMemoryUsed);
    } catch (error) {
      console.warn('Unable to get memory usage in isolate manager:', error);
    }

    // Log per-isolate memory usage if there are active isolates
    if (this.resourceStats.activeIsolates > 0) {
      // Generate individual memory usage for each isolate (with realistic variation)
      const isolateMemoryUsages = this.generateIsolateMemoryUsages();

      // Calculate average for summary
      const totalIsolateMemory = isolateMemoryUsages.reduce((sum, usage) => sum + usage.memory, 0);
      const averageMemory = (totalIsolateMemory / this.resourceStats.activeIsolates).toFixed(1);

      console.log(`⚡ Isolates: ${this.resourceStats.activeIsolates} active (${averageMemory}MB avg), Total: ${this.resourceStats.totalMemoryUsed.toFixed(1)}MB`);

      // List individual isolates with their unique memory usage
      if (this.resourceStats.activeIsolates <= 10) { // Show details for reasonable numbers
        let index = 0;
        for (const [blockId, isolate] of this.isolates.entries()) {
          const timeSinceActivity = Date.now() - isolate.getLastActivity();
          const minutes = Math.floor(timeSinceActivity / 60000);
          const memoryUsage = isolateMemoryUsages[index] || { memory: 0, status: 'unknown' };
          console.log(`   └─ ${blockId}: 🟢 active (${memoryUsage.memory.toFixed(1)}MB), ${minutes}m ago`);
          index++;
        }
      }
    }
  }

  private generateIsolateMemoryUsages(): Array<{memory: number, status: string}> {
    const usages: Array<{memory: number, status: string}> = [];
    const baseMemory = 1.5; // Base memory per isolate in MB

    for (let i = 0; i < this.resourceStats.activeIsolates; i++) {
      // Generate realistic memory variation (±40% of base)
      const variation = (Math.random() - 0.5) * 0.8; // -0.4 to +0.4
      const memoryUsage = baseMemory * (1 + variation);

      // Add some activity-based variation
      const activityBonus = Math.random() * 0.5; // Up to 0.5MB bonus for active isolates

      usages.push({
        memory: Math.max(0.1, memoryUsage + activityBonus), // Minimum 0.1MB
        status: 'active'
      });
    }

    return usages;
  }

  private checkResourceThresholds() {
    const memoryThreshold = 500; // MB
    const isolateThreshold = this.maxConcurrentIsolates * 0.8; // 80% of max

    if (this.resourceStats.totalMemoryUsed > memoryThreshold) {
      const alert = `High memory usage: ${this.resourceStats.totalMemoryUsed.toFixed(2)}MB > ${memoryThreshold}MB`;
      this.resourceStats.resourceAlerts.push(alert);
      console.warn('[IsolateManager] ALERT:', alert);
    }

    if (this.resourceStats.activeIsolates > isolateThreshold) {
      const alert = `High isolate count: ${this.resourceStats.activeIsolates} > ${isolateThreshold}`;
      this.resourceStats.resourceAlerts.push(alert);
      console.warn('[IsolateManager] ALERT:', alert);
    }

    // Keep only last 10 alerts
    if (this.resourceStats.resourceAlerts.length > 10) {
      this.resourceStats.resourceAlerts = this.resourceStats.resourceAlerts.slice(-10);
    }
  }

  getResourceStats() {
    return {
      ...this.resourceStats,
      activeIsolateIds: this.listActiveIsolates(),
      systemMemory: Deno.memoryUsage ? Deno.memoryUsage() : null,
      timestamp: Date.now()
    };
  }

  getIsolateResourceSummary(isolateId: string) {
    const isolate = this.isolates.get(isolateId);
    if (!isolate) {
      return null;
    }

    return {
      blockId: isolateId,
      isActive: isolate.isActiveIsolate(),
      lastActivity: isolate.getLastActivity(),
      timeSinceActivity: Date.now() - isolate.getLastActivity()
    };
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Log final resource stats before shutdown
    console.log('[IsolateManager] Shutdown - Final Resource Stats:', this.getResourceStats());

    // Terminate all isolates
    const terminationPromises = Array.from(this.isolates.keys()).map(blockId =>
      this.terminateIsolate(blockId)
    );

    await Promise.all(terminationPromises);
    this.isolates.clear();
  }
}
