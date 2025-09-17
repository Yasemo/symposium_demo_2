// Message Broker for Isolate Orchestrator Proxy
// Handles all communication between isolates and main runtime capabilities

import { DatabaseHandler } from './handlers/database.ts';
import { DatabaseManager } from '../database-manager.ts';
import { MessageHandler, BaseMessageHandler } from './base-handler.ts';

export interface OrchestratorMessage {
  id: string;
  type: 'request' | 'response' | 'error';
  operation: string;
  isolateId: string;
  timestamp: number;
  payload?: any;
  error?: string;
  correlationId?: string; // For request-response matching
}

export interface PendingRequest {
  message: OrchestratorMessage;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeoutId: number;
  timestamp: number;
}

export class MessageBroker {
  private pendingRequests = new Map<string, PendingRequest>();
  private handlers = new Map<string, MessageHandler>();
  private databaseHandlers = new Map<string, DatabaseHandler>(); // Per-isolate database handlers
  private requestTimeout = 30000; // 30 seconds default
  private maxConcurrentRequests = 100;
  private requestCount = 0;
  private databaseManager: DatabaseManager;
  private permissionManager: any; // Will be set by orchestrator

  constructor(databaseManager?: DatabaseManager) {
    this.databaseManager = databaseManager!;
    // Start cleanup interval for expired requests
    setInterval(() => this.cleanupExpiredRequests(), 10000);
  }

  // Set permission manager (called by orchestrator)
  setPermissionManager(permissionManager: any): void {
    this.permissionManager = permissionManager;
  }

  // Register a handler for a specific operation type
  registerHandler(operation: string, handler: MessageHandler): void {
    this.handlers.set(operation, handler);
    console.log(`[MessageBroker] Registered handler for operation: ${operation}`);
  }

  // Send a request from isolate to main runtime
  async sendRequest(
    isolateId: string,
    operation: string,
    payload: any = {},
    timeoutMs: number = this.requestTimeout
  ): Promise<any> {
    // Check concurrent request limits
    if (this.pendingRequests.size >= this.maxConcurrentRequests) {
      throw new Error('Maximum concurrent requests exceeded');
    }

    const messageId = this.generateMessageId();
    const message: OrchestratorMessage = {
      id: messageId,
      type: 'request',
      operation,
      isolateId,
      timestamp: Date.now(),
      payload
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`Request timeout: ${operation}`));
      }, timeoutMs);

      const pendingRequest: PendingRequest = {
        message,
        resolve,
        reject,
        timeoutId,
        timestamp: Date.now()
      };

      this.pendingRequests.set(messageId, pendingRequest);
      this.requestCount++;

      // Route the message to appropriate handler
      this.routeMessage(message).catch(error => {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(messageId);
        reject(error);
      });
    });
  }

  // Handle incoming response from capability handlers
  async handleResponse(message: OrchestratorMessage): Promise<void> {
    const pendingRequest = this.pendingRequests.get(message.correlationId!);

    if (!pendingRequest) {
      console.warn(`[MessageBroker] No pending request found for correlation ID: ${message.correlationId}`);
      return;
    }

    // Clear timeout
    clearTimeout(pendingRequest.timeoutId);
    this.pendingRequests.delete(message.correlationId!);

    // Resolve or reject based on message type
    if (message.type === 'response') {
      pendingRequest.resolve(message.payload);
    } else if (message.type === 'error') {
      pendingRequest.reject(new Error(message.error || 'Unknown error'));
    }
  }

  // Route message to appropriate handler
  private async routeMessage(message: OrchestratorMessage): Promise<void> {
    let handler: MessageHandler | null = null;

    // Special handling for database operations - create per-isolate handlers
    if (message.operation.startsWith('database.')) {
      handler = await this.getDatabaseHandler(message.isolateId);
    } else {
      handler = this.handlers.get(message.operation);
    }

    if (!handler) {
      throw new Error(`No handler registered for operation: ${message.operation}`);
    }

    try {
      console.log(`[MessageBroker] Routing ${message.operation} request from isolate ${message.isolateId}`);

      // Execute the handler
      const result = await handler.handleRequest(message);

      // Send response back
      const responseMessage: OrchestratorMessage = {
        id: this.generateMessageId(),
        type: 'response',
        operation: message.operation,
        isolateId: message.isolateId,
        timestamp: Date.now(),
        payload: result,
        correlationId: message.id
      };

      // In a real implementation, this would send the message back to the isolate
      // For now, we'll resolve the pending request directly
      this.handleResponse(responseMessage);

    } catch (error) {
      console.error(`[MessageBroker] Handler error for ${message.operation}:`, error);

      const errorMessage: OrchestratorMessage = {
        id: this.generateMessageId(),
        type: 'error',
        operation: message.operation,
        isolateId: message.isolateId,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
        correlationId: message.id
      };

      this.handleResponse(errorMessage);
    }
  }

  // Get or create isolate-specific database handler
  private async getDatabaseHandler(isolateId: string): Promise<DatabaseHandler> {
    // Check if we already have a handler for this isolate
    if (this.databaseHandlers.has(isolateId)) {
      return this.databaseHandlers.get(isolateId)!;
    }

    // Create new database handler for this isolate
    const databaseHandler = new DatabaseHandler(
      this, // broker
      this.permissionManager, // permission manager
      this.databaseManager,
      isolateId
    );

    this.databaseHandlers.set(isolateId, databaseHandler);
    console.log(`[MessageBroker] Created database handler for isolate: ${isolateId}`);

    return databaseHandler;
  }

  // Generate unique message ID
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clean up expired requests
  private cleanupExpiredRequests(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    for (const [id, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.requestTimeout + 5000) { // 5 second grace period
        expiredIds.push(id);
        clearTimeout(request.timeoutId);
        request.reject(new Error('Request expired'));
      }
    }

    expiredIds.forEach(id => this.pendingRequests.delete(id));

    if (expiredIds.length > 0) {
      console.log(`[MessageBroker] Cleaned up ${expiredIds.length} expired requests`);
    }
  }

  // Get broker statistics
  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      registeredHandlers: this.handlers.size,
      totalRequestsProcessed: this.requestCount,
      timestamp: Date.now()
    };
  }

  // Shutdown broker
  async shutdown(): Promise<void> {
    console.log('[MessageBroker] Shutting down...');

    // Reject all pending requests
    for (const [id, request] of this.pendingRequests.entries()) {
      clearTimeout(request.timeoutId);
      request.reject(new Error('Message broker shutting down'));
    }

    this.pendingRequests.clear();
    this.handlers.clear();

    console.log('[MessageBroker] Shutdown complete');
  }
}
