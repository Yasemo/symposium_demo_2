// Isolate Runtime Environment for Symposium Demo
// This code runs inside Deno Web Workers to execute user-generated content safely

import { DOMParser } from "deno-dom";

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

class IsolateRuntime {
  constructor() {
    this.apiAccess = this.createAPIAccess();
    this.errorHandler = this.setupErrorHandling();
    this.logs = [];
    this.config = null;
    this.importedModules = new Map(); // Cache for imported modules
  }

  createVirtualDOM() {
    // Initialize resource monitor for this isolate
    this.resourceMonitor = new ResourceMonitor(this.config?.blockId || 'runtime');

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

      // Create deno-dom instance with real browser APIs
      const htmlContent = code.html || '<html><body></body></html>';
      const document = new DOMParser().parseFromString(htmlContent, "text/html");

      // Set up global browser APIs using real deno-dom implementations
      globalThis.document = document;

      // Create minimal window object with essential properties
      globalThis.window = {
        document: document,
        navigator: { userAgent: "Deno Isolate" },
        location: { href: "http://localhost", hostname: "localhost" },
        console: {
          log: (...args) => {
            const message = args.join(' ');
            runtime.logs.push(`LOG: ${message}`);
            runtime.sendToMain({ type: 'log', args });
          },
          error: (...args) => {
            const message = args.join(' ');
            runtime.logs.push(`ERROR: ${message}`);
            runtime.sendToMain({ type: 'error', args });
          },
          warn: (...args) => {
            const message = args.join(' ');
            runtime.logs.push(`WARN: ${message}`);
            runtime.sendToMain({ type: 'warn', args });
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

      globalThis.navigator = globalThis.window.navigator;
      // Don't override globalThis.location - worker already has it

      // Add our controlled API access
      globalThis.demoAPI = this.apiAccess.demoAPI;

      // Override fetch to validate URLs (using global fetch)
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (!this.isAllowedUrl(url)) {
          throw new Error(`Fetch blocked: ${url}`);
        }
        console.log(`Fetching: ${url}`);
        return await originalFetch(url, options);
      };

      // Inject CSS if provided
      if (code.css) {
        this.injectCSS(code.css);
      }

      // Execute JavaScript if provided
      if (code.javascript) {
        await this.executeJavaScript(code.javascript);
      }

      // Return execution results
      return {
        type: 'execution_result',
        success: true,
        html: globalThis.document.body?.innerHTML || '',
        css: code.css || '',
        javascript: code.javascript || '',
        logs: this.logs,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Content execution error:', error);
      return {
        type: 'execution_result',
        success: false,
        error: error.message,
        stack: error.stack,
        logs: this.logs,
        timestamp: Date.now()
      };
    }
  }

  async updateContentBlock(updates) {
    // For now, updates are handled by re-executing with new content
    // In the future, this could be optimized to update existing jsdom instances
    console.log('Update requested - re-executing with new content');
    return await this.executeContentBlock(updates);
  }

  injectCSS(css) {
    // Inject CSS into deno-dom document
    const styleElement = globalThis.document.createElement('style');
    styleElement.textContent = css;
    globalThis.document.head.appendChild(styleElement);

    console.log('Injecting CSS:', css.substring(0, 100) + (css.length > 100 ? '...' : ''));
    this.logs.push(`CSS injected: ${css.length} characters`);
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

      this.sendToMain({
        type: 'apiCall',
        method,
        params,
        callId
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        self.removeEventListener('message', handleResponse);
        reject(new Error('API call timeout'));
      }, 10000);
    });
  }
}

// Initialize runtime when isolate starts
const runtime = new IsolateRuntime();

// Listen for execution requests from main thread
self.addEventListener('message', async (event) => {
  const { type, code, updates, config } = event.data;

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
  }
});

// Signal that the isolate is ready
self.postMessage({
  type: 'isolate_ready',
  timestamp: Date.now()
});
