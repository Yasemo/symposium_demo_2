// Permission System for Isolate Orchestrator Proxy
// Controls what capabilities each isolate can access

export type PermissionLevel = 'basic' | 'interactive' | 'data' | 'advanced';

export interface PermissionProfile {
  name: PermissionLevel;
  displayName: string;
  description: string;
  capabilities: {
    fileSystem: {
      read: boolean;
      write: boolean;
      delete: boolean;
      maxFileSize: number; // in bytes
      allowedExtensions: string[];
      allowedPaths: string[];
    };
    network: {
      enabled: boolean;
      maxRequestsPerMinute: number;
      allowedDomains: string[];
      allowWebhooks: boolean;
      allowCustomHeaders: boolean;
    };
    canvas: {
      enabled: boolean;
      maxCanvasSize: number; // width * height
      allowImageExport: boolean;
      supportedFormats: string[];
    };
    database: {
      enabled: boolean;
      maxQueriesPerMinute: number;
      allowWrites: boolean;
      allowComplexQueries: boolean;
    };
    process: {
      enabled: boolean;
      allowedCommands: string[];
      maxExecutionTime: number; // in seconds
      maxOutputSize: number; // in bytes
    };
  };
  limits: {
    memoryUsage: number; // in MB
    executionTime: number; // in seconds
    concurrentRequests: number;
    storageQuota: number; // in MB
  };
}

// Predefined permission profiles
export const PERMISSION_PROFILES: Record<PermissionLevel, PermissionProfile> = {
  basic: {
    name: 'basic',
    displayName: 'Basic',
    description: 'Read-only operations with limited network access',
    capabilities: {
      fileSystem: {
        read: false,
        write: false,
        delete: false,
        maxFileSize: 0,
        allowedExtensions: [],
        allowedPaths: []
      },
      network: {
        enabled: true,
        maxRequestsPerMinute: 10,
        allowedDomains: ['cdn.jsdelivr.net', 'esm.sh', 'unpkg.com'],
        allowWebhooks: false,
        allowCustomHeaders: false
      },
      canvas: {
        enabled: false,
        maxCanvasSize: 0,
        allowImageExport: false,
        supportedFormats: []
      },
      database: {
        enabled: false,
        maxQueriesPerMinute: 0,
        allowWrites: false,
        allowComplexQueries: false
      },
      process: {
        enabled: false,
        allowedCommands: [],
        maxExecutionTime: 0,
        maxOutputSize: 0
      },
      dom: {
        enabled: true,
        maxHtmlSize: 1024 * 1024, // 1MB
        maxCssSize: 512 * 1024,   // 512KB
        maxJsSize: 512 * 1024,    // 512KB
        allowScriptExecution: true,
        allowCssInjection: true,
        allowHtmlParsing: true
      }
    },
    limits: {
      memoryUsage: 64,
      executionTime: 30,
      concurrentRequests: 5,
      storageQuota: 1
    }
  },

  interactive: {
    name: 'interactive',
    displayName: 'Interactive',
    description: 'File upload/download with enhanced network capabilities',
    capabilities: {
      fileSystem: {
        read: true,
        write: true,
        delete: true,
        maxFileSize: 5 * 1024 * 1024, // 5MB
        allowedExtensions: ['.txt', '.json', '.csv', '.md', '.xml'],
        allowedPaths: ['temp/', 'uploads/']
      },
      network: {
        enabled: true,
        maxRequestsPerMinute: 30,
        allowedDomains: ['*'], // Allow all domains for interactive content
        allowWebhooks: true,
        allowCustomHeaders: true
      },
      canvas: {
        enabled: true,
        maxCanvasSize: 1920 * 1080, // Full HD
        allowImageExport: true,
        supportedFormats: ['png', 'jpeg', 'svg']
      },
      database: {
        enabled: false,
        maxQueriesPerMinute: 0,
        allowWrites: false,
        allowComplexQueries: false
      },
      process: {
        enabled: false,
        allowedCommands: [],
        maxExecutionTime: 0,
        maxOutputSize: 0
      },
      dom: {
        enabled: true,
        maxHtmlSize: 2 * 1024 * 1024, // 2MB
        maxCssSize: 1024 * 1024,      // 1MB
        maxJsSize: 1024 * 1024,       // 1MB
        allowScriptExecution: true,
        allowCssInjection: true,
        allowHtmlParsing: true
      }
    },
    limits: {
      memoryUsage: 128,
      executionTime: 60,
      concurrentRequests: 10,
      storageQuota: 10
    }
  },

  data: {
    name: 'data',
    displayName: 'Data Processing',
    description: 'Database access and data processing capabilities',
    capabilities: {
      fileSystem: {
        read: true,
        write: true,
        delete: true,
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedExtensions: ['.txt', '.json', '.csv', '.xml', '.sql', '.db'],
        allowedPaths: ['data/', 'temp/', 'exports/']
      },
      network: {
        enabled: true,
        maxRequestsPerMinute: 60,
        allowedDomains: ['*'],
        allowWebhooks: true,
        allowCustomHeaders: true
      },
      canvas: {
        enabled: true,
        maxCanvasSize: 3840 * 2160, // 4K
        allowImageExport: true,
        supportedFormats: ['png', 'jpeg', 'svg', 'pdf']
      },
      database: {
        enabled: true,
        maxQueriesPerMinute: 100,
        allowWrites: true,
        allowComplexQueries: true
      },
      process: {
        enabled: false,
        allowedCommands: [],
        maxExecutionTime: 0,
        maxOutputSize: 0
      },
      dom: {
        enabled: true,
        maxHtmlSize: 5 * 1024 * 1024, // 5MB
        maxCssSize: 2 * 1024 * 1024,  // 2MB
        maxJsSize: 2 * 1024 * 1024,   // 2MB
        allowScriptExecution: true,
        allowCssInjection: true,
        allowHtmlParsing: true
      }
    },
    limits: {
      memoryUsage: 256,
      executionTime: 300,
      concurrentRequests: 20,
      storageQuota: 100
    }
  },

  advanced: {
    name: 'advanced',
    displayName: 'Advanced',
    description: 'Full system access for trusted content creators',
    capabilities: {
      fileSystem: {
        read: true,
        write: true,
        delete: true,
        maxFileSize: 500 * 1024 * 1024, // 500MB
        allowedExtensions: ['*'], // All extensions
        allowedPaths: ['*'] // All paths
      },
      network: {
        enabled: true,
        maxRequestsPerMinute: 200,
        allowedDomains: ['*'],
        allowWebhooks: true,
        allowCustomHeaders: true
      },
      canvas: {
        enabled: true,
        maxCanvasSize: 7680 * 4320, // 8K
        allowImageExport: true,
        supportedFormats: ['png', 'jpeg', 'svg', 'pdf', 'tiff']
      },
      database: {
        enabled: true,
        maxQueriesPerMinute: 500,
        allowWrites: true,
        allowComplexQueries: true
      },
      process: {
        enabled: true,
        allowedCommands: ['*'], // All commands (with security restrictions)
        maxExecutionTime: 300,
        maxOutputSize: 10 * 1024 * 1024 // 10MB
      },
      dom: {
        enabled: true,
        maxHtmlSize: 10 * 1024 * 1024, // 10MB
        maxCssSize: 5 * 1024 * 1024,   // 5MB
        maxJsSize: 5 * 1024 * 1024,    // 5MB
        allowScriptExecution: true,
        allowCssInjection: true,
        allowHtmlParsing: true
      }
    },
    limits: {
      memoryUsage: 512,
      executionTime: 600,
      concurrentRequests: 50,
      storageQuota: 1000
    }
  }
};

export class PermissionManager {
  private isolatePermissions = new Map<string, PermissionProfile>();
  private requestCounts = new Map<string, Map<string, number>>();
  private lastResetTime = Date.now();

  constructor() {
    // Reset request counts every minute
    setInterval(() => this.resetRequestCounts(), 60000);
  }

  // Assign permission profile to an isolate
  assignPermissions(isolateId: string, profile: PermissionLevel): void {
    const permissionProfile = PERMISSION_PROFILES[profile];
    if (!permissionProfile) {
      throw new Error(`Unknown permission profile: ${profile}`);
    }

    this.isolatePermissions.set(isolateId, permissionProfile);
    console.log(`[PermissionManager] Assigned ${profile} permissions to isolate ${isolateId}`);
  }

  // Get permission profile for an isolate
  getPermissions(isolateId: string): PermissionProfile | null {
    return this.isolatePermissions.get(isolateId) || null;
  }

  // Check if isolate has permission for a specific operation
  hasPermission(isolateId: string, operation: string, payload?: any): boolean {
    const profile = this.isolatePermissions.get(isolateId);
    if (!profile) {
      console.warn(`[PermissionManager] No permissions assigned to isolate ${isolateId}`);
      return false;
    }

    // Check operation-specific permissions
    switch (operation) {
      case 'file.read':
        return profile.capabilities.fileSystem.read;
      case 'file.write':
        return profile.capabilities.fileSystem.write && this.validateFileOperation(payload, profile);
      case 'file.delete':
        return profile.capabilities.fileSystem.delete;
      case 'network.request':
        return profile.capabilities.network.enabled && this.validateNetworkRequest(payload, profile);
      case 'canvas.create':
        return profile.capabilities.canvas.enabled;
      case 'canvas.export':
        return profile.capabilities.canvas.allowImageExport;
      case 'database.query':
        return profile.capabilities.database.enabled && this.validateDatabaseQuery(payload, profile);
      case 'process.execute':
        return profile.capabilities.process.enabled && this.validateProcessExecution(payload, profile);
      case 'dom.parse':
        return profile.capabilities.dom.enabled && profile.capabilities.dom.allowHtmlParsing;
      case 'dom.execute':
        return profile.capabilities.dom.enabled && profile.capabilities.dom.allowScriptExecution;
      case 'dom.inject_css':
        return profile.capabilities.dom.enabled && profile.capabilities.dom.allowCssInjection;
      case 'dom.inject_js':
        return profile.capabilities.dom.enabled && profile.capabilities.dom.allowScriptExecution;
      case 'dom.update':
        return profile.capabilities.dom.enabled && profile.capabilities.dom.allowScriptExecution;
      default:
        return false;
    }
  }

  // Check if isolate is within rate limits
  checkRateLimit(isolateId: string, operation: string): boolean {
    const profile = this.isolatePermissions.get(isolateId);
    if (!profile) return false;

    const isolateCounts = this.requestCounts.get(isolateId) || new Map();
    const currentCount = isolateCounts.get(operation) || 0;

    // Get rate limit for operation
    let limit = 0;
    if (operation.startsWith('network.')) {
      limit = profile.capabilities.network.maxRequestsPerMinute;
    } else if (operation.startsWith('database.')) {
      limit = profile.capabilities.database.maxQueriesPerMinute;
    } else {
      limit = profile.limits.concurrentRequests;
    }

    return currentCount < limit;
  }

  // Record a request for rate limiting
  recordRequest(isolateId: string, operation: string): void {
    const isolateCounts = this.requestCounts.get(isolateId) || new Map();
    const currentCount = isolateCounts.get(operation) || 0;
    isolateCounts.set(operation, currentCount + 1);
    this.requestCounts.set(isolateId, isolateCounts);
  }

  // Validate file operation parameters
  private validateFileOperation(payload: any, profile: PermissionProfile): boolean {
    if (!payload || !payload.path) return false;

    const path = payload.path;
    const size = payload.size || 0;

    // Check file size limit
    if (size > profile.capabilities.fileSystem.maxFileSize) {
      return false;
    }

    // Check allowed paths
    const allowedPaths = profile.capabilities.fileSystem.allowedPaths;
    if (allowedPaths.length > 0 && !allowedPaths.includes('*')) {
      const pathAllowed = allowedPaths.some(allowedPath =>
        path.startsWith(allowedPath) || allowedPath === '*'
      );
      if (!pathAllowed) return false;
    }

    // Check file extension
    const extension = path.split('.').pop()?.toLowerCase();
    const allowedExtensions = profile.capabilities.fileSystem.allowedExtensions;
    if (allowedExtensions.length > 0 && !allowedExtensions.includes('*')) {
      if (!extension || !allowedExtensions.includes(`.${extension}`)) {
        return false;
      }
    }

    return true;
  }

  // Validate network request parameters
  private validateNetworkRequest(payload: any, profile: PermissionProfile): boolean {
    if (!payload || !payload.url) return false;

    const url = payload.url;
    const allowedDomains = profile.capabilities.network.allowedDomains;

    if (allowedDomains.length > 0 && !allowedDomains.includes('*')) {
      try {
        const urlObj = new URL(url);
        const domainAllowed = allowedDomains.some(domain =>
          urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
        );
        if (!domainAllowed) return false;
      } catch (error) {
        return false; // Invalid URL
      }
    }

    return true;
  }

  // Validate database query parameters
  private validateDatabaseQuery(payload: any, profile: PermissionProfile): boolean {
    if (!payload || !payload.query) return false;

    // For now, just check if writes are allowed
    const isWriteQuery = /insert|update|delete|create|alter|drop/i.test(payload.query);
    if (isWriteQuery && !profile.capabilities.database.allowWrites) {
      return false;
    }

    // Check for complex queries if not allowed
    if (!profile.capabilities.database.allowComplexQueries) {
      const complexPatterns = [/join/i, /union/i, /subquery/i, /group by/i];
      if (complexPatterns.some(pattern => pattern.test(payload.query))) {
        return false;
      }
    }

    return true;
  }

  // Validate process execution parameters
  private validateProcessExecution(payload: any, profile: PermissionProfile): boolean {
    if (!payload || !payload.command) return false;

    const command = payload.command;
    const allowedCommands = profile.capabilities.process.allowedCommands;

    if (allowedCommands.length > 0 && !allowedCommands.includes('*')) {
      const commandAllowed = allowedCommands.some(allowedCmd =>
        command.startsWith(allowedCmd) || allowedCmd === '*'
      );
      if (!commandAllowed) return false;
    }

    return true;
  }

  // Reset request counts (called every minute)
  private resetRequestCounts(): void {
    this.requestCounts.clear();
    this.lastResetTime = Date.now();
  }

  // Get permission statistics
  getStats() {
    return {
      totalIsolates: this.isolatePermissions.size,
      permissionDistribution: this.getPermissionDistribution(),
      activeRequestCounts: this.requestCounts.size,
      lastResetTime: this.lastResetTime,
      timestamp: Date.now()
    };
  }

  // Get distribution of permission profiles
  private getPermissionDistribution(): Record<PermissionLevel, number> {
    const distribution: Record<PermissionLevel, number> = {
      basic: 0,
      interactive: 0,
      data: 0,
      advanced: 0
    };

    for (const profile of this.isolatePermissions.values()) {
      distribution[profile.name]++;
    }

    return distribution;
  }

  // Remove permissions for an isolate (cleanup)
  removePermissions(isolateId: string): void {
    this.isolatePermissions.delete(isolateId);
    this.requestCounts.delete(isolateId);
    console.log(`[PermissionManager] Removed permissions for isolate ${isolateId}`);
  }
}

// Utility functions for permission checking
export function validateOperation(
  permissionManager: PermissionManager,
  isolateId: string,
  operation: string,
  payload?: any
): { allowed: boolean; reason?: string } {
  // Check if permissions are assigned
  const profile = permissionManager.getPermissions(isolateId);
  if (!profile) {
    return { allowed: false, reason: 'No permissions assigned to isolate' };
  }

  // Check specific permission
  if (!permissionManager.hasPermission(isolateId, operation, payload)) {
    return { allowed: false, reason: `Operation not permitted: ${operation}` };
  }

  // Check rate limits
  if (!permissionManager.checkRateLimit(isolateId, operation)) {
    return { allowed: false, reason: `Rate limit exceeded for: ${operation}` };
  }

  return { allowed: true };
}
