// Isolate Runtime Environment for Symposium Demo
// This code runs inside Deno Web Workers to execute user-generated content safely

class IsolateRuntime {
  constructor() {
    this.virtualDOM = this.createVirtualDOM();
    this.apiAccess = this.createAPIAccess();
    this.errorHandler = this.setupErrorHandling();
    this.logs = [];
    this.config = null;
    this.importedModules = new Map(); // Cache for imported modules
    this.elements = new Map(); // Store elements by ID
    this.elementCounter = 0; // For generating unique IDs
  }

  createVirtualDOM() {
    // Create a lightweight DOM-like structure for safe content execution
    const runtime = this; // Capture runtime instance for binding

    return {
      document: {
        createElement: (tagName) => {
          const element = {
            tagName,
            children: [],
            attributes: {},
            style: {},
            textContent: '',
            _innerHTML: '', // Private backing for innerHTML
            appendChild: function(child) {
              if (child) {
                this.children.push(child);
              }
              return child;
            },
            setAttribute: function(name, value) {
              this.attributes[name] = value;
              // Store element by ID if it has one
              if (name === 'id') {
                runtime.elements.set(value, this);
              }
            },
            getAttribute: function(name) {
              return this.attributes[name];
            },
            // Safe innerHTML getter/setter
            get innerHTML() { return this._innerHTML || ''; },
            set innerHTML(value) {
              if (typeof value === 'string') {
                this._innerHTML = value;
              } else {
                this._innerHTML = '';
              }
            },
            // Add canvas-specific methods
            getContext: function(contextType) {
              if (tagName === 'canvas') {
                // Return a mock 2D context for Chart.js
                return {
                  canvas: this,
                  clearRect: function() { /* mock */ },
                  fillRect: function() { /* mock */ },
                  strokeRect: function() { /* mock */ },
                  fillText: function() { /* mock */ },
                  measureText: function() { return { width: 0 }; },
                  beginPath: function() { /* mock */ },
                  moveTo: function() { /* mock */ },
                  lineTo: function() { /* mock */ },
                  stroke: function() { /* mock */ },
                  fill: function() { /* mock */ },
                  arc: function() { /* mock */ },
                  save: function() { /* mock */ },
                  restore: function() { /* mock */ },
                  translate: function() { /* mock */ },
                  scale: function() { /* mock */ },
                  rotate: function() { /* mock */ },
                  // Add more canvas context methods as needed
                  drawImage: function() { /* mock */ },
                  createLinearGradient: function() {
                    return {
                      addColorStop: function() { /* mock */ }
                    };
                  },
                  createRadialGradient: function() {
                    return {
                      addColorStop: function() { /* mock */ }
                    };
                  }
                };
              }
              return null;
            }
          };

          // Add ID property with getter/setter for direct assignment
          Object.defineProperty(element, 'id', {
            get: function() { return this.attributes.id; },
            set: function(value) {
              this.attributes.id = value;
              if (value) {
                runtime.elements.set(value, this);
              }
            }
          });

          return element;
        },
        getElementById: function(id) { return runtime.findElementById(id); },
        querySelector: function(selector) { return runtime.querySelector(selector); },
        addEventListener: function(type, listener) {
          // Store event listeners for virtual DOM
          if (!this._eventListeners) this._eventListeners = {};
          if (!this._eventListeners[type]) this._eventListeners[type] = [];
          this._eventListeners[type].push(listener);
        },
        removeEventListener: function(type, listener) {
          // Remove event listeners from virtual DOM
          if (this._eventListeners && this._eventListeners[type]) {
            const index = this._eventListeners[type].indexOf(listener);
            if (index > -1) {
              this._eventListeners[type].splice(index, 1);
            }
          }
        },
        body: {
          innerHTML: '',
          children: [],
          style: {},
          appendChild: function(child) {
            this.children.push(child);
            return child;
          },
          // Ensure body is never null
          get innerHTML() { return this._innerHTML || ''; },
          set innerHTML(value) { this._innerHTML = value; }
        },
        head: {
          children: [],
          appendChild: function(child) {
            this.children.push(child);
            return child;
          }
        }
      },
      window: {
        alert: (msg) => runtime.sendToMain({ type: 'alert', message: msg }),
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
          // Limited timeout functionality
          if (delay > 5000) delay = 5000; // Max 5 second delay
          return setTimeout(callback, delay);
        },
        setInterval: (callback, delay) => {
          // Limited interval functionality
          if (delay < 100) delay = 100; // Min 100ms interval
          return setInterval(callback, delay);
        }
      }
    };
  }

  createAPIAccess() {
    // Provide controlled access to demo APIs
    return {
      demoAPI: {
        getData: async (key) => {
          return await this.callMainAPI('getData', { key });
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
      // Clear previous logs and elements
      this.logs = [];
      this.elements.clear();

      // Set up execution environment
      globalThis.document = this.virtualDOM.document;
      globalThis.window = this.virtualDOM.window;
      globalThis.demoAPI = this.apiAccess.demoAPI;

      // Inject CSS if provided
      if (code.css) {
        this.injectCSS(code.css);
      }

      // Process HTML if provided
      if (code.html) {
        this.processHTML(code.html);
      }

      // Execute JavaScript if provided
      if (code.javascript) {
        await this.executeJavaScript(code.javascript, code.data);
      }

    // Return execution results
    return {
      type: 'execution_result',
      success: true,
      html: this.virtualDOM.document.body?.innerHTML || '',
      css: code.css || '', // Return the original CSS
      javascript: code.javascript || '', // Return the original JavaScript
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
    try {
      // Update CSS if provided
      if (updates.css) {
        this.injectCSS(updates.css);
      }

      // Update HTML if provided
      if (updates.html) {
        this.processHTML(updates.html);
      }

      // Update JavaScript if provided
      if (updates.javascript) {
        await this.executeJavaScript(updates.javascript, updates.data);
      }

      return {
        type: 'update_result',
        success: true,
        html: this.virtualDOM.document.body.innerHTML,
        css: updates.css || '', // Return the updated CSS
        javascript: updates.javascript || '', // Return the updated JavaScript
        logs: this.logs,
        timestamp: Date.now()
      };

    } catch (error) {
      console.error('Content update error:', error);
      return {
        type: 'update_result',
        success: false,
        error: error.message,
        stack: error.stack,
        logs: this.logs,
        timestamp: Date.now()
      };
    }
  }

  injectCSS(css) {
    // In a real implementation, this would inject CSS into the virtual DOM
    // For now, we'll just log it
    console.log('Injecting CSS:', css.substring(0, 100) + (css.length > 100 ? '...' : ''));
    this.logs.push(`CSS injected: ${css.length} characters`);
  }

  processHTML(html) {
    // Process template literals in HTML
    const processedHtml = this.processTemplates(html);

    // In a real implementation, this would parse and process HTML
    // For now, we'll just set it as the body content
    this.virtualDOM.document.body.innerHTML = processedHtml;
    console.log('Processing HTML:', processedHtml.substring(0, 100) + (processedHtml.length > 100 ? '...' : ''));
    this.logs.push(`HTML processed: ${processedHtml.length} characters`);
  }

  // Process template literals like {{DATA.title}} in HTML
  processTemplates(html) {
    if (!html || typeof html !== 'string') {
      return html;
    }

    // Replace {{expression}} with evaluated values
    return html.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
      try {
        // Create a safe evaluation context
        const context = {
          DATA: globalThis.DATA || {},
          console: globalThis.console,
          Math: Math,
          Date: Date,
          // Add other safe globals as needed
        };

        // Evaluate the expression in the safe context
        const result = this.evaluateExpression(expression.trim(), context);

        // Return the result or empty string if undefined/null
        return result !== undefined && result !== null ? String(result) : '';
      } catch (error) {
        console.error('Template evaluation error:', error);
        this.logs.push(`Template error: ${expression} - ${error.message}`);
        return match; // Return original template on error
      }
    });
  }

  // Safely evaluate JavaScript expressions
  evaluateExpression(expression, context) {
    try {
      // Create a function with the context as parameters
      const paramNames = Object.keys(context);
      const paramValues = Object.values(context);

      const evaluator = new Function(...paramNames, `return ${expression}`);
      return evaluator(...paramValues);
    } catch (error) {
      console.error('Expression evaluation error:', error);
      throw error;
    }
  }

  async executeJavaScript(javascript, data) {
    try {
      // Set up data if provided
      if (data) {
        globalThis.DATA = data;
        console.log('Data injected into isolate:', data);
      } else {
        globalThis.DATA = {};
      }

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

  // Virtual DOM helper methods
  findElementById(id) {
    console.log(`Looking for element with id: ${id}`);
    return this.elements.get(id) || null;
  }

  querySelector(selector) {
    console.log(`Querying selector: ${selector}`);

    // Simple selector parsing - just handle basic ID and class selectors
    if (selector.startsWith('#')) {
      // ID selector
      const id = selector.substring(1);
      return this.findElementById(id);
    } else if (selector.startsWith('.')) {
      // Class selector - not fully implemented
      console.log(`Class selector ${selector} not fully implemented`);
      return null;
    } else {
      // Tag selector - not fully implemented
      console.log(`Tag selector ${selector} not fully implemented`);
      return null;
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
