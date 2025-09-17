// Base Proxy Framework for Isolate Orchestrator
// Provides common functionality for all capability handlers

import { MessageBroker, OrchestratorMessage } from './message-broker.ts';
import { BaseMessageHandler } from './base-handler.ts';
import { PermissionManager, validateOperation } from './permissions.ts';

export abstract class BaseCapabilityHandler extends BaseMessageHandler {
  protected permissionManager: PermissionManager;

  constructor(broker: MessageBroker, permissionManager: PermissionManager) {
    super(broker);
    this.permissionManager = permissionManager;
  }

  async handleRequest(message: OrchestratorMessage): Promise<any> {
    try {
      // Validate isolate ID
      if (!this.validateIsolateId(message.isolateId)) {
        throw this.createError('Invalid isolate ID', { isolateId: message.isolateId });
      }

      // Validate payload
      if (!this.validatePayload(message.payload)) {
        throw this.createError('Invalid payload', { payload: message.payload });
      }

      // Check permissions
      const permissionCheck = validateOperation(
        this.permissionManager,
        message.isolateId,
        message.operation,
        message.payload
      );

      if (!permissionCheck.allowed) {
        throw this.createError(permissionCheck.reason || 'Permission denied', {
          operation: message.operation,
          isolateId: message.isolateId
        });
      }

      // Record the request for rate limiting
      this.permissionManager.recordRequest(message.isolateId, message.operation);

      // Execute the capability-specific logic
      const result = await this.executeCapability(message);

      // Log successful operation
      console.log(`[${this.constructor.name}] Successfully executed ${message.operation} for isolate ${message.isolateId}`);

      return result;

    } catch (error) {
      console.error(`[${this.constructor.name}] Error handling ${message.operation}:`, error);

      // Re-throw with additional context
      throw this.createError(
        `Capability execution failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          operation: message.operation,
          isolateId: message.isolateId,
          originalError: error
        }
      );
    }
  }

  // Abstract method that each capability handler must implement
  protected abstract executeCapability(message: OrchestratorMessage): Promise<any>;

  // Common validation methods
  protected validateFilePath(path: string, allowedPaths: string[] = []): boolean {
    if (!path || typeof path !== 'string') return false;

    // Prevent path traversal attacks
    if (path.includes('..') || path.includes('\\') || path.startsWith('/')) {
      return false;
    }

    // Check against allowed paths if specified
    if (allowedPaths.length > 0) {
      return allowedPaths.some(allowedPath =>
        path.startsWith(allowedPath) || allowedPath === '*'
      );
    }

    return true;
  }

  protected validateFileSize(size: number, maxSize: number): boolean {
    return typeof size === 'number' && size >= 0 && size <= maxSize;
  }

  protected validateUrl(url: string, allowedDomains: string[] = []): boolean {
    if (!url || typeof url !== 'string') return false;

    try {
      const urlObj = new URL(url);

      // Check protocol (only allow http/https)
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Check against allowed domains if specified
      if (allowedDomains.length > 0) {
        const domainAllowed = allowedDomains.some(domain =>
          urlObj.hostname === domain ||
          urlObj.hostname.endsWith('.' + domain) ||
          domain === '*'
        );
        if (!domainAllowed) return false;
      }

      return true;
    } catch (error) {
      return false; // Invalid URL
    }
  }

  protected sanitizeString(input: string, maxLength: number = 1000): string {
    if (!input || typeof input !== 'string') return '';

    // Remove null bytes and other dangerous characters
    return input
      .replace(/\0/g, '') // Remove null bytes
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
      .substring(0, maxLength); // Limit length
  }

  protected validateSqlQuery(query: string): { valid: boolean; reason?: string } {
    if (!query || typeof query !== 'string') {
      return { valid: false, reason: 'Invalid query' };
    }

    // Basic SQL injection prevention
    const dangerousPatterns = [
      /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bCREATE\b|\bALTER\b)/i,
      /;/, // Multiple statements
      /--/, // Comments
      /\/\*.*\*\//, // Block comments
      /\bEXEC\b|\bEXECUTE\b/i, // Execution commands
      /\bXP_CMDSHELL\b/i, // System commands
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        return { valid: false, reason: 'Potentially dangerous SQL pattern detected' };
      }
    }

    return { valid: true };
  }

  // Resource monitoring helpers
  protected async monitorExecution<T>(
    operation: string,
    isolateId: string,
    executionFn: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();

    try {
      const result = await executionFn();
      const duration = performance.now() - startTime;

      console.log(`[${this.constructor.name}] ${operation} completed in ${duration.toFixed(2)}ms for isolate ${isolateId}`);

      // Could add metrics collection here
      // this.recordMetrics(operation, duration, true);

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[${this.constructor.name}] ${operation} failed after ${duration.toFixed(2)}ms for isolate ${isolateId}:`, error);

      // Could add error metrics collection here
      // this.recordMetrics(operation, duration, false);

      throw error;
    }
  }

  // Error creation with consistent format
  protected createCapabilityError(
    message: string,
    operation: string,
    details?: any
  ): Error {
    const error = new Error(`[${operation}] ${message}`);
    if (details) {
      (error as any).details = details;
      (error as any).operation = operation;
    }
    return error;
  }

  // Get isolate's permission profile for capability-specific logic
  protected getIsolatePermissions(isolateId: string) {
    return this.permissionManager.getPermissions(isolateId);
  }
}

// Factory for creating capability handlers
export class CapabilityHandlerFactory {
  private static handlers = new Map<string, new (broker: MessageBroker, permissionManager: PermissionManager) => BaseCapabilityHandler>();

  static register(operation: string, handlerClass: new (broker: MessageBroker, permissionManager: PermissionManager) => BaseCapabilityHandler): void {
    this.handlers.set(operation, handlerClass);
  }

  static createHandler(
    operation: string,
    broker: MessageBroker,
    permissionManager: PermissionManager
  ): BaseCapabilityHandler | null {
    const handlerClass = this.handlers.get(operation);
    if (!handlerClass) {
      return null;
    }

    return new handlerClass(broker, permissionManager);
  }

  static getSupportedOperations(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Utility functions for common operations
export class CapabilityUtils {
  // Generate secure temporary file path
  static generateTempPath(isolateId: string, extension: string = ''): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const safeIsolateId = isolateId.replace(/[^a-zA-Z0-9]/g, '_');

    return `temp/${safeIsolateId}_${timestamp}_${random}${extension ? '.' + extension : ''}`;
  }

  // Validate and sanitize file content
  static sanitizeFileContent(content: string | Uint8Array, maxSize: number): string | Uint8Array {
    if (typeof content === 'string') {
      if (content.length > maxSize) {
        throw new Error(`Content exceeds maximum size: ${content.length} > ${maxSize}`);
      }
      return content;
    } else {
      if (content.length > maxSize) {
        throw new Error(`Content exceeds maximum size: ${content.length} > ${maxSize}`);
      }
      return content;
    }
  }

  // Create directory if it doesn't exist
  static async ensureDirectory(path: string): Promise<void> {
    try {
      await Deno.stat(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        await Deno.mkdir(path, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  // Get file metadata safely
  static async getFileInfo(path: string): Promise<Deno.FileInfo | null> {
    try {
      return await Deno.stat(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return null;
      }
      throw error;
    }
  }

  // Safe file deletion
  static async safeDelete(path: string): Promise<boolean> {
    try {
      await Deno.remove(path);
      return true;
    } catch (error) {
      console.warn(`Failed to delete file ${path}:`, error);
      return false;
    }
  }

  // Rate limiting helper
  static createRateLimiter(maxRequests: number, windowMs: number) {
    const requests: number[] = [];

    return {
      checkLimit(): boolean {
        const now = Date.now();
        // Remove old requests outside the window
        while (requests.length > 0 && now - requests[0] > windowMs) {
          requests.shift();
        }
        return requests.length < maxRequests;
      },

      recordRequest(): void {
        requests.push(Date.now());
      },

      getRemainingRequests(): number {
        const now = Date.now();
        while (requests.length > 0 && now - requests[0] > windowMs) {
          requests.shift();
        }
        return Math.max(0, maxRequests - requests.length);
      }
    };
  }
}

// Error types for capability operations
export class CapabilityError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly isolateId: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'CapabilityError';
  }
}

export class PermissionDeniedError extends CapabilityError {
  constructor(operation: string, isolateId: string, reason: string) {
    super(`Permission denied: ${reason}`, operation, isolateId, { reason });
    this.name = 'PermissionDeniedError';
  }
}

export class RateLimitExceededError extends CapabilityError {
  constructor(operation: string, isolateId: string, limit: number) {
    super(`Rate limit exceeded: ${limit} requests allowed`, operation, isolateId, { limit });
    this.name = 'RateLimitExceededError';
  }
}

export class ValidationError extends CapabilityError {
  constructor(operation: string, isolateId: string, field: string, reason: string) {
    super(`Validation failed for ${field}: ${reason}`, operation, isolateId, { field, reason });
    this.name = 'ValidationError';
  }
}
