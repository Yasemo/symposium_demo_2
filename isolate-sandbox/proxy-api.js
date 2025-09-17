// Isolate Proxy API for Symposium Demo
// Provides natural JavaScript APIs that proxy to main runtime capabilities

// Internal method to communicate with main runtime
async function _callCapability(operation, payload) {
  return new Promise((resolve, reject) => {
    const callId = crypto.randomUUID();

    // Set up response handler
    const handleResponse = (event) => {
      if (event.data.type === 'apiResponse' && event.data.callId === callId) {
        // Remove listener
        self.removeEventListener('message', handleResponse);

        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data.result);
        }
      }
    };

    // Add response listener
    self.addEventListener('message', handleResponse);

    // Send request to main runtime using global sendToMain function
    if (typeof globalThis.sendToMain === 'function') {
      globalThis.sendToMain({
        type: 'apiCall',
        method: operation,
        params: payload,
        callId
      });
    } else {
      // Fallback to direct postMessage if global sendToMain not available
      self.postMessage({
        type: 'apiCall',
        method: operation,
        params: payload,
        callId
      });
    }

    // Set timeout
    setTimeout(() => {
      self.removeEventListener('message', handleResponse);
      reject(new Error(`Capability call timeout: ${operation}`));
    }, 30000); // 30 second timeout
  });
}

// Global symposium object that isolates can use to access capabilities
globalThis.symposium = {
  // Ready state management
  _ready: false,
  _readyPromise: null,
  _readyResolve: null,

  // Initialize ready promise
  _initReadyState() {
    if (!this._readyPromise) {
      this._readyPromise = new Promise((resolve) => {
        this._readyResolve = resolve;
      });
    }
  },

  // Mark API as ready
  _markReady() {
    this._ready = true;
    if (this._readyResolve) {
      this._readyResolve();
    }
    console.log('[Symposium Proxy API] Ready for use');
  },

  // Wait for API to be ready
  async ready() {
    this._initReadyState();
    if (this._ready) {
      return true;
    }
    await this._readyPromise;
    return true;
  },
  // File System Operations
  fileSystem: {
    /**
     * Read a file from the file system
     * @param {string} path - File path to read
     * @param {Object} options - Read options
     * @returns {Promise<Object>} File content and metadata
     */
    async readFile(path, options = {}) {
      return await _callCapability('file.read', {
        path,
        encoding: options.encoding || 'utf8',
        maxSize: options.maxSize
      });
    },

    /**
     * Write content to a file
     * @param {string} path - File path to write
     * @param {string|Uint8Array} content - Content to write
     * @param {Object} options - Write options
     * @returns {Promise<Object>} Write result
     */
    async writeFile(path, content, options = {}) {
      return await _callCapability('file.write', {
        path,
        content,
        encoding: options.encoding || 'utf8',
        createDirectories: options.createDirectories || false
      });
    },

    /**
     * Delete a file
     * @param {string} path - File path to delete
     * @returns {Promise<Object>} Delete result
     */
    async deleteFile(path) {
      return await _callCapability('file.delete', { path });
    },

    /**
     * List directory contents
     * @param {string} path - Directory path to list
     * @param {Object} options - List options
     * @returns {Promise<Object>} Directory listing
     */
    async listDirectory(path, options = {}) {
      return await _callCapability('file.list', {
        path,
        recursive: options.recursive || false,
        pattern: options.pattern
      });
    },

    /**
     * Get file information
     * @param {string} path - File path to check
     * @returns {Promise<Object>} File metadata
     */
    async getFileInfo(path) {
      return await _callCapability('file.info', { path });
    },

    /**
     * Check if file exists
     * @param {string} path - File path to check
     * @returns {Promise<Object>} Existence result
     */
    async fileExists(path) {
      return await _callCapability('file.exists', { path });
    }
  },

  // Network Operations (Enhanced)
  network: {
    /**
     * Make an HTTP request with enhanced capabilities
     * @param {string} url - URL to request
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response data
     */
    async fetch(url, options = {}) {
      return await _callCapability('network.request', {
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        timeout: options.timeout || 10000
      });
    },

    /**
     * Send a webhook
     * @param {string} url - Webhook URL
     * @param {Object} payload - Data to send
     * @returns {Promise<Object>} Webhook result
     */
    async sendWebhook(url, payload) {
      return await _callCapability('network.webhook', {
        url,
        payload,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  // Canvas/Graphics Operations
  canvas: {
    /**
     * Create a new canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     * @returns {Promise<Object>} Canvas context
     */
    async createCanvas(width, height) {
      return await _callCapability('canvas.create', {
        width,
        height,
        contextType: '2d'
      });
    },

    /**
     * Execute canvas drawing operations
     * @param {string} canvasId - Canvas identifier
     * @param {Array} operations - Drawing operations
     * @returns {Promise<Object>} Drawing result
     */
    async draw(canvasId, operations) {
      return await _callCapability('canvas.draw', {
        canvasId,
        operations
      });
    },

    /**
     * Export canvas as image
     * @param {string} canvasId - Canvas identifier
     * @param {string} format - Export format (png, jpeg, svg)
     * @returns {Promise<Object>} Image data
     */
    async exportImage(canvasId, format = 'png') {
      return await _callCapability('canvas.export', {
        canvasId,
        format
      });
    }
  },

  // Database Operations
  database: {
    /**
     * Execute a database query
     * @param {string} query - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object>} Query results
     */
    async query(query, params = []) {
      return await _callCapability('database.query', {
        query,
        params
      });
    },

    /**
     * Execute multiple database queries in a transaction
     * @param {Array} queries - Array of query objects
     * @returns {Promise<Object>} Transaction result
     */
    async transaction(queries) {
      return await _callCapability('database.transaction', {
        queries
      });
    },

    /**
     * Get database connection information
     * @returns {Promise<Object>} Database info
     */
    async getInfo() {
      return await _callCapability('database.getInfo', {});
    }
  },

  // Process Execution
  process: {
    /**
     * Execute a system command
     * @param {string} command - Command to execute
     * @param {Array} args - Command arguments
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Command result
     */
    async execute(command, args = [], options = {}) {
      return await _callCapability('process.execute', {
        command,
        args,
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout || 30000
      });
    }
  },

  // DOM Operations (moved from worker to orchestrator)
  dom: {
    /**
     * Parse HTML content
     * @param {string} html - HTML content to parse
     * @returns {Promise<Object>} Parse result
     */
    async parse(html) {
      return await _callCapability('dom.parse', { html });
    },

    /**
     * Execute HTML/CSS/JavaScript content
     * @param {string} html - HTML content
     * @param {string} css - CSS content
     * @param {string} javascript - JavaScript content
     * @returns {Promise<Object>} Execution result
     */
    async execute(html, css = '', javascript = '') {
      return await _callCapability('dom.execute', {
        html,
        css,
        javascript
      });
    },

    /**
     * Update existing content
     * @param {Object} updates - Content updates
     * @returns {Promise<Object>} Update result
     */
    async update(updates) {
      return await _callCapability('dom.update', updates);
    },

    /**
     * Inject CSS into content
     * @param {string} css - CSS content to inject
     * @param {string} html - Optional HTML context
     * @returns {Promise<Object>} Injection result
     */
    async injectCss(css, html = '') {
      return await _callCapability('dom.inject_css', {
        css,
        html
      });
    },

    /**
     * Inject JavaScript into content
     * @param {string} javascript - JavaScript content to inject
     * @param {string} html - Optional HTML context
     * @returns {Promise<Object>} Injection result
     */
    async injectJs(javascript, html = '') {
      return await _callCapability('dom.inject_js', {
        javascript,
        html
      });
    }
  },

  // Utility functions
  utils: {
    /**
     * Generate a temporary file path
     * @param {string} extension - File extension
     * @returns {string} Temporary file path
     */
    generateTempPath(extension = '') {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 9);
      return `temp/tmp_${timestamp}_${random}${extension ? '.' + extension : ''}`;
    },

    /**
     * Get current timestamp
     * @returns {number} Current timestamp
     */
    getTimestamp() {
      return Date.now();
    },

    /**
     * Generate a unique ID
     * @returns {string} Unique identifier
     */
    generateId() {
      return crypto.randomUUID();
    }
  },

  // Internal method to communicate with main runtime
  async _callCapability(operation, payload) {
    return new Promise((resolve, reject) => {
      const callId = crypto.randomUUID();

      // Set up response handler
      const handleResponse = (event) => {
        if (event.data.type === 'apiResponse' && event.data.callId === callId) {
          // Remove listener
          self.removeEventListener('message', handleResponse);

          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      };

      // Add response listener
      self.addEventListener('message', handleResponse);

      // Send request to main runtime using global sendToMain function
      if (typeof globalThis.sendToMain === 'function') {
        globalThis.sendToMain({
          type: 'apiCall',
          method: operation,
          params: payload,
          callId
        });
      } else {
        // Fallback to direct postMessage if global sendToMain not available
        self.postMessage({
          type: 'apiCall',
          method: operation,
          params: payload,
          callId
        });
      }

      // Set timeout
      setTimeout(() => {
        self.removeEventListener('message', handleResponse);
        reject(new Error(`Capability call timeout: ${operation}`));
      }, 30000); // 30 second timeout
    });
  }
};

// Convenience aliases for common operations
globalThis.symposium.fs = globalThis.symposium.fileSystem;
globalThis.symposium.db = globalThis.symposium.database;
globalThis.symposium.net = globalThis.symposium.network;
globalThis.symposium.proc = globalThis.symposium.process;

// Legacy compatibility aliases
globalThis.symposium.readFile = globalThis.symposium.fileSystem.readFile.bind(globalThis.symposium.fileSystem);
globalThis.symposium.writeFile = globalThis.symposium.fileSystem.writeFile.bind(globalThis.symposium.fileSystem);

// Log that the proxy API is loaded
console.log('[Symposium Proxy API] Initialized - Available capabilities:');
console.log('  - symposium.fileSystem (or symposium.fs)');
console.log('  - symposium.network (or symposium.net)');
console.log('  - symposium.canvas');
console.log('  - symposium.database (or symposium.db)');
console.log('  - symposium.process (or symposium.proc)');
console.log('  - symposium.dom');
console.log('  - symposium.utils');
console.log('');
console.log('Example usage:');
console.log('  const data = await symposium.readFile("data/config.json");');
console.log('  await symposium.writeFile("temp/output.txt", "Hello World");');
console.log('  const result = await symposium.db.query("SELECT * FROM users");');
console.log('  const domResult = await symposium.dom.execute("<h1>Hello</h1>", "h1{color:red}", "console.log(\"Hi!\")");');

// Mark the API as ready for use
globalThis.symposium._markReady();
