// Canvas Handler for Isolate Orchestrator Proxy
// Provides graphics and canvas rendering capabilities to isolates

import { OrchestratorMessage } from '../message-broker.ts';
import { BaseCapabilityHandler, CapabilityUtils, ValidationError } from '../proxy-base.ts';
import { MessageHandler } from '../base-handler.ts';

interface CanvasCreateRequest {
  width: number;
  height: number;
  contextType?: '2d';
  backgroundColor?: string;
}

interface CanvasDrawRequest {
  canvasId: string;
  operations: CanvasOperation[];
}

interface CanvasExportRequest {
  canvasId: string;
  format: 'png' | 'jpeg' | 'svg' | 'pdf';
  quality?: number;
}

interface CanvasOperation {
  type: string;
  [key: string]: any;
}

interface CanvasResponse {
  success: boolean;
  canvasId?: string;
  data?: any;
  width?: number;
  height?: number;
  error?: string;
}

export class CanvasHandler extends BaseCapabilityHandler {
  private canvases = new Map<string, CanvasInstance>();
  private maxCanvasSize = 7680 * 4320; // 8K resolution
  private defaultCanvasSize = 800 * 600;
  private supportedFormats = ['png', 'jpeg', 'svg'];

  async executeCapability(message: OrchestratorMessage): Promise<any> {
    const { operation, payload } = message;

    switch (operation) {
      case 'canvas.create':
        return await this.handleCreateCanvas(payload);
      case 'canvas.draw':
        return await this.handleDrawOperations(payload);
      case 'canvas.export':
        return await this.handleExportCanvas(payload);
      case 'canvas.getInfo':
        return await this.handleGetCanvasInfo(payload);
      case 'canvas.clear':
        return await this.handleClearCanvas(payload);
      default:
        throw new ValidationError(operation, message.isolateId, 'operation', `Unknown canvas operation: ${operation}`);
    }
  }

  private async handleCreateCanvas(payload: CanvasCreateRequest): Promise<CanvasResponse> {
    return await this.monitorExecution('canvas.create', `canvas_${Date.now()}`, async () => {
      // Validate request
      const width = payload.width || this.defaultCanvasSize;
      const height = payload.height || this.defaultCanvasSize;

      // Get isolate permissions
      const permissions = this.getIsolatePermissions('canvas');
      if (!permissions?.capabilities.canvas.enabled) {
        throw new ValidationError('canvas.create', 'unknown', 'permissions', 'Canvas operations not permitted');
      }

      // Validate canvas size
      const totalPixels = width * height;
      if (totalPixels > permissions.capabilities.canvas.maxCanvasSize) {
        throw new ValidationError('canvas.create', 'unknown', 'size', `Canvas size too large: ${totalPixels} > ${permissions.capabilities.canvas.maxCanvasSize}`);
      }

      if (totalPixels > this.maxCanvasSize) {
        throw new ValidationError('canvas.create', 'unknown', 'size', `Canvas size exceeds system limit: ${totalPixels} > ${this.maxCanvasSize}`);
      }

      // Generate unique canvas ID
      const canvasId = `canvas_${message.isolateId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      try {
        // Create canvas instance
        const canvasInstance = await this.createCanvasInstance(canvasId, width, height, payload);

        // Store canvas instance
        this.canvases.set(canvasId, canvasInstance);

        console.log(`Created canvas ${canvasId} (${width}x${height}) for isolate ${message.isolateId}`);

        return {
          success: true,
          canvasId,
          width,
          height
        };

      } catch (error) {
        throw new ValidationError('canvas.create', 'unknown', 'creation', `Failed to create canvas: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleDrawOperations(payload: CanvasDrawRequest): Promise<CanvasResponse> {
    return await this.monitorExecution('canvas.draw', payload.canvasId, async () => {
      // Validate request
      if (!payload.canvasId || !payload.operations) {
        throw new ValidationError('canvas.draw', 'unknown', 'payload', 'Canvas ID and operations are required');
      }

      // Get canvas instance
      const canvasInstance = this.canvases.get(payload.canvasId);
      if (!canvasInstance) {
        throw new ValidationError('canvas.draw', 'unknown', 'canvasId', `Canvas not found: ${payload.canvasId}`);
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions('canvas');
      if (!permissions?.capabilities.canvas.enabled) {
        throw new ValidationError('canvas.draw', 'unknown', 'permissions', 'Canvas operations not permitted');
      }

      try {
        // Execute drawing operations
        await this.executeDrawingOperations(canvasInstance, payload.operations);

        return {
          success: true,
          canvasId: payload.canvasId
        };

      } catch (error) {
        throw new ValidationError('canvas.draw', 'unknown', 'drawing', `Failed to execute drawing operations: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleExportCanvas(payload: CanvasExportRequest): Promise<CanvasResponse> {
    return await this.monitorExecution('canvas.export', payload.canvasId, async () => {
      // Validate request
      if (!payload.canvasId || !payload.format) {
        throw new ValidationError('canvas.export', 'unknown', 'payload', 'Canvas ID and format are required');
      }

      // Get canvas instance
      const canvasInstance = this.canvases.get(payload.canvasId);
      if (!canvasInstance) {
        throw new ValidationError('canvas.export', 'unknown', 'canvasId', `Canvas not found: ${payload.canvasId}`);
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions('canvas');
      if (!permissions?.capabilities.canvas.enabled || !permissions.capabilities.canvas.allowImageExport) {
        throw new ValidationError('canvas.export', 'unknown', 'permissions', 'Canvas export not permitted');
      }

      // Validate format
      if (!this.supportedFormats.includes(payload.format)) {
        throw new ValidationError('canvas.export', 'unknown', 'format', `Unsupported format: ${payload.format}`);
      }

      if (!permissions.capabilities.canvas.supportedFormats.includes(payload.format)) {
        throw new ValidationError('canvas.export', 'unknown', 'format', `Format not permitted: ${payload.format}`);
      }

      try {
        // Export canvas to requested format
        const exportData = await this.exportCanvasToFormat(canvasInstance, payload.format, payload.quality);

        return {
          success: true,
          canvasId: payload.canvasId,
          data: exportData,
          format: payload.format
        };

      } catch (error) {
        throw new ValidationError('canvas.export', 'unknown', 'export', `Failed to export canvas: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleGetCanvasInfo(payload: { canvasId: string }): Promise<CanvasResponse> {
    return await this.monitorExecution('canvas.getInfo', payload.canvasId, async () => {
      // Validate request
      if (!payload.canvasId) {
        throw new ValidationError('canvas.getInfo', 'unknown', 'canvasId', 'Canvas ID is required');
      }

      // Get canvas instance
      const canvasInstance = this.canvases.get(payload.canvasId);
      if (!canvasInstance) {
        throw new ValidationError('canvas.getInfo', 'unknown', 'canvasId', `Canvas not found: ${payload.canvasId}`);
      }

      return {
        success: true,
        canvasId: payload.canvasId,
        width: canvasInstance.width,
        height: canvasInstance.height
      };
    });
  }

  private async handleClearCanvas(payload: { canvasId: string }): Promise<CanvasResponse> {
    return await this.monitorExecution('canvas.clear', payload.canvasId, async () => {
      // Validate request
      if (!payload.canvasId) {
        throw new ValidationError('canvas.clear', 'unknown', 'canvasId', 'Canvas ID is required');
      }

      // Get canvas instance
      const canvasInstance = this.canvases.get(payload.canvasId);
      if (!canvasInstance) {
        throw new ValidationError('canvas.clear', 'unknown', 'canvasId', `Canvas not found: ${payload.canvasId}`);
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions('canvas');
      if (!permissions?.capabilities.canvas.enabled) {
        throw new ValidationError('canvas.clear', 'unknown', 'permissions', 'Canvas operations not permitted');
      }

      try {
        // Clear canvas
        await this.clearCanvasInstance(canvasInstance);

        return {
          success: true,
          canvasId: payload.canvasId
        };

      } catch (error) {
        throw new ValidationError('canvas.clear', 'unknown', 'clear', `Failed to clear canvas: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  // Canvas instance management
  private async createCanvasInstance(
    canvasId: string,
    width: number,
    height: number,
    options: CanvasCreateRequest
  ): Promise<CanvasInstance> {
    // This is a mock implementation - in a real system, you would:
    // 1. Import a canvas library like 'https://deno.land/x/canvas@v1.4.1/mod.ts'
    // 2. Create an actual Canvas instance
    // 3. Set up the 2D context

    const canvasInstance: CanvasInstance = {
      id: canvasId,
      width,
      height,
      contextType: options.contextType || '2d',
      operations: [],
      created: Date.now()
    };

    // Initialize with background color if specified
    if (options.backgroundColor) {
      canvasInstance.operations.push({
        type: 'fillRect',
        x: 0,
        y: 0,
        width,
        height,
        style: options.backgroundColor
      });
    }

    return canvasInstance;
  }

  private async executeDrawingOperations(
    canvasInstance: CanvasInstance,
    operations: CanvasOperation[]
  ): Promise<void> {
    for (const operation of operations) {
      // Validate operation
      if (!this.validateCanvasOperation(operation)) {
        throw new Error(`Invalid canvas operation: ${operation.type}`);
      }

      // Store operation for later rendering
      canvasInstance.operations.push(operation);

      // In a real implementation, you would execute the operation on the actual canvas
      console.log(`Canvas operation: ${operation.type}`, operation);
    }
  }

  private async exportCanvasToFormat(
    canvasInstance: CanvasInstance,
    format: string,
    quality?: number
  ): Promise<Uint8Array> {
    // This is a mock implementation - in a real system, you would:
    // 1. Use the canvas library to render all operations
    // 2. Export to the requested format
    // 3. Return the binary data

    console.log(`Exporting canvas ${canvasInstance.id} to ${format} format`);

    // Mock export - return a small PNG-like byte array
    const mockData = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      // ... mock PNG data would go here
    ]);

    return mockData;
  }

  private async clearCanvasInstance(canvasInstance: CanvasInstance): Promise<void> {
    // Clear all operations
    canvasInstance.operations = [];

    // Add a clear operation
    canvasInstance.operations.push({
      type: 'clearRect',
      x: 0,
      y: 0,
      width: canvasInstance.width,
      height: canvasInstance.height
    });

    console.log(`Cleared canvas ${canvasInstance.id}`);
  }

  // Validation methods
  private validateCanvasOperation(operation: CanvasOperation): boolean {
    const supportedOperations = [
      'fillRect', 'strokeRect', 'clearRect',
      'fillText', 'strokeText',
      'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'rect',
      'fill', 'stroke',
      'save', 'restore', 'translate', 'rotate', 'scale',
      'drawImage'
    ];

    return operation.type && supportedOperations.includes(operation.type);
  }

  // Cleanup method for removing old canvases
  async cleanupOldCanvases(maxAge: number = 3600000): Promise<number> { // 1 hour default
    const now = Date.now();
    let cleaned = 0;

    for (const [canvasId, canvasInstance] of this.canvases.entries()) {
      if (now - canvasInstance.created > maxAge) {
        this.canvases.delete(canvasId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old canvases`);
    }

    return cleaned;
  }

  // Get canvas statistics
  getCanvasStats() {
    return {
      activeCanvases: this.canvases.size,
      maxCanvasSize: this.maxCanvasSize,
      supportedFormats: this.supportedFormats,
      totalOperations: Array.from(this.canvases.values()).reduce((sum, canvas) => sum + canvas.operations.length, 0)
    };
  }
}

// Canvas instance interface
interface CanvasInstance {
  id: string;
  width: number;
  height: number;
  contextType: string;
  operations: CanvasOperation[];
  created: number;
}
