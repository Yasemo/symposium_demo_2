// File System Handler for Isolate Orchestrator Proxy
// Provides secure file system operations to isolates

import { OrchestratorMessage } from '../message-broker.ts';
import { BaseCapabilityHandler, CapabilityUtils, ValidationError } from '../proxy-base.ts';

interface FileReadRequest {
  path: string;
  encoding?: 'utf8' | 'binary';
  maxSize?: number;
}

interface FileWriteRequest {
  path: string;
  content: string | Uint8Array;
  encoding?: 'utf8' | 'binary';
  createDirectories?: boolean;
}

interface FileDeleteRequest {
  path: string;
}

interface FileListRequest {
  path: string;
  recursive?: boolean;
  pattern?: string;
}

interface FileInfoRequest {
  path: string;
}

interface FileOperationResponse {
  success: boolean;
  data?: any;
  size?: number;
  modified?: number;
  created?: number;
  isDirectory?: boolean;
  error?: string;
}

export class FileSystemHandler extends BaseCapabilityHandler {
  private tempDirectory = 'temp';
  private uploadsDirectory = 'uploads';
  private dataDirectory = 'data';

  async executeCapability(message: OrchestratorMessage): Promise<any> {
    const { operation, payload } = message;

    switch (operation) {
      case 'file.read':
        return await this.handleFileRead(payload);
      case 'file.write':
        return await this.handleFileWrite(payload);
      case 'file.delete':
        return await this.handleFileDelete(payload);
      case 'file.list':
        return await this.handleFileList(payload);
      case 'file.info':
        return await this.handleFileInfo(payload);
      case 'file.exists':
        return await this.handleFileExists(payload);
      default:
        throw new ValidationError(operation, message.isolateId, 'operation', `Unknown file operation: ${operation}`);
    }
  }

  private async handleFileRead(payload: FileReadRequest): Promise<FileOperationResponse> {
    return await this.monitorExecution('file.read', payload.path, async () => {
      // Validate request
      if (!payload.path) {
        throw new ValidationError('file.read', 'unknown', 'path', 'Path is required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(payload.path); // Note: This should use isolateId from message
      if (!permissions?.capabilities.fileSystem.read) {
        throw new ValidationError('file.read', 'unknown', 'permissions', 'File read not permitted');
      }

      // Validate file path
      const allowedPaths = permissions.capabilities.fileSystem.allowedPaths;
      if (!this.validateFilePath(payload.path, allowedPaths)) {
        throw new ValidationError('file.read', 'unknown', 'path', 'Invalid or unauthorized file path');
      }

      // Check if file exists
      const fileInfo = await CapabilityUtils.getFileInfo(payload.path);
      if (!fileInfo) {
        return { success: false, error: 'File not found' };
      }

      // Check file size against limits
      const maxSize = payload.maxSize || permissions.capabilities.fileSystem.maxFileSize;
      if (fileInfo.size > maxSize) {
        throw new ValidationError('file.read', 'unknown', 'size', `File too large: ${fileInfo.size} > ${maxSize}`);
      }

      // Read file content
      const content = await this.readFileContent(payload.path, payload.encoding || 'utf8');

      return {
        success: true,
        data: content,
        size: fileInfo.size,
        modified: fileInfo.mtime?.getTime(),
        created: fileInfo.birthtime?.getTime()
      };
    });
  }

  private async handleFileWrite(payload: FileWriteRequest): Promise<FileOperationResponse> {
    return await this.monitorExecution('file.write', payload.path, async () => {
      // Validate request
      if (!payload.path || !payload.content) {
        throw new ValidationError('file.write', 'unknown', 'payload', 'Path and content are required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(payload.path);
      if (!permissions?.capabilities.fileSystem.write) {
        throw new ValidationError('file.write', 'unknown', 'permissions', 'File write not permitted');
      }

      // Validate file path
      const allowedPaths = permissions.capabilities.fileSystem.allowedPaths;
      if (!this.validateFilePath(payload.path, allowedPaths)) {
        throw new ValidationError('file.write', 'unknown', 'path', 'Invalid or unauthorized file path');
      }

      // Validate file size
      const contentSize = typeof payload.content === 'string' ? payload.content.length : payload.content.length;
      if (!this.validateFileSize(contentSize, permissions.capabilities.fileSystem.maxFileSize)) {
        throw new ValidationError('file.write', 'unknown', 'size', `Content too large: ${contentSize} > ${permissions.capabilities.fileSystem.maxFileSize}`);
      }

      // Validate file extension
      const extension = payload.path.split('.').pop()?.toLowerCase();
      const allowedExtensions = permissions.capabilities.fileSystem.allowedExtensions;
      if (allowedExtensions.length > 0 && !allowedExtensions.includes('*') && extension) {
        if (!allowedExtensions.includes(`.${extension}`)) {
          throw new ValidationError('file.write', 'unknown', 'extension', `File extension not allowed: .${extension}`);
        }
      }

      // Sanitize content
      const sanitizedContent = CapabilityUtils.sanitizeFileContent(payload.content, permissions.capabilities.fileSystem.maxFileSize);

      // Create directories if requested
      if (payload.createDirectories) {
        const dirPath = payload.path.substring(0, payload.path.lastIndexOf('/'));
        if (dirPath) {
          await CapabilityUtils.ensureDirectory(dirPath);
        }
      }

      // Write file
      await this.writeFileContent(payload.path, sanitizedContent, payload.encoding || 'utf8');

      // Get file info after writing
      const fileInfo = await CapabilityUtils.getFileInfo(payload.path);

      return {
        success: true,
        size: fileInfo?.size || contentSize,
        modified: fileInfo?.mtime?.getTime(),
        created: fileInfo?.birthtime?.getTime()
      };
    });
  }

  private async handleFileDelete(payload: FileDeleteRequest): Promise<FileOperationResponse> {
    return await this.monitorExecution('file.delete', payload.path, async () => {
      // Validate request
      if (!payload.path) {
        throw new ValidationError('file.delete', 'unknown', 'path', 'Path is required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(payload.path);
      if (!permissions?.capabilities.fileSystem.delete) {
        throw new ValidationError('file.delete', 'unknown', 'permissions', 'File delete not permitted');
      }

      // Validate file path
      const allowedPaths = permissions.capabilities.fileSystem.allowedPaths;
      if (!this.validateFilePath(payload.path, allowedPaths)) {
        throw new ValidationError('file.delete', 'unknown', 'path', 'Invalid or unauthorized file path');
      }

      // Check if file exists
      const fileInfo = await CapabilityUtils.getFileInfo(payload.path);
      if (!fileInfo) {
        return { success: false, error: 'File not found' };
      }

      // Delete file
      const deleted = await CapabilityUtils.safeDelete(payload.path);

      return {
        success: deleted,
        error: deleted ? undefined : 'Failed to delete file'
      };
    });
  }

  private async handleFileList(payload: FileListRequest): Promise<FileOperationResponse> {
    return await this.monitorExecution('file.list', payload.path, async () => {
      // Validate request
      if (!payload.path) {
        throw new ValidationError('file.list', 'unknown', 'path', 'Path is required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(payload.path);
      if (!permissions?.capabilities.fileSystem.read) {
        throw new ValidationError('file.list', 'unknown', 'permissions', 'File list not permitted');
      }

      // Validate directory path
      const allowedPaths = permissions.capabilities.fileSystem.allowedPaths;
      if (!this.validateFilePath(payload.path, allowedPaths)) {
        throw new ValidationError('file.list', 'unknown', 'path', 'Invalid or unauthorized directory path');
      }

      // List directory contents
      const entries = await this.listDirectory(payload.path, payload.recursive || false, payload.pattern);

      return {
        success: true,
        data: entries
      };
    });
  }

  private async handleFileInfo(payload: FileInfoRequest): Promise<FileOperationResponse> {
    return await this.monitorExecution('file.info', payload.path, async () => {
      // Validate request
      if (!payload.path) {
        throw new ValidationError('file.info', 'unknown', 'path', 'Path is required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(payload.path);
      if (!permissions?.capabilities.fileSystem.read) {
        throw new ValidationError('file.info', 'unknown', 'permissions', 'File info not permitted');
      }

      // Validate file path
      const allowedPaths = permissions.capabilities.fileSystem.allowedPaths;
      if (!this.validateFilePath(payload.path, allowedPaths)) {
        throw new ValidationError('file.info', 'unknown', 'path', 'Invalid or unauthorized file path');
      }

      // Get file info
      const fileInfo = await CapabilityUtils.getFileInfo(payload.path);
      if (!fileInfo) {
        return { success: false, error: 'File not found' };
      }

      return {
        success: true,
        size: fileInfo.size,
        modified: fileInfo.mtime?.getTime(),
        created: fileInfo.birthtime?.getTime(),
        isDirectory: fileInfo.isDirectory
      };
    });
  }

  private async handleFileExists(payload: FileInfoRequest): Promise<FileOperationResponse> {
    return await this.monitorExecution('file.exists', payload.path, async () => {
      // Validate request
      if (!payload.path) {
        throw new ValidationError('file.exists', 'unknown', 'path', 'Path is required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(payload.path);
      if (!permissions?.capabilities.fileSystem.read) {
        throw new ValidationError('file.exists', 'unknown', 'permissions', 'File exists check not permitted');
      }

      // Validate file path
      const allowedPaths = permissions.capabilities.fileSystem.allowedPaths;
      if (!this.validateFilePath(payload.path, allowedPaths)) {
        throw new ValidationError('file.exists', 'unknown', 'path', 'Invalid or unauthorized file path');
      }

      // Check if file exists
      const fileInfo = await CapabilityUtils.getFileInfo(payload.path);
      const exists = fileInfo !== null;

      return {
        success: true,
        data: exists,
        isDirectory: fileInfo?.isDirectory || false
      };
    });
  }

  // Helper methods for file operations
  private async readFileContent(path: string, encoding: string): Promise<string | Uint8Array> {
    try {
      if (encoding === 'binary') {
        return await Deno.readFile(path);
      } else {
        return await Deno.readTextFile(path);
      }
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async writeFileContent(path: string, content: string | Uint8Array, encoding: string): Promise<void> {
    try {
      if (encoding === 'binary' && content instanceof Uint8Array) {
        await Deno.writeFile(path, content);
      } else if (typeof content === 'string') {
        await Deno.writeTextFile(path, content);
      } else {
        throw new Error('Invalid content type for encoding');
      }
    } catch (error) {
      throw new Error(`Failed to write file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listDirectory(path: string, recursive: boolean, pattern?: string): Promise<any[]> {
    try {
      const entries: any[] = [];

      for await (const entry of Deno.readDir(path)) {
        // Apply pattern filter if specified
        if (pattern && !entry.name.includes(pattern)) {
          continue;
        }

        const fullPath = `${path}/${entry.name}`;
        const fileInfo = await CapabilityUtils.getFileInfo(fullPath);

        const entryData = {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory,
          isFile: entry.isFile,
          size: fileInfo?.size || 0,
          modified: fileInfo?.mtime?.getTime()
        };

        entries.push(entryData);

        // Recursively list subdirectories if requested
        if (recursive && entry.isDirectory) {
          const subEntries = await this.listDirectory(fullPath, true, pattern);
          entries.push(...subEntries);
        }
      }

      return entries;
    } catch (error) {
      throw new Error(`Failed to list directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Initialize required directories
  async initializeDirectories(): Promise<void> {
    await CapabilityUtils.ensureDirectory(this.tempDirectory);
    await CapabilityUtils.ensureDirectory(this.uploadsDirectory);
    await CapabilityUtils.ensureDirectory(this.dataDirectory);

    console.log('[FileSystemHandler] Initialized directories:', {
      temp: this.tempDirectory,
      uploads: this.uploadsDirectory,
      data: this.dataDirectory
    });
  }
}
