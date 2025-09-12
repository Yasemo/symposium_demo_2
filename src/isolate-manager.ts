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
  data?: any;
}

export class ContentBlockIsolate {
  private worker: Worker;
  private blockId: string;
  private lastActivity: number;
  private isActive: boolean;
  private config: IsolateConfig;

  constructor(blockId: string, workerScript: string, config: IsolateConfig) {
    this.blockId = blockId;
    this.config = config;
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
    this.worker.addEventListener('message', (event) => {
      this.lastActivity = Date.now();
      // Handle messages from isolate
      console.log(`Isolate ${this.blockId} message:`, event.data);
    });

    this.worker.addEventListener('error', (event) => {
      console.error(`Isolate ${this.blockId} error:`, event);
      this.isActive = false;
    });
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

  constructor(maxConcurrentIsolates = 10) {
    this.maxConcurrentIsolates = maxConcurrentIsolates;
    this.cleanupInterval = undefined;
    this.startCleanupInterval();
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
        config
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

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Terminate all isolates
    const terminationPromises = Array.from(this.isolates.keys()).map(blockId =>
      this.terminateIsolate(blockId)
    );

    await Promise.all(terminationPromises);
    this.isolates.clear();
  }
}
