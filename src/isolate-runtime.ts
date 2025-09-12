// Isolate Runtime Types and Interfaces for Symposium Demo
// TypeScript definitions for code that runs inside Deno isolates

export interface IsolateConfig {
  blockId: string;
  timeoutMs: number;
  maxMemoryMB: number;
  allowedAPIs: string[];
  staticData?: any;
}

export interface ContentBlockCode {
  html: string;
  css: string;
  javascript: string;
  data?: any;
}

export interface ExecutionResult {
  type: 'execution_result' | 'update_result';
  success: boolean;
  html?: string;
  css?: string;
  javascript?: string;
  logs?: string[];
  error?: string;
  timestamp: number;
}

export interface IsolateMessage {
  type: 'execute' | 'update' | 'api_call' | 'api_response' | 'log' | 'error' | 'alert';
  code?: ContentBlockCode;
  updates?: Partial<ContentBlockCode>;
  config?: IsolateConfig;
  method?: string;
  params?: any;
  callId?: string;
  args?: any;
  message?: string;
  timestamp: number;
}

export interface VirtualDOMDocument {
  createElement: (tagName: string) => VirtualDOMElement;
  getElementById: (id: string) => VirtualDOMElement | null;
  querySelector: (selector: string) => VirtualDOMElement | null;
  body: VirtualDOMElement;
  head: VirtualDOMElement;
}

export interface VirtualDOMElement {
  tagName: string;
  children: VirtualDOMElement[];
  attributes: Record<string, any>;
  style: Record<string, any>;
  textContent: string;
  innerHTML: string;
  appendChild: (child: VirtualDOMElement) => VirtualDOMElement;
  setAttribute: (name: string, value: any) => void;
  getAttribute: (name: string) => any;
}

export interface VirtualWindow {
  alert: (msg: string) => void;
  console: {
    log: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
  };
  setTimeout: (callback: Function, delay: number) => number;
  setInterval: (callback: Function, delay: number) => number;
}

export interface DemoAPI {
  getData: (key: string) => Promise<any>;
  updateDisplay: (html: string) => void;
  logEvent: (eventType: string, data: any) => void;
}

export interface IsolateRuntime {
  virtualDOM: {
    document: VirtualDOMDocument;
    window: VirtualWindow;
  };
  apiAccess: {
    demoAPI: DemoAPI;
  };
  logs: string[];
  config: IsolateConfig | null;

  createVirtualDOM(): {
    document: VirtualDOMDocument;
    window: VirtualWindow;
  };

  createAPIAccess(): {
    demoAPI: DemoAPI;
  };

  setupErrorHandling(): void;

  executeContentBlock(code: ContentBlockCode): Promise<ExecutionResult>;

  updateContentBlock(updates: Partial<ContentBlockCode>): Promise<ExecutionResult>;

  injectCSS(css: string): void;

  processHTML(html: string): void;

  executeJavaScript(javascript: string, data?: any): Promise<any>;

  sendToMain(message: IsolateMessage): void;

  callMainAPI(method: string, params: any): Promise<any>;
}

// Runtime Environment Constants
export const RUNTIME_CONSTANTS = {
  MAX_EXECUTION_TIME: 30000, // 30 seconds
  MAX_MEMORY_MB: 128,
  MAX_API_CALLS_PER_SECOND: 10,
  ALLOWED_GLOBAL_VARS: ['console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'],
  FORBIDDEN_KEYWORDS: ['eval', 'Function', 'XMLHttpRequest', 'fetch', 'WebSocket', 'Worker']
} as const;

// Security validation functions
export function validateJavaScript(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for forbidden keywords
  for (const keyword of RUNTIME_CONSTANTS.FORBIDDEN_KEYWORDS) {
    if (code.includes(keyword)) {
      errors.push(`Forbidden keyword: ${keyword}`);
    }
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /eval\s*\(/,
    /Function\s*\(/,
    /new\s+Function/,
    /setTimeout\s*\(\s*['"`]/,
    /setInterval\s*\(\s*['"`]/
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      errors.push(`Dangerous pattern detected: ${pattern}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function sanitizeHTML(html: string): string {
  // Basic HTML sanitization - remove script tags and dangerous attributes
  return html
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gis, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
}

export function validateCSS(css: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for dangerous CSS patterns
  const dangerousPatterns = [
    /javascript:/i,
    /expression\s*\(/i,
    /vbscript:/i,
    /data:\s*text\/html/i
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(css)) {
      errors.push(`Dangerous CSS pattern detected: ${pattern}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Resource monitoring utilities
export class ResourceMonitor {
  private startTime: number;
  private memoryUsage: number[];

  constructor() {
    this.startTime = Date.now();
    this.memoryUsage = [];
  }

  recordMemoryUsage(): void {
    // In a real implementation, this would track actual memory usage
    // For now, we'll simulate it
    const simulatedUsage = Math.random() * RUNTIME_CONSTANTS.MAX_MEMORY_MB;
    this.memoryUsage.push(simulatedUsage);

    if (simulatedUsage > RUNTIME_CONSTANTS.MAX_MEMORY_MB) {
      throw new Error(`Memory limit exceeded: ${simulatedUsage}MB > ${RUNTIME_CONSTANTS.MAX_MEMORY_MB}MB`);
    }
  }

  getExecutionTime(): number {
    return Date.now() - this.startTime;
  }

  checkTimeout(): void {
    if (this.getExecutionTime() > RUNTIME_CONSTANTS.MAX_EXECUTION_TIME) {
      throw new Error(`Execution timeout: ${this.getExecutionTime()}ms > ${RUNTIME_CONSTANTS.MAX_EXECUTION_TIME}ms`);
    }
  }

  getStats(): {
    executionTime: number;
    averageMemoryUsage: number;
    peakMemoryUsage: number;
  } {
    return {
      executionTime: this.getExecutionTime(),
      averageMemoryUsage: this.memoryUsage.length > 0
        ? this.memoryUsage.reduce((a, b) => a + b, 0) / this.memoryUsage.length
        : 0,
      peakMemoryUsage: this.memoryUsage.length > 0
        ? Math.max(...this.memoryUsage)
        : 0
    };
  }
}

// API call rate limiter
export class APIRateLimiter {
  private calls: number[] = [];
  private windowMs = 1000; // 1 second window

  canMakeCall(): boolean {
    const now = Date.now();

    // Remove old calls outside the window
    this.calls = this.calls.filter(call => now - call < this.windowMs);

    return this.calls.length < RUNTIME_CONSTANTS.MAX_API_CALLS_PER_SECOND;
  }

  recordCall(): void {
    this.calls.push(Date.now());
  }

  getRemainingCalls(): number {
    const now = Date.now();
    this.calls = this.calls.filter(call => now - call < this.windowMs);
    return Math.max(0, RUNTIME_CONSTANTS.MAX_API_CALLS_PER_SECOND - this.calls.length);
  }
}

// Error types for isolate execution
export class IsolateError extends Error {
  constructor(
    message: string,
    public readonly type: 'security' | 'resource' | 'execution' | 'validation',
    public readonly details?: any
  ) {
    super(message);
    this.name = 'IsolateError';
  }
}

export class SecurityError extends IsolateError {
  constructor(message: string, details?: any) {
    super(message, 'security', details);
    this.name = 'SecurityError';
  }
}

export class ResourceError extends IsolateError {
  constructor(message: string, details?: any) {
    super(message, 'resource', details);
    this.name = 'ResourceError';
  }
}

export class ValidationError extends IsolateError {
  constructor(message: string, details?: any) {
    super(message, 'validation', details);
    this.name = 'ValidationError';
  }
}

// Utility functions for isolate communication
export function createIsolateMessage(
  type: IsolateMessage['type'],
  data: Partial<IsolateMessage> = {}
): IsolateMessage {
  return {
    type,
    timestamp: Date.now(),
    ...data
  };
}

export function isValidIsolateMessage(message: any): message is IsolateMessage {
  return (
    message &&
    typeof message === 'object' &&
    typeof message.type === 'string' &&
    typeof message.timestamp === 'number'
  );
}
