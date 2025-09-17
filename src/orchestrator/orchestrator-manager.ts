// Orchestrator Manager for Isolate Proxy System
// Central coordinator that manages all proxy capabilities

import { MessageBroker } from './message-broker.ts';
import { PermissionManager, PermissionLevel } from './permissions.ts';
import { CapabilityHandlerFactory } from './proxy-base.ts';
import { FileSystemHandler } from './handlers/file-system.ts';
import { NetworkHandler } from './handlers/network.ts';
import { CanvasHandler } from './handlers/canvas.ts';
import { DatabaseHandler } from './handlers/database.ts';
import { ProcessHandler } from './handlers/process.ts';
import { DOMHandler } from './handlers/dom.ts';
import { DatabaseManager } from '../database-manager.ts';
import { OrchestratorMessage } from './message-broker.ts';

export class OrchestratorManager {
  private messageBroker: MessageBroker;
  private permissionManager: PermissionManager;
  private databaseManager: DatabaseManager;
  private handlers = new Map<string, any>();
  private initialized = false;

  constructor(databaseManager: DatabaseManager) {
    this.messageBroker = new MessageBroker(databaseManager);
    this.permissionManager = new PermissionManager();
    this.databaseManager = databaseManager;

    // Set permission manager on message broker
    this.messageBroker.setPermissionManager(this.permissionManager);
  }

  // Initialize the orchestrator system
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[OrchestratorManager] Already initialized');
      return;
    }

    console.log('[OrchestratorManager] Initializing isolate orchestrator proxy system...');

    // Register capability handlers
    await this.registerCapabilityHandlers();

    // Initialize directories and resources
    await this.initializeResources();

    this.initialized = true;
    console.log('[OrchestratorManager] Orchestrator system initialized successfully');
  }

  // Register all capability handlers
  private async registerCapabilityHandlers(): Promise<void> {
    console.log('[OrchestratorManager] Registering capability handlers...');

    // File System Handler
    const fileSystemHandler = new FileSystemHandler(this.messageBroker, this.permissionManager);
    this.handlers.set('file', fileSystemHandler);

    // Register file operations with the message broker
    this.messageBroker.registerHandler('file.read', fileSystemHandler);
    this.messageBroker.registerHandler('file.write', fileSystemHandler);
    this.messageBroker.registerHandler('file.delete', fileSystemHandler);
    this.messageBroker.registerHandler('file.list', fileSystemHandler);
    this.messageBroker.registerHandler('file.info', fileSystemHandler);
    this.messageBroker.registerHandler('file.exists', fileSystemHandler);

    // Network Handler
    const networkHandler = new NetworkHandler(this.messageBroker, this.permissionManager);
    this.handlers.set('network', networkHandler);

    // Register network operations
    this.messageBroker.registerHandler('network.request', networkHandler);
    this.messageBroker.registerHandler('network.fetch', networkHandler);
    this.messageBroker.registerHandler('network.webhook', networkHandler);

    // Canvas Handler
    const canvasHandler = new CanvasHandler(this.messageBroker, this.permissionManager);
    this.handlers.set('canvas', canvasHandler);

    // Register canvas operations
    this.messageBroker.registerHandler('canvas.create', canvasHandler);
    this.messageBroker.registerHandler('canvas.draw', canvasHandler);
    this.messageBroker.registerHandler('canvas.export', canvasHandler);
    this.messageBroker.registerHandler('canvas.getInfo', canvasHandler);
    this.messageBroker.registerHandler('canvas.clear', canvasHandler);

    // Database Handler - Note: This will be created per-isolate
    // The actual handler creation happens when handling requests
    this.handlers.set('database', null); // Placeholder

    // Process Handler
    const processHandler = new ProcessHandler(this.messageBroker, this.permissionManager);
    this.handlers.set('process', processHandler);

    // Register process operations
    this.messageBroker.registerHandler('process.execute', processHandler);
    this.messageBroker.registerHandler('process.run', processHandler);
    this.messageBroker.registerHandler('process.getInfo', processHandler);

    // DOM Handler
    const domHandler = new DOMHandler(this.messageBroker, this.permissionManager);
    this.handlers.set('dom', domHandler);

    // Register DOM operations
    this.messageBroker.registerHandler('dom.parse', domHandler);
    this.messageBroker.registerHandler('dom.execute', domHandler);
    this.messageBroker.registerHandler('dom.update', domHandler);
    this.messageBroker.registerHandler('dom.inject_css', domHandler);
    this.messageBroker.registerHandler('dom.inject_js', domHandler);

    console.log('[OrchestratorManager] Registered handlers for operations:', [
      'file.*', 'network.*', 'canvas.*', 'database.*', 'process.*', 'dom.*'
    ]);
  }

  // Initialize required resources
  private async initializeResources(): Promise<void> {
    console.log('[OrchestratorManager] Initializing resources...');

    // Initialize file system directories
    const fileSystemHandler = this.handlers.get('file') as FileSystemHandler;
    if (fileSystemHandler) {
      await fileSystemHandler.initializeDirectories();
    }

    // TODO: Initialize other resources as needed
    // - Database connections
    // - Canvas libraries
    // - Network configurations
  }

  // Assign permissions to an isolate
  assignPermissions(isolateId: string, profile: PermissionLevel): void {
    this.permissionManager.assignPermissions(isolateId, profile);
    console.log(`[OrchestratorManager] Assigned ${profile} permissions to isolate ${isolateId}`);
  }

  // Update permissions for a specific block/isolate
  async updateBlockPermission(isolateId: string, profile: PermissionLevel): Promise<void> {
    // Remove existing permissions
    this.permissionManager.removePermissions(isolateId);

    // Assign new permissions
    this.permissionManager.assignPermissions(isolateId, profile);
    console.log(`[OrchestratorManager] Updated permissions for isolate ${isolateId} to ${profile}`);
  }

  // Handle incoming capability request from isolate
  async handleCapabilityRequest(
    isolateId: string,
    operation: string,
    payload: any
  ): Promise<any> {
    if (!this.initialized) {
      throw new Error('Orchestrator system not initialized');
    }

    console.log(`[OrchestratorManager] Processing capability request: ${operation} for isolate ${isolateId}`);

    try {
      // Send request through message broker
      const result = await this.messageBroker.sendRequest(isolateId, operation, payload);

      console.log(`[OrchestratorManager] Successfully processed ${operation} for isolate ${isolateId}`);
      return result;

    } catch (error) {
      console.error(`[OrchestratorManager] Failed to process ${operation} for isolate ${isolateId}:`, error);

      // Return error response
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        operation,
        isolateId
      };
    }
  }

  // Get permission profile for an isolate
  getIsolatePermissions(isolateId: string) {
    return this.permissionManager.getPermissions(isolateId);
  }

  // Check if isolate has permission for an operation
  hasPermission(isolateId: string, operation: string, payload?: any): boolean {
    return this.permissionManager.hasPermission(isolateId, operation, payload);
  }

  // Remove permissions for an isolate (cleanup)
  removeIsolatePermissions(isolateId: string): void {
    this.permissionManager.removePermissions(isolateId);
    console.log(`[OrchestratorManager] Removed permissions for isolate ${isolateId}`);
  }

  // Get orchestrator statistics
  getStats() {
    return {
      initialized: this.initialized,
      handlers: {
        registered: this.handlers.size,
        types: Array.from(this.handlers.keys())
      },
      messageBroker: this.messageBroker.getStats(),
      permissions: this.permissionManager.getStats(),
      timestamp: Date.now()
    };
  }

  // Get supported operations
  getSupportedOperations(): string[] {
    const operations: string[] = [];

    // Collect operations from all registered handlers
    for (const handler of this.handlers.values()) {
      if (handler && typeof handler.getSupportedOperations === 'function') {
        operations.push(...handler.getSupportedOperations());
      }
    }

    return operations;
  }

  // Shutdown the orchestrator system
  async shutdown(): Promise<void> {
    console.log('[OrchestratorManager] Shutting down orchestrator system...');

    // Shutdown message broker
    await this.messageBroker.shutdown();

    // Clear handlers
    this.handlers.clear();

    this.initialized = false;
    console.log('[OrchestratorManager] Orchestrator system shutdown complete');
  }
}

// Global orchestrator instance
let globalOrchestrator: OrchestratorManager | null = null;
let globalDatabaseManager: DatabaseManager | null = null;

// Get or create the global orchestrator instance
export function getOrchestrator(): OrchestratorManager {
  if (!globalOrchestrator) {
    if (!globalDatabaseManager) {
      throw new Error('Database manager not set. Call initializeOrchestrator() first.');
    }
    globalOrchestrator = new OrchestratorManager(globalDatabaseManager);
  }
  return globalOrchestrator;
}

// Initialize the global orchestrator
export async function initializeOrchestrator(databaseManager: DatabaseManager): Promise<OrchestratorManager> {
  globalDatabaseManager = databaseManager;
  const orchestrator = getOrchestrator();
  await orchestrator.initialize();
  return orchestrator;
}

// Utility functions for easy access
export const orchestratorUtils = {
  // Assign default permissions to an isolate
  assignDefaultPermissions: (isolateId: string, profile: PermissionLevel = 'basic') => {
    const orchestrator = getOrchestrator();
    orchestrator.assignPermissions(isolateId, profile);
  },

  // Handle capability request
  handleRequest: async (isolateId: string, operation: string, payload: any) => {
    const orchestrator = getOrchestrator();
    return await orchestrator.handleCapabilityRequest(isolateId, operation, payload);
  },

  // Check permissions
  hasPermission: (isolateId: string, operation: string, payload?: any) => {
    const orchestrator = getOrchestrator();
    return orchestrator.hasPermission(isolateId, operation, payload);
  },

  // Get supported operations
  getSupportedOperations: () => {
    const orchestrator = getOrchestrator();
    return orchestrator.getSupportedOperations();
  }
};
