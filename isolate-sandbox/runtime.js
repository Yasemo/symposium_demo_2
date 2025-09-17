// Isolate Runtime Environment for Symposium Demo
// This code runs inside Deno Web Workers to execute user-generated content safely

// Define global sendToMain function before importing proxy API
globalThis.sendToMain = function(message) {
  self.postMessage(message);
};

// Import the proxy API to provide enhanced capabilities
import "./proxy-api.js";

// Resource monitoring utilities for isolates
class ResourceMonitor {
  constructor(isolateId = 'runtime') {
    this.startTime = performance.now();
    this.memoryUsage = [];
    this.cpuUsage = [];
    this.lastCpuTime = performance.now();
    this.isolateId = isolateId;
  }

  recordMemoryUsage() {
    try {
      // Use Deno's memory info API for accurate memory tracking
      const memInfo = Deno.memoryUsage();
      const heapUsedMB = memInfo.heapUsed / (1024 * 1024);
      const rssMB = memInfo.rss / (1024 * 1024);

      this.memoryUsage.push(heapUsedMB);

      console.log(`[${this.isolateId}] Memory - Heap: ${heapUsedMB.toFixed(2)}MB, RSS: ${rssMB.toFixed(2)}MB`);

      if (heapUsedMB > 128) { // 128MB limit
        throw new Error(`Memory limit exceeded: ${heapUsedMB.toFixed(2)}MB > 128MB`);
      }
    } catch (error) {
      // Fallback to performance.memory if available
      if (typeof performance !== 'undefined' && performance.memory) {
        const perfMem = performance.memory;
        const usedMB = perfMem.usedJSHeapSize / (1024 * 1024);
        this.memoryUsage.push(usedMB);
        console.log(`[${this.isolateId}] Memory (fallback) - Used: ${usedMB.toFixed(2)}MB`);
      } else {
        console.warn(`[${this.isolateId}] Unable to track memory usage accurately`);
      }
    }
  }

  recordCpuUsage() {
    try {
      const currentTime = performance.now();
      const timeDiff = currentTime - this.lastCpuTime;

      // Estimate CPU usage based on time spent
      const estimatedCpuPercent = Math.min(100, (timeDiff / 10));
      this.cpuUsage.push(estimatedCpuPercent);

      console.log(`[${this.isolateId}] CPU Usage: ${estimatedCpuPercent.toFixed(2)}%`);
      this.lastCpuTime = currentTime;
    } catch (error) {
      console.warn(`[${this.isolateId}] Unable to track CPU usage:`, error);
    }
  }

  getExecutionTime() {
    return performance.now() - this.startTime;
  }

  checkTimeout() {
    const executionTime = this.getExecutionTime();
    if (executionTime > 30000) { // 30 seconds
      throw new Error(`Execution timeout: ${executionTime.toFixed(2)}ms > 30000ms`);
    }
  }

  getStats() {
    return {
      executionTime: this.getExecutionTime(),
      averageMemoryUsage: this.memoryUsage.length > 0
        ? this.memoryUsage.reduce((a, b) => a + b, 0) / this.memoryUsage.length
        : 0,
      peakMemoryUsage: this.memoryUsage.length > 0
        ? Math.max(...this.memoryUsage)
        : 0,
      averageCpuUsage: this.cpuUsage.length > 0
        ? this.cpuUsage.reduce((a, b) => a + b, 0) / this.cpuUsage.length
        : 0,
      peakCpuUsage: this.cpuUsage.length > 0
        ? Math.max(...this.cpuUsage)
        : 0,
      isolateId: this.isolateId
    };
  }

  logResourceSummary() {
    const stats = this.getStats();
    console.log(`[${this.isolateId}] Resource Summary:`, {
      executionTime: `${stats.executionTime.toFixed(2)}ms`,
      memory: `${stats.averageMemoryUsage.toFixed(2)}MB avg, ${stats.peakMemoryUsage.toFixed(2)}MB peak`,
      cpu: `${stats.averageCpuUsage.toFixed(2)}% avg, ${stats.peakCpuUsage.toFixed(2)}% peak`
    });
  }
}

// Isolate-scoped storage implementation
class IsolateStorage {
  constructor(type, isolateId, quotaBytes) {
    this.type = type; // 'local' or 'session'
    this.isolateId = isolateId;
    this.quotaBytes = quotaBytes;
    this.storageKey = `isolate_${type}_${isolateId}`;
    this.data = new Map();
    this.bytesUsed = 0;

    // Load existing data from persistent storage
    this.loadFromPersistentStorage();
  }

  // Load data from the main thread's persistent storage
  async loadFromPersistentStorage() {
    try {
      // Request data from main thread
      const result = await this.callMainAPI('getData', { key: this.storageKey });
      if (result && typeof result === 'object') {
        this.data = new Map(Object.entries(result));
        this.bytesUsed = this.calculateBytesUsed();
        console.log(`[${this.isolateId}] Loaded ${this.data.size} items from ${this.type}Storage (${this.bytesUsed} bytes)`);
      }
    } catch (error) {
      console.warn(`[${this.isolateId}] Failed to load ${this.type}Storage:`, error);
    }
  }

  // Save data to persistent storage
  async saveToPersistentStorage() {
    try {
      const dataObject = Object.fromEntries(this.data);
      await this.callMainAPI('saveData', { key: this.storageKey, value: dataObject });
    } catch (error) {
      console.error(`[${this.isolateId}] Failed to save ${this.type}Storage:`, error);
    }
  }

  // Storage API methods
  getItem(key) {
    const value = this.data.get(key);
    return value !== undefined ? String(value) : null;
  }

  setItem(key, value) {
    const valueStr = String(value);
    const keySize = key.length * 2; // UTF-16 bytes
    const valueSize = valueStr.length * 2;
    const totalSize = keySize + valueSize;

    // Check quota
    const currentUsageWithoutOldValue = this.bytesUsed - (this.data.has(key) ? (key.length * 2 + String(this.data.get(key)).length * 2) : 0);
    if (currentUsageWithoutOldValue + totalSize > this.quotaBytes) {
      throw new Error(`Quota exceeded: ${this.type}Storage quota of ${this.quotaBytes} bytes would be exceeded`);
    }

    this.data.set(key, valueStr);
    this.bytesUsed = this.calculateBytesUsed();

    // Persist to main thread storage
    this.saveToPersistentStorage().catch(error => {
      console.warn(`[${this.isolateId}] Failed to persist ${this.type}Storage:`, error);
    });

    console.log(`[${this.isolateId}] ${this.type}Storage set: ${key} = ${valueStr.substring(0, 50)}${valueStr.length > 50 ? '...' : ''}`);
  }

  removeItem(key) {
    if (this.data.has(key)) {
      const oldValue = this.data.get(key);
      const keySize = key.length * 2;
      const valueSize = String(oldValue).length * 2;

      this.data.delete(key);
      this.bytesUsed -= (keySize + valueSize);

      // Persist changes
      this.saveToPersistentStorage().catch(error => {
        console.warn(`[${this.isolateId}] Failed to persist ${this.type}Storage removal:`, error);
      });

      console.log(`[${this.isolateId}] ${this.type}Storage removed: ${key}`);
    }
  }

  clear() {
    this.data.clear();
    this.bytesUsed = 0;

    // Clear from persistent storage
    this.callMainAPI('deleteData', { key: this.storageKey }).catch(error => {
      console.warn(`[${this.isolateId}] Failed to clear ${this.type}Storage:`, error);
    });

    console.log(`[${this.isolateId}] ${this.type}Storage cleared`);
  }

  key(index) {
    const keys = Array.from(this.data.keys());
    return keys[index] || null;
  }

  get length() {
    return this.data.size;
  }

  // Calculate total bytes used by storage
  calculateBytesUsed() {
    let total = 0;
    for (const [key, value] of this.data.entries()) {
      total += key.length * 2; // UTF-16 bytes for key
      total += String(value).length * 2; // UTF-16 bytes for value
    }
    return total;
  }

  // Get storage info for monitoring
  getStorageInfo() {
    return {
      type: this.type,
      isolateId: this.isolateId,
      itemCount: this.data.size,
      bytesUsed: this.bytesUsed,
      quotaBytes: this.quotaBytes,
      usagePercent: (this.bytesUsed / this.quotaBytes) * 100
    };
  }

  // Helper method to call main API
  async callMainAPI(method, params) {
    return new Promise((resolve, reject) => {
      const callId = crypto.randomUUID();

      const handleResponse = (event) => {
        if (event.data.type === 'apiResponse' && event.data.callId === callId) {
          self.removeEventListener('message', handleResponse);
          resolve(event.data.result);
        }
      };

      self.addEventListener('message', handleResponse);

      // Use the global sendToMain function
      if (typeof globalThis.sendToMain === 'function') {
        globalThis.sendToMain({
          type: 'apiCall',
          method,
          params,
          callId
        });
      } else {
        // Fallback if global sendToMain not available
        self.postMessage({
          type: 'apiCall',
          method,
          params,
          callId
        });
      }

      // Timeout after 5 seconds for storage operations
      setTimeout(() => {
        self.removeEventListener('message', handleResponse);
        reject(new Error('Storage API call timeout'));
      }, 5000);
    });
  }
}

class IsolateRuntime {
  constructor() {
    this.apiAccess = this.createAPIAccess();
    this.errorHandler = this.setupErrorHandling();
    this.logs = [];
    this.config = null;
    this.importedModules = new Map(); // Cache for imported modules
  // Initialize resource monitor for this isolate
    this.resourceMonitor = new ResourceMonitor(this.config?.blockId || 'runtime');

    // Initialize storage systems
    this.storageQuota = { localStorage: 5 * 1024 * 1024, sessionStorage: 1 * 1024 * 1024 }; // 5MB local, 1MB session
    this.localStorage = new IsolateStorage('local', this.config?.blockId || 'runtime', this.storageQuota.localStorage);
    this.sessionStorage = new IsolateStorage('session', this.config?.blockId || 'runtime', this.storageQuota.sessionStorage);
  }

  createVirtualDOM() {
    // Return empty object - we'll set up jsdom in executeContentBlock
    return {};
  }

  // Add minimal canvas support to deno-dom
  addCanvasSupportToDOM(document) {
    // Override createElement to add canvas support
    const originalCreateElement = document.createElement;
    document.createElement = (tagName) => {
      const element = originalCreateElement.call(document, tagName);

      // Add canvas-specific methods
      if (tagName === 'canvas') {
        element.getContext = (contextType) => {
          if (contextType === '2d') {
            return this.createCanvas2DContext();
          }
          return null;
        };
      }

      return element;
    };
  }

  // Create a minimal Canvas 2D context
  createCanvas2DContext() {
    return {
      // Basic properties
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      font: '10px sans-serif',

      // Basic methods
      clearRect: (x, y, w, h) => {
        console.log(`Canvas clearRect: ${x},${y} ${w}x${h}`);
      },
      fillRect: (x, y, w, h) => {
        console.log(`Canvas fillRect: ${x},${y} ${w}x${h}`);
      },
      strokeRect: (x, y, w, h) => {
        console.log(`Canvas strokeRect: ${x},${y} ${w}x${h}`);
      },
      fillText: (text, x, y) => {
        console.log(`Canvas fillText: "${text}" at ${x},${y}`);
      },
      measureText: (text) => {
        return { width: text ? text.length * 8 : 0 };
      },

      // Path methods
      beginPath: () => console.log('Canvas beginPath'),
      closePath: () => console.log('Canvas closePath'),
      moveTo: (x, y) => console.log(`Canvas moveTo: ${x},${y}`),
      lineTo: (x, y) => console.log(`Canvas lineTo: ${x},${y}`),
      stroke: () => console.log('Canvas stroke'),
      fill: () => console.log('Canvas fill'),

      // Arc methods
      arc: (x, y, radius, startAngle, endAngle) => {
        console.log(`Canvas arc: center ${x},${y} radius ${radius}`);
      },

      // Transform methods
      save: () => console.log('Canvas save'),
      restore: () => console.log('Canvas restore'),
      translate: (x, y) => console.log(`Canvas translate: ${x},${y}`),
      scale: (x, y) => console.log(`Canvas scale: ${x},${y}`),
      rotate: (angle) => console.log(`Canvas rotate: ${angle}rad`),

      // Gradient support
      createLinearGradient: (x0, y0, x1, y1) => {
        console.log(`Canvas createLinearGradient: (${x0},${y0}) to (${x1},${y1})`);
        return {
          addColorStop: (offset, color) => {
            console.log(`Gradient color stop: ${offset} = ${color}`);
          }
        };
      },

      // Image support (mock)
      drawImage: (image, sx, sy, sw, sh, dx, dy, dw, dh) => {
        if (image && image.complete) {
          console.log(`Canvas drawImage: ${image.width}x${image.height} image`);
        } else {
          console.warn('Canvas drawImage: Image not loaded');
        }
      }
    };
  }

  createAPIAccess() {
    // Provide controlled access to demo APIs
    return {
      demoAPI: {
        // Legacy method for backward compatibility
        getData: async (key) => {
          return await this.callMainAPI('getData', { key });
        },
        // New persistent storage methods
        saveData: async (key, value) => {
          return await this.callMainAPI('saveData', { key, value });
        },
        getData: async (key) => {
          return await this.callMainAPI('getData', { key });
        },
        deleteData: async (key) => {
          return await this.callMainAPI('deleteData', { key });
        },
        updateDisplay: (html) => {
          this.sendToMain({ type: 'updateDisplay', html });
        },
        logEvent: (eventType, data) => {
          this.sendToMain({ type: 'logEvent', eventType, data });
        }
      }
    };
  }

  setupErrorHandling() {
    // Global error handling for the isolate
    self.addEventListener('error', (event) => {
      console.error('Isolate runtime error:', event.error);
      this.sendToMain({
        type: 'error',
        error: event.error.message,
        stack: event.error.stack
      });
    });

    self.addEventListener('unhandledrejection', (event) => {
      console.error('Isolate unhandled rejection:', event.reason);
      this.sendToMain({
        type: 'error',
        error: event.reason?.message || 'Unhandled promise rejection',
        stack: event.reason?.stack
      });
    });
  }

  async executeContentBlock(code) {
    try {
      // Clear previous logs
      this.logs = [];

      console.log(`📝 Executing unified HTML content block - ${(code.html || '').length} chars`);

      // Record initial memory usage
      this.resourceMonitor.recordMemoryUsage();

      // Wait for proxy API to be ready
      await this.waitForAPIReady();

      // Defensive check: Ensure proxy API is ready
      if (!globalThis.symposium) {
        throw new Error('Proxy API not initialized - symposium object not found');
      }

      if (!globalThis.symposium.dom) {
        throw new Error('DOM API not available - symposium.dom not found');
      }

      if (typeof globalThis.symposium.dom.execute !== 'function') {
        throw new Error('DOM execute method not available');
      }

      // Validate that we have a complete HTML document
      if (!code.html || !code.html.trim().startsWith('<!DOCTYPE html>')) {
        throw new Error('Content blocks must be complete HTML documents starting with <!DOCTYPE html>');
      }

      // Use the orchestrator's DOM handler for unified HTML document execution
      const result = await globalThis.symposium.dom.execute(
        code.html,
        code.css || '', // Optional additional CSS
        code.javascript || '' // Optional additional JavaScript
      );

      // Set up minimal global APIs for compatibility
      this.setupMinimalGlobals();

      console.log('Unified HTML content block executed successfully via orchestrator');

      return {
        type: 'execution_result',
        success: result.success,
        html: result.html || '',
        css: result.css || '',
        javascript: result.javascript || '',
        logs: result.logs || [],
        error: result.error,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Content execution error:', error);

      // Provide more detailed error information
      const errorDetails = {
        message: error.message,
        stack: error.stack,
        hasSymposium: !!globalThis.symposium,
        hasDomAPI: !!(globalThis.symposium && globalThis.symposium.dom),
        hasExecuteMethod: !!(globalThis.symposium && globalThis.symposium.dom && typeof globalThis.symposium.dom.execute === 'function'),
        isUnifiedHTML: code.html && code.html.trim().startsWith('<!DOCTYPE html>')
      };

      console.error('API availability check:', errorDetails);

      return {
        type: 'execution_result',
        success: false,
        error: error.message,
        details: errorDetails,
        stack: error.stack,
        logs: this.logs,
        timestamp: Date.now()
      };
    }
  }

  // Wait for the proxy API to be ready
  async waitForAPIReady() {
    if (!globalThis.symposium) {
      console.log('[IsolateRuntime] Waiting for proxy API to initialize...');

      // Wait for symposium to be available
      let attempts = 0;
      while (!globalThis.symposium && attempts < 50) { // 5 seconds max
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!globalThis.symposium) {
        throw new Error('Proxy API failed to initialize within timeout');
      }
    }

    // Wait for the API to be marked as ready
    if (globalThis.symposium.ready && typeof globalThis.symposium.ready === 'function') {
      await globalThis.symposium.ready();
    }

    console.log('[IsolateRuntime] Proxy API is ready');
  }

  // Set up minimal global APIs for backward compatibility
  setupMinimalGlobals() {
    // Set up basic window and document objects for scripts that expect them
    if (!globalThis.window) {
      globalThis.window = {
        console: {
          log: (...args) => {
            const message = args.join(' ');
            this.logs.push(`LOG: ${message}`);
            console.log(`[Isolate] ${message}`);
          },
          error: (...args) => {
            const message = args.join(' ');
            this.logs.push(`ERROR: ${message}`);
            console.error(`[Isolate] ${message}`);
          },
          warn: (...args) => {
            const message = args.join(' ');
            this.logs.push(`WARN: ${message}`);
            console.warn(`[Isolate] ${message}`);
          }
        },
        setTimeout: (callback, delay) => {
          if (delay > 5000) delay = 5000;
          return setTimeout(callback, delay);
        },
        setInterval: (callback, delay) => {
          if (delay < 100) delay = 100;
          return setInterval(callback, delay);
        }
      };
    }

    // Expose storage APIs globally
    globalThis.localStorage = this.localStorage;
    globalThis.sessionStorage = this.sessionStorage;

    // Add our controlled API access
    globalThis.demoAPI = this.apiAccess.demoAPI;
  }

  async updateContentBlock(updates) {
    console.log('🔄 Update requested - executing with new code');
    console.log(' Update data:', {
      hasHtml: !!updates.html,
      hasCss: !!updates.css,
      hasJs: !!updates.javascript,
      htmlLength: updates.html?.length || 0,
      cssLength: updates.css?.length || 0,
      jsLength: updates.javascript?.length || 0
    });

    // Simply execute the updates as the new complete code
    const result = await this.executeContentBlock(updates);

    console.log('📤 Sending update result to main thread');
    return result;
  }

  injectCSS(css) {
    // Inject CSS into deno-dom document
    const styleElement = globalThis.document.createElement('style');
    styleElement.textContent = css;
    globalThis.document.head.appendChild(styleElement);

    console.log('Injecting CSS:', css.substring(0, 100) + (css.length > 100 ? '...' : ''));
    this.logs.push(`CSS injected: ${css.length} characters`);
  }

  // Extract and execute embedded scripts from HTML document
  async executeEmbeddedScripts(document) {
    const scripts = document.querySelectorAll('script');

    for (const script of scripts) {
      const scriptContent = script.textContent || script.innerText || '';

      if (scriptContent.trim()) {
        console.log(`Executing embedded script (${scriptContent.length} chars)`);
        this.logs.push(`Executing embedded script: ${scriptContent.length} characters`);

        try {
          await this.executeJavaScript(scriptContent);
        } catch (error) {
          console.error('Embedded script execution error:', error);
          this.logs.push(`Embedded script error: ${error.message}`);
          // Continue with other scripts even if one fails
        }
      }
    }
  }



  async executeJavaScript(javascript) {
    try {
      // Parse and handle import statements
      const { imports, code } = await this.parseImports(javascript);

      // Execute imports and make them available globally
      for (const [varName, url] of Object.entries(imports)) {
        try {
          const module = await this.importModule(url);
          globalThis[varName] = module.default || module;
          console.log(`Imported ${varName} from ${url}`);
        } catch (importError) {
          console.error(`Failed to import ${varName} from ${url}:`, importError);
          this.logs.push(`Import failed: ${varName} from ${url}`);
          // Continue execution even if import fails
        }
      }

      // Execute the remaining JavaScript code
      if (code.trim()) {
        const userFunction = new Function(code);
        const result = await userFunction();

        console.log('JavaScript executed successfully');
        this.logs.push('JavaScript executed successfully');

        return result;
      }

      return undefined;
    } catch (error) {
      console.error('JavaScript execution error:', error);
      this.logs.push(`JavaScript error: ${error.message}`);
      throw error;
    }
  }

  // Parse import statements from JavaScript code
  async parseImports(javascript) {
    const imports = {};
    let code = javascript;

    // Match import statements
    const importRegex = /^import\s+(.+?)\s+from\s+['"](.+?)['"];?$/gm;
    let match;

    while ((match = importRegex.exec(javascript)) !== null) {
      const importStatement = match[0];
      const importClause = match[1].trim();
      const url = match[2].trim();

      // Handle different import patterns
      if (importClause.includes('* as')) {
        // import * as name from 'url'
        const varName = importClause.split('* as')[1].trim();
        imports[varName] = url;
      } else if (importClause.includes('{')) {
        // import { name } from 'url' - not fully supported yet
        console.warn('Named imports not fully supported yet:', importClause);
        this.logs.push(`Warning: Named imports not fully supported: ${importClause}`);
      } else if (importClause.includes(',')) {
        // import name, { named } from 'url' - not fully supported yet
        console.warn('Mixed imports not fully supported yet:', importClause);
        this.logs.push(`Warning: Mixed imports not fully supported: ${importClause}`);
      } else {
        // import name from 'url'
        const varName = importClause.trim();
        imports[varName] = url;
      }

      // Remove the import statement from the code
      code = code.replace(importStatement, '');
    }

    return { imports, code: code.trim() };
  }

  sendToMain(message) {
    self.postMessage(message);
  }

  // Validate URL against whitelist
  isAllowedUrl(url) {
    if (!this.config?.networkAccess?.allowedUrls) {
      return false;
    }

    const allowedUrls = this.config.networkAccess.allowedUrls;
    return allowedUrls.some(allowedUrl => url.startsWith(allowedUrl));
  }

  // Handle URL imports
  async importModule(url) {
    try {
      // Validate URL
      if (!this.isAllowedUrl(url)) {
        throw new Error(`Import from unauthorized URL blocked: ${url}`);
      }

      // Check cache first
      if (this.importedModules.has(url)) {
        console.log(`Using cached module: ${url}`);
        return this.importedModules.get(url);
      }

      console.log(`Importing module: ${url}`);
      this.logs.push(`Importing: ${url}`);

      // Perform the import with timeout
      const importPromise = import(url);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Import timeout')), 10000);
      });

      const module = await Promise.race([importPromise, timeoutPromise]);

      // Cache the imported module
      this.importedModules.set(url, module);

      console.log(`Successfully imported: ${url}`);
      this.logs.push(`Imported: ${url}`);

      return module;

    } catch (error) {
      console.error(`Import failed for ${url}:`, error);
      this.logs.push(`Import failed: ${url} - ${error.message}`);
      throw error;
    }
  }



  getMemoryStats() {
    if (this.resourceMonitor) {
      return this.resourceMonitor.getStats();
    }

    // Fallback if no resource monitor is available
    try {
      const memInfo = Deno.memoryUsage();
      return {
        executionTime: 0,
        averageMemoryUsage: memInfo.heapUsed / (1024 * 1024),
        peakMemoryUsage: memInfo.heapUsed / (1024 * 1024),
        averageCpuUsage: 0,
        peakCpuUsage: 0,
        isolateId: this.config?.blockId || 'runtime'
      };
    } catch (error) {
      console.warn('Unable to get memory stats:', error);
      return {
        executionTime: 0,
        averageMemoryUsage: 0,
        peakMemoryUsage: 0,
        averageCpuUsage: 0,
        peakCpuUsage: 0,
        isolateId: this.config?.blockId || 'runtime'
      };
    }
  }

  async callMainAPI(method, params) {
    return new Promise((resolve, reject) => {
      const callId = crypto.randomUUID();

      const handleResponse = (event) => {
        if (event.data.type === 'apiResponse' && event.data.callId === callId) {
          self.removeEventListener('message', handleResponse);
          resolve(event.data.result);
        }
      };

      self.addEventListener('message', handleResponse);

      // Use the global sendToMain function
      if (typeof globalThis.sendToMain === 'function') {
        globalThis.sendToMain({
          type: 'apiCall',
          method,
          params,
          callId
        });
      } else {
        // Fallback if global sendToMain not available
        self.postMessage({
          type: 'apiCall',
          method,
          params,
          callId
        });
      }

      // Timeout after 10 seconds
      setTimeout(() => {
        self.removeEventListener('message', handleResponse);
        reject(new Error('API call timeout'));
      }, 10000);
    });
  }

  // Get storage statistics for monitoring
  getStorageStats() {
    return {
      localStorage: this.localStorage.getStorageInfo(),
      sessionStorage: this.sessionStorage.getStorageInfo(),
      timestamp: Date.now()
    };
  }
}

// Initialize runtime when isolate starts
const runtime = new IsolateRuntime();

// Listen for execution requests from main thread
self.addEventListener('message', async (event) => {
  const { type, code, updates, config, requestId } = event.data;

  // Store config if provided
  if (config) {
    runtime.config = config;
  }

  if (type === 'execute') {
    const result = await runtime.executeContentBlock(code);
    self.postMessage(result);
  } else if (type === 'update') {
    const result = await runtime.updateContentBlock(updates);
    self.postMessage(result);
  } else if (type === 'get_memory_stats') {
    // Handle memory stats request
    const stats = runtime.getMemoryStats();
    self.postMessage({
      type: 'memory_stats_response',
      requestId,
      stats,
      timestamp: Date.now()
    });
  } else if (type === 'get_storage_stats') {
    // Handle storage stats request
    const stats = runtime.getStorageStats();
    self.postMessage({
      type: 'storage_stats_response',
      requestId,
      stats,
      timestamp: Date.now()
    });
  }
});

// Signal that the isolate is ready
self.postMessage({
  type: 'isolate_ready',
  timestamp: Date.now()
});
