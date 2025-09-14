# Symposium Demo Technical Implementation Guide with Deno Isolates

## Overview

This guide provides detailed implementation instructions for a Symposium demo that validates the core architecture using **Deno isolates** for secure content block execution. This approach mirrors the production architecture where user-generated content runs in completely isolated environments.

## Demo Feature Scope with Isolates

1. **Chat Interface**: Real-time conversation with OpenRouter API
2. **Content Block Generation**: AI creates HTML/CSS/JS that executes in Deno isolates
3. **Isolated Content Execution**: Each content block runs in its own secure isolate
4. **Context Management**: Include/exclude chat messages and content block data
5. **Live Editing**: Modify content blocks with isolate re-execution
6. **Safe API Access**: Controlled access to demo APIs through isolate boundaries
7. **Simplified Interface**: Just HTML, CSS, and JavaScript editors (no dynamic variables)

## Technology Stack

- **Runtime**: Deno (latest stable version)
- **Backend**: Deno HTTP server with WebSocket support
- **Content Execution**: Deno Web Workers (isolates)
- **Frontend**: Vanilla HTML, CSS, JavaScript
- **AI Integration**: OpenRouter API
- **Real-time Communication**: WebSockets for chat

## Project Structure

```
symposium-demo/
├── main.ts                 # Deno server entry point
├── static/
│   ├── index.html         # Main demo interface
│   ├── styles.css         # UI styling
│   └── app.js            # Frontend JavaScript
├── src/
│   ├── openrouter-client.ts   # OpenRouter API integration
│   ├── chat-handler.ts    # WebSocket chat management
│   ├── isolate-manager.ts # Deno isolate management
│   ├── content-executor.ts # Content block execution in isolates
│   ├── isolate-runtime.ts # Code that runs inside isolates
│   └── context-manager.ts # Chat context management
├── isolate-sandbox/
│   └── runtime.js         # Isolate execution environment
└── deno.json             # Deno configuration
```

## Core Components Implementation

### 1. Deno Server Setup (main.ts)

**Purpose**: HTTP server with WebSocket support and isolate management.

**Key Requirements**:
- Serve static files and handle WebSocket connections
- Initialize isolate manager for content block execution
- Provide API endpoints for content operations
- Manage isolate lifecycle and cleanup

**Server Setup with Isolate Support**:
```typescript
interface ServerConfig {
  port: number;
  isolateManager: IsolateManager;
  maxConcurrentIsolates: number;
  isolateTimeoutMs: number;
}

interface ContentBlockRequest {
  type: 'execute' | 'update' | 'terminate';
  blockId: string;
  code?: {
    html: string;
    css: string;
    javascript: string;
    data: any;
  };
}
```

**HTTP Endpoints**:
- `GET /` - Serve main interface
- `GET /static/*` - Serve static assets
- `POST /api/execute-content-block` - Execute code in new isolate
- `POST /api/update-content-block` - Update existing isolate
- `DELETE /api/content-block/:id` - Terminate isolate
- `WebSocket /ws` - Real-time chat and content updates

### 2. Isolate Manager (isolate-manager.ts)

**Purpose**: Manage Deno Web Workers as secure isolates for content block execution.

**Key Requirements**:
- Create and manage isolated Web Workers
- Handle communication between main thread and isolates
- Implement resource limits and timeouts
- Clean up inactive isolates
- Provide secure API access to isolates

**Isolate Management**:
```typescript
interface IsolateConfig {
  blockId: string;
  timeoutMs: number;
  maxMemoryMB: number;
  allowedAPIs: string[];
  staticData?: any;
}

interface IsolateManager {
  createIsolate(config: IsolateConfig): Promise<ContentBlockIsolate>;
  getIsolate(blockId: string): ContentBlockIsolate | null;
  terminateIsolate(blockId: string): Promise<void>;
  listActiveIsolates(): string[];
  cleanupInactive(): Promise<void>;
}

class ContentBlockIsolate {
  private worker: Worker;
  private blockId: string;
  private lastActivity: number;
  private isActive: boolean;

  constructor(blockId: string, workerScript: string) {
    this.blockId = blockId;
    this.worker = new Worker(new URL(workerScript, import.meta.url), {
      type: 'module',
      deno: {
        permissions: {
          net: false,    // No network access by default
          read: false,   // No file system access
          write: false,  // No file writing
          env: false,    // No environment variables
          run: false,    // No subprocesses
          ffi: false     // No foreign function interface
        }
      }
    });
    this.setupCommunication();
  }

  async executeCode(code: ContentBlockCode): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Execution timeout'));
      }, 30000); // 30 second timeout

      this.worker.postMessage({
        type: 'execute',
        code,
        timestamp: Date.now()
      });

      this.worker.addEventListener('message', (event) => {
        clearTimeout(timeoutId);
        const result = event.data;
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error));
        }
      }, { once: true });
    });
  }
}
```

**Resource Management**:
- Limit memory usage per isolate
- Implement execution timeouts
- Track CPU usage and terminate runaway processes
- Pool isolates for reuse when possible

### 3. Isolate Runtime Environment (isolate-sandbox/runtime.js)

**Purpose**: Code that runs inside each Deno isolate to execute user-generated content safely.

**Key Requirements**:
- Provide a virtual DOM-like environment
- Execute HTML/CSS/JavaScript safely
- Expose controlled APIs for content blocks
- Handle errors and resource limits
- Communicate results back to main thread

**Runtime Implementation**:
```javascript
// This code runs inside the Deno isolate
class IsolateRuntime {
  constructor() {
    this.virtualDOM = this.createVirtualDOM();
    this.apiAccess = this.createAPIAccess();
    this.errorHandler = this.setupErrorHandling();
  }

  createVirtualDOM() {
    // Create a lightweight DOM-like structure
    return {
      document: {
        createElement: (tagName) => ({ tagName, children: [], attributes: {} }),
        getElementById: (id) => this.findElementById(id),
        querySelector: (selector) => this.querySelector(selector),
        body: { innerHTML: '', children: [] },
        head: { children: [] }
      },
      window: {
        alert: (msg) => this.sendToMain({ type: 'alert', message: msg }),
        console: {
          log: (...args) => this.sendToMain({ type: 'log', args }),
          error: (...args) => this.sendToMain({ type: 'error', args })
        }
      }
    };
  }

  createAPIAccess() {
    // Provide controlled access to demo APIs
    return {
      demoAPI: {
        getData: async (key) => {
          const result = await this.callMainAPI('getData', { key });
          return result;
        },
        updateDisplay: (html) => {
          this.sendToMain({ type: 'updateDisplay', html });
        }
      }
    };
  }

  async executeContentBlock(code) {
    try {
      // Set up execution environment
      globalThis.document = this.virtualDOM.document;
      globalThis.window = this.virtualDOM.window;
      globalThis.demoAPI = this.apiAccess.demoAPI;

      // Inject CSS
      this.injectCSS(code.css);

      // Process HTML
      this.processHTML(code.html);

      // Execute JavaScript with data
      globalThis.DATA = code.data;
      const userFunction = new Function(code.javascript);
      await userFunction();

      // Return execution results
      return {
        success: true,
        html: this.virtualDOM.document.body.innerHTML,
        logs: this.getLogs(),
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: Date.now()
      };
    }
  }

  sendToMain(message) {
    self.postMessage(message);
  }

  async callMainAPI(method, params) {
    return new Promise((resolve) => {
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
    });
  }
}

// Initialize runtime when isolate starts
const runtime = new IsolateRuntime();

// Listen for execution requests
self.addEventListener('message', async (event) => {
  const { type, code } = event.data;
  
  if (type === 'execute') {
    const result = await runtime.executeContentBlock(code);
    self.postMessage(result);
  }
});
```

### 4. Content Executor (content-executor.ts)

**Purpose**: Coordinate content block execution across isolates and manage results.

**Key Requirements**:
- Route execution requests to appropriate isolates
- Handle isolate communication and API calls
- Manage content block state and updates
- Provide live editing capabilities
- Generate HTML output for frontend display

**Execution Coordination**:
```typescript
interface ContentExecutor {
  executeContentBlock(blockId: string, code: ContentBlockCode): Promise<ExecutionResult>;
  updateContentBlock(blockId: string, updates: Partial<ContentBlockCode>): Promise<ExecutionResult>;
  getContentBlockOutput(blockId: string): Promise<string>; // HTML for iframe
  terminateContentBlock(blockId: string): Promise<void>;
}

class ContentBlockExecutor implements ContentExecutor {
  constructor(private isolateManager: IsolateManager) {}

  async executeContentBlock(blockId: string, code: ContentBlockCode): Promise<ExecutionResult> {
    // Create new isolate for this content block
    const isolate = await this.isolateManager.createIsolate({
      blockId,
      timeoutMs: 30000,
      maxMemoryMB: 128,
      allowedAPIs: ['demoAPI']
    });

    // Execute code in isolate
    const result = await isolate.executeCode(code);

    // Handle isolate API calls
    isolate.onAPICall(async (method, params, callId) => {
      const apiResult = await this.handleAPICall(method, params);
      isolate.sendAPIResponse(callId, apiResult);
    });

    return result;
  }

  async generateHTMLOutput(blockId: string, result: ExecutionResult): Promise<string> {
    // Create complete HTML document for iframe display
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: system-ui; margin: 0; padding: 16px; }
          ${result.css || ''}
        </style>
      </head>
      <body>
        ${result.html || ''}
        <script>
          // Handle any runtime communication
          window.parent.postMessage({ 
            type: 'contentBlockReady', 
            blockId: '${blockId}' 
          }, '*');
        </script>
      </body>
      </html>
    `;
  }

  private async handleAPICall(method: string, params: any): Promise<any> {
    // Implement safe API calls that isolates can make
    switch (method) {
      case 'getData':
        return this.getDemoData(params.key);
      case 'logEvent':
        console.log('Content Block Event:', params);
        return { success: true };
      default:
        throw new Error(`Unknown API method: ${method}`);
    }
  }
}
```

### 5. Live Editing with Isolates

**Purpose**: Enable real-time editing of content blocks with immediate re-execution in isolates.

**Live Editing Flow**:
```typescript
interface LiveEditor {
  onCodeChange(blockId: string, newCode: Partial<ContentBlockCode>): void;
  setupDebouncing(): void;
  handleExecutionResults(blockId: string, result: ExecutionResult): void;
}

class LiveContentEditor implements LiveEditor {
  private pendingUpdates = new Map<string, Partial<ContentBlockCode>>();
  private debounceTimers = new Map<string, number>();

  onCodeChange(blockId: string, newCode: Partial<ContentBlockCode>): void {
    // Store pending changes
    this.pendingUpdates.set(blockId, {
      ...this.pendingUpdates.get(blockId),
      ...newCode
    });

    // Debounce execution
    this.debounceExecution(blockId);
  }

  private debounceExecution(blockId: string): void {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(blockId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      const updates = this.pendingUpdates.get(blockId);
      if (updates) {
        await this.executeUpdates(blockId, updates);
        this.pendingUpdates.delete(blockId);
      }
      this.debounceTimers.delete(blockId);
    }, 300); // 300ms debounce

    this.debounceTimers.set(blockId, timer);
  }

  private async executeUpdates(blockId: string, updates: Partial<ContentBlockCode>): Promise<void> {
    try {
      // Update content block in isolate
      const result = await contentExecutor.updateContentBlock(blockId, updates);
      
      // Generate new HTML output
      const htmlOutput = await contentExecutor.generateHTMLOutput(blockId, result);
      
      // Update frontend iframe
      this.updateIframe(blockId, htmlOutput);
      
      // Send results to frontend
      this.broadcastUpdate(blockId, result);
      
    } catch (error) {
      console.error('Live editing error:', error);
      this.broadcastError(blockId, error.message);
    }
  }
}
```

## Frontend Integration with Isolates

### 1. Content Block Display (app.js)

**Purpose**: Render isolate-executed content blocks in the frontend interface.

**Frontend Isolate Integration**:
```javascript
class ContentBlockManager {
  constructor() {
    this.activeBlocks = new Map();
    this.editors = new Map();
  }

  async createContentBlock(blockData) {
    const blockId = crypto.randomUUID();
    
    // Send code to backend for isolate execution
    const response = await fetch('/api/execute-content-block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockId,
        code: blockData.code
      })
    });

    const result = await response.json();
    
    if (result.success) {
      this.renderContentBlock(blockId, result);
      this.setupLiveEditing(blockId, blockData.code);
    } else {
      this.displayError(blockId, result.error);
    }
  }

  renderContentBlock(blockId, executionResult) {
    const container = document.createElement('div');
    container.className = 'content-block';
    container.innerHTML = `
      <div class="content-block-header">
        <h3>${executionResult.title || 'Content Block'}</h3>
        <button onclick="editContentBlock('${blockId}')">Edit</button>
        <button onclick="deleteContentBlock('${blockId}')">Delete</button>
      </div>
      <div class="content-block-output">
        <iframe 
          id="block-${blockId}" 
          src="/api/content-block-output/${blockId}"
          sandbox="allow-scripts allow-same-origin"
          style="width: 100%; height: 400px; border: none;">
        </iframe>
      </div>
      <div class="content-block-editor" id="editor-${blockId}" style="display: none;">
        <!-- Live editor will be inserted here -->
      </div>
    `;

    document.getElementById('content-blocks').appendChild(container);
    this.activeBlocks.set(blockId, container);
  }

  setupLiveEditing(blockId, initialCode) {
    const editor = new LiveCodeEditor(blockId, initialCode);
    
    editor.onCodeChange = async (newCode) => {
      // Send updates to backend for re-execution in isolate
      try {
        const response = await fetch('/api/update-content-block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blockId,
            updates: newCode
          })
        });

        const result = await response.json();
        
        if (result.success) {
          // Iframe will automatically update via server-sent events
          this.updateExecutionStatus(blockId, 'success');
        } else {
          this.displayExecutionError(blockId, result.error);
        }
      } catch (error) {
        console.error('Update error:', error);
      }
    };

    this.editors.set(blockId, editor);
  }
}
```

### 2. Real-time Updates via WebSocket

**Purpose**: Stream isolate execution results and updates to the frontend in real-time.

**WebSocket Message Handling**:
```javascript
class IsolateUpdateHandler {
  constructor(websocket) {
    this.ws = websocket;
    this.setupMessageHandlers();
  }

  setupMessageHandlers() {
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'content_block_executed':
          this.handleContentBlockExecution(message);
          break;
        case 'content_block_updated':
          this.handleContentBlockUpdate(message);
          break;
        case 'isolate_error':
          this.handleIsolateError(message);
          break;
        case 'isolate_terminated':
          this.handleIsolateTermination(message);
          break;
      }
    });
  }

  handleContentBlockExecution(message) {
    const { blockId, result } = message;
    
    // Update iframe source to show new execution result
    const iframe = document.getElementById(`block-${blockId}`);
    if (iframe) {
      iframe.src = `/api/content-block-output/${blockId}?t=${Date.now()}`;
    }

    // Update execution logs
    this.updateExecutionLogs(blockId, result.logs);
  }

  handleIsolateError(message) {
    const { blockId, error } = message;
    
    // Display error in content block
    this.displayError(blockId, error);
    
    // Update editor with error highlighting
    const editor = this.editors.get(blockId);
    if (editor) {
      editor.highlightError(error);
    }
  }
}
```

## Security and Performance Considerations

### 1. Isolate Security

**Security Measures**:
- No network access from isolates by default
- No file system access
- No subprocess execution
- Memory limits per isolate
- Execution timeouts
- API whitelisting for controlled access

**Resource Management**:
```typescript
interface IsolateSecurityConfig {
  maxExecutionTimeMs: 30000;     // 30 seconds max
  maxMemoryMB: 128;              // 128MB RAM limit
  maxCPUPercent: 80;             // 80% CPU limit
  allowedAPIs: string[];         // Whitelist of allowed API calls
  networkAccess: boolean;        // Default: false
  fileSystemAccess: boolean;     // Default: false
}
```

### 2. Performance Optimization

**Isolate Pooling**:
- Reuse isolates when possible
- Pre-warm isolate pool for faster startup
- Clean up inactive isolates automatically
- Monitor resource usage across all isolates

**Execution Optimization**:
- Cache compilation results when possible
- Debounce rapid code changes
- Stream execution results for large outputs
- Implement progressive rendering for complex content

## Validation with Isolates

### 1. Architecture Validation

**Isolate-Specific Testing**:
- Content blocks execute in complete isolation
- No cross-isolate interference
- Secure API access through controlled channels
- Resource limits prevent system overload
- Error isolation - one failure doesn't affect others

### 2. User Experience Validation

**Live Editing with Isolates**:
- Code changes trigger immediate re-execution
- Visual feedback during isolate processing
- Error handling and display
- Performance remains smooth with multiple active blocks

### 3. Security Validation

**Isolate Security Testing**:
- Verify no access to main process resources
- Test resource limit enforcement
- Validate API access controls
- Confirm isolate termination works correctly

## Success Metrics for Isolate Implementation

### 1. Performance Metrics
- Isolate startup time < 500ms
- Code execution time < 2 seconds for typical blocks
- Memory usage stays within limits
- CPU usage distributes appropriately

### 2. Security Metrics
- Zero unauthorized access attempts succeed
- All resource limits enforced correctly
- API access properly controlled
- Isolate cleanup prevents resource leaks

### 3. User Experience Metrics
- Smooth live editing experience
- Clear error messages and handling
- Responsive interface during isolate operations
- Reliable content block functionality

This isolate-based implementation provides the **same security model as the production Symposium architecture** while being simple enough for demo validation. It proves that user-generated content can execute safely and performantly in complete isolation while still providing rich interactivity and real-time editing capabilities.

<h1>Hello, World!</h1>

h1 {
  color: red;
  font-size: 2em;
}
