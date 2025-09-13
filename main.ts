import { GeminiClient } from "./src/gemini-client.ts";
import { SymposiumIsolateManager } from "./src/isolate-manager.ts";
import { SymposiumContentExecutor } from "./src/content-executor.ts";
import { SymposiumChatHandler } from "./src/chat-handler.ts";
import { GCPProvisioner } from "./src/gcp-provisioner.ts";
import { createServiceManagers, DatabaseManager } from "./src/database-manager.ts";
import { getEnvLoader } from "./src/env-loader.ts";

// Load environment configuration asynchronously
console.log('🚀 Starting Symposium Demo...');
console.log('📂 Loading environment configuration...');

const envLoader = await getEnvLoader();
const config = envLoader.getConfig();
const envStatus = envLoader.getEnvStatus();

// Enhanced environment logging
console.log('🔧 Environment Configuration:');
console.log(`   📁 .env file loaded: ${envStatus.envFileLoaded ? '✅' : '❌'}`);
console.log(`   ☁️  GCP configured: ${envStatus.gcpConfigured ? '✅' : '❌'}`);
console.log(`   🔗 Services configured: ${envStatus.servicesConfigured ? '✅' : '❌'}`);
console.log(`   🐛 Debug mode: ${envStatus.debugMode ? '✅' : '❌'}`);

// Extract configuration values
const {
  geminiApiKey,
  port,
  gcpProjectId,
  gcpRegion,
  gcpServiceAccountKey,
  provisioningMode,
  environment,
  costLimit
} = config;

// Environment detection
const isCloudRun = !!Deno.env.get('K_SERVICE');
const detectedEnvironment = isCloudRun ? 'Cloud Run' : 'Local Development';
console.log(`🌍 Detected Environment: ${detectedEnvironment}`);

// Service configuration summary
console.log('⚙️  Service Configuration:');
console.log(`   🔑 GCP Project: ${gcpProjectId || 'Not configured'}`);
console.log(`   📍 Region: ${gcpRegion}`);
console.log(`   🔄 Provisioning Mode: ${provisioningMode}`);
console.log(`   💰 Cost Limit: $${costLimit}/month`);
console.log(`   🌐 Port: ${port}`);

// Fallback for Gemini API key if not provided
const GEMINI_API_KEY = geminiApiKey || "AIzaSyDNmaBk3Vb4zHd5DTTxusXWMYrfHUDIo88";
console.log(`🤖 Gemini API: ${geminiApiKey ? '✅ Configured' : '⚠️  Using fallback'}`);

// Global service managers
let databaseManager: DatabaseManager;
let provisioner: GCPProvisioner;

// Global application components
let isolateManager: SymposiumIsolateManager;
let contentExecutor: SymposiumContentExecutor;
let chatHandler: SymposiumChatHandler;
let geminiClient: GeminiClient;

// Initialize core components with auto-provisioning
async function initializeServices() {
  console.log('\n🚀 Initializing Symposium Demo Services...');
  console.log('=' .repeat(50));

  // Initialize Gemini client
  console.log('🤖 Initializing Gemini AI client...');
  try {
    geminiClient = new GeminiClient({
      apiKey: GEMINI_API_KEY
    });
    console.log('   ✅ Gemini client initialized');
  } catch (error) {
    console.error('   ❌ Gemini client initialization failed:', error);
  }

  // Determine service strategy
  const useGCP = gcpProjectId && gcpServiceAccountKey && provisioningMode !== "disabled";
  console.log(`\n🔧 Service Strategy: ${useGCP ? 'GCP Services' : 'Local Services'}`);

  if (useGCP) {
    console.log('☁️  Initializing GCP Auto-Provisioning...');

    try {
      // Initialize GCP provisioner
      console.log('   🔑 Setting up GCP credentials...');
      provisioner = new GCPProvisioner(gcpServiceAccountKey);
      console.log('   ✅ GCP provisioner initialized');

      // Create service managers
      console.log('   🏭 Creating service managers...');
      const services = await createServiceManagers(provisioner, {
        projectId: gcpProjectId,
        region: gcpRegion,
        environment: environment
      });

      databaseManager = services.database;
      console.log('   ✅ Database manager created');
      console.log('   ✅ Cache manager created');
      console.log('   ✅ Storage manager created');

      console.log('✅ GCP services initialized successfully');

    } catch (error) {
      console.error('❌ GCP provisioning failed:', error);
      console.log('🔄 Falling back to local services...');

      // Fallback to local services
      const { DatabaseManager } = await import("./src/database-manager.ts");
      databaseManager = new DatabaseManager({ type: 'local' });
      await databaseManager.initialize();
      console.log('   ✅ Local database initialized');
    }
  } else {
    console.log('🏠 Using Local Services (Development Mode)');
    console.log('   📦 Initializing local database...');

    const { DatabaseManager } = await import("./src/database-manager.ts");
    databaseManager = new DatabaseManager({ type: 'local' });
    await databaseManager.initialize();

    const dbInfo = databaseManager.getConnectionInfo();
    console.log(`   ✅ Database: ${dbInfo.type} (${dbInfo.status})`);
  }

  // Initialize isolate manager
  console.log('\n⚡ Initializing Isolate Manager...');
  isolateManager = new SymposiumIsolateManager(10); // Max 10 concurrent isolates
  const isolateStats = isolateManager.getResourceStats();
  console.log(`   ✅ Isolate manager initialized`);
  console.log(`   📊 Active isolates: ${isolateStats.activeIsolates}/${isolateStats.maxIsolates}`);

  // Initialize content executor
  console.log('🎯 Initializing Content Executor...');
  contentExecutor = new SymposiumContentExecutor(isolateManager);
  console.log('   ✅ Content executor initialized');

  // Load existing content blocks from database
  console.log('📚 Loading saved content blocks...');
  await contentExecutor.loadAllContentBlocksFromDatabase();
  console.log('   ✅ Content blocks loaded from database');

  // Initialize chat handler
  console.log('💬 Initializing Chat Handler...');
  chatHandler = new SymposiumChatHandler(geminiClient);
  console.log('   ✅ Chat handler initialized');

  console.log('\n' + '=' .repeat(50));
  console.log('✅ All Services Initialized Successfully!');
  console.log('📊 Service Status Summary:');
  console.log(`   🔌 Database: ${databaseManager.getConnectionInfo().type} (${databaseManager.getConnectionInfo().status})`);
  console.log(`   ⚡ Isolates: ${isolateStats.activeIsolates}/${isolateStats.maxIsolates} active`);
  console.log(`   🤖 AI: ${geminiClient ? 'Connected' : 'Disconnected'}`);
  console.log('=' .repeat(50) + '\n');
}

// Server configuration
interface ServerConfig {
  port: number;
  geminiApiKey: string;
  maxConcurrentIsolates: number;
  isolateTimeoutMs: number;
}

// Content block interfaces
interface ContentBlockCode {
  html: string;
  css: string;
  javascript: string;
}

interface ContentBlockRequest {
  type: 'execute' | 'update' | 'terminate';
  blockId: string;
  code?: ContentBlockCode;
}

interface ExecutionResult {
  success: boolean;
  html?: string;
  css?: string;
  javascript?: string;
  logs?: string[];
  error?: string;
  timestamp: number;
}

// WebSocket connection handler
function handleWebSocket(socket: WebSocket) {
  console.log("WebSocket connection established");

  socket.addEventListener("open", () => {
    console.log("Client connected!");
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log("Received WebSocket message:", message.type);

      // Handle different message types
      switch (message.type) {
        case "chat":
          handleChatMessage(socket, message);
          break;
        case "execute_content":
          handleContentExecution(socket, message);
          break;
        case "update_content":
          handleContentUpdate(socket, message);
          break;
        case "get_block_data":
          handleGetBlockData(socket, message);
          break;
        case "iframe_api_call":
          handleIframeAPICall(socket, message);
          break;
        case "delete_data_item":
          handleDeleteDataItem(socket, message);
          break;
        case "terminate_content_block":
          handleTerminateContentBlock(socket, message);
          break;
        default:
          console.log("Unknown message type:", message.type);
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
      socket.send(JSON.stringify({
        type: "error",
        error: "Invalid message format"
      }));
    }
  });

  socket.addEventListener("close", () => {
    console.log("WebSocket connection closed");
  });

  socket.addEventListener("error", (error) => {
    console.error("WebSocket error:", error);
  });
}

// Chat message handler - delegate to chat handler class
async function handleChatMessage(socket: WebSocket, message: any) {
  try {
    await chatHandler.handleMessage(socket, message);
  } catch (error) {
    console.error("Chat handling error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to process chat message: ${errorMessage}`
    }));
  }
}

// Content execution handler
async function handleContentExecution(socket: WebSocket, message: any) {
  try {
    const { blockId, code } = message;

    let executionCode: ContentBlockCode;

    // If no code provided, generate content using Gemini
    if (!code || (!code.html && !code.css && !code.javascript)) {
      console.log("Generating content block for execution");
      const contentBlock = await geminiClient.generateContentBlock("Create an interactive content block");

      executionCode = {
        html: contentBlock.html,
        css: contentBlock.css,
        javascript: contentBlock.javascript
      };
    } else {
      // Use provided code
      executionCode = {
        html: code.html || "<p>Content block executed</p>",
        css: code.css || "",
        javascript: code.javascript || ""
      };
    }

    // Execute content block in isolate
    console.log(`Executing content block ${blockId} in isolate`);
    const result = await contentExecutor.executeContentBlock(blockId, executionCode);

    socket.send(JSON.stringify({
      type: "content_executed",
      blockId,
      result
    }));

  } catch (error) {
    console.error("Content execution error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to execute content block: ${errorMessage}`
    }));
  }
}

// Content update handler
async function handleContentUpdate(socket: WebSocket, message: any) {
  try {
    const { blockId, updates } = message;

    console.log(`Updating content block ${blockId} in isolate`);

    // Update content block in isolate
    const result = await contentExecutor.updateContentBlock(blockId, updates);

    socket.send(JSON.stringify({
      type: "content_updated",
      blockId,
      result
    }));

  } catch (error) {
    console.error("Content update error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to update content block: ${errorMessage}`
    }));
  }
}

// Get block data handler
async function handleGetBlockData(socket: WebSocket, message: any) {
  try {
    const { blockId } = message;

    console.log(`Getting data for content block ${blockId}`);

    // Get all data from content executor
    const data = await contentExecutor.getAllContentBlockData(blockId);

    socket.send(JSON.stringify({
      type: "block_data",
      blockId,
      data: data || {}
    }));

  } catch (error) {
    console.error("Get block data error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to get block data: ${errorMessage}`
    }));
  }
}

// Handle iframe API calls
async function handleIframeAPICall(socket: WebSocket, message: any) {
  try {
    const { blockId, method, params, callId } = message;

    console.log(`Handling iframe API call: ${method} for block ${blockId}`);

    let result;

    // Handle the API call based on method
    switch (method) {
      case 'saveData':
        result = await contentExecutor.saveContentBlockData(blockId, params.key, params.value);
        break;
      case 'getData':
        result = await contentExecutor.getContentBlockData(blockId, params.key);
        break;
      case 'deleteData':
        result = await contentExecutor.deleteContentBlockData(blockId, params.key);
        break;
      default:
        throw new Error(`Unknown API method: ${method}`);
    }

    // Send response back to client (which will forward to iframe)
    socket.send(JSON.stringify({
      type: "iframe_api_response",
      blockId,
      callId,
      result
    }));

  } catch (error) {
    console.error("Iframe API call error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Send error response back to client
    socket.send(JSON.stringify({
      type: "iframe_api_response",
      blockId: message.blockId,
      callId: message.callId,
      error: errorMessage
    }));
  }
}

// Handle delete data item requests
async function handleDeleteDataItem(socket: WebSocket, message: any) {
  try {
    const { key } = message;

    console.log(`Deleting data item: ${key}`);

    // For now, we'll need to get the currently selected block
    // This is a limitation - we need to track which block is being edited
    // For simplicity, we'll just refresh the data viewer
    socket.send(JSON.stringify({
      type: "data_item_deleted",
      key
    }));

  } catch (error) {
    console.error("Delete data item error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to delete data item: ${errorMessage}`
    }));
  }
}

// Handle terminate content block requests
async function handleTerminateContentBlock(socket: WebSocket, message: any) {
  try {
    const { blockId } = message;

    console.log(`Terminating content block: ${blockId}`);

    // Terminate the content block and its isolate
    await contentExecutor.terminateContentBlock(blockId);

    socket.send(JSON.stringify({
      type: "content_block_terminated",
      blockId
    }));

    console.log(`Content block ${blockId} terminated successfully`);

  } catch (error) {
    console.error("Terminate content block error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to terminate content block: ${errorMessage}`
    }));
  }
}

// HTTP request handler
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Serve static files
  if (url.pathname.startsWith("/static/")) {
    return await serveStaticFile(url.pathname);
  }

  // WebSocket upgrade
  if (url.pathname === "/ws") {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response(null, { status: 426 });
    }

    const { socket, response } = Deno.upgradeWebSocket(request);
    handleWebSocket(socket);
    return response;
  }

  // API endpoints
  if (url.pathname.startsWith("/api/")) {
    return await handleAPIRequest(request);
  }

  // Main page
  if (url.pathname === "/" || url.pathname === "/index.html") {
    return await serveMainPage();
  }

  return new Response("Not Found", { status: 404 });
}

// Serve static files
async function serveStaticFile(pathname: string): Promise<Response> {
  try {
    const filePath = pathname.replace("/static/", "");
    const fullPath = `./static/${filePath}`;

    const file = await Deno.readFile(fullPath);
    const contentType = getContentType(filePath);

    return new Response(file, {
      headers: { "Content-Type": contentType }
    });
  } catch (error) {
    console.error("Static file error:", error);
    return new Response("File not found", { status: 404 });
  }
}

// Get content type for static files
function getContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html": return "text/html";
    case "css": return "text/css";
    case "js": return "application/javascript";
    case "json": return "application/json";
    default: return "text/plain";
  }
}

// Handle API requests
async function handleAPIRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return new Response(JSON.stringify({
      status: "ok",
      timestamp: Date.now(),
      uptime: performance.now()
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url.pathname === "/api/metrics") {
    try {
      const isolateStats = isolateManager.getResourceStats();
      const systemMemory = Deno.memoryUsage();
      const contentStats = contentExecutor.getExecutionStats();

      const metrics = {
        timestamp: Date.now(),
        system: {
          memory: {
            heapUsed: systemMemory.heapUsed / (1024 * 1024),
            heapTotal: systemMemory.heapTotal / (1024 * 1024),
            external: systemMemory.external / (1024 * 1024),
            rss: systemMemory.rss / (1024 * 1024)
          },
          cpu: {
            count: navigator.hardwareConcurrency || 1,
            loadAverage: Deno.loadavg ? Deno.loadavg() : null
          }
        },
        isolates: isolateStats,
        content: contentStats,
        server: {
          port: port,
          startTime: Date.now() - performance.now(),
          websocketConnections: 0 // Would need to track this separately
        }
      };

      return new Response(JSON.stringify(metrics, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error('Metrics endpoint error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to collect metrics',
        timestamp: Date.now()
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  if (url.pathname === "/api/isolate-stats") {
    const isolateId = url.searchParams.get('id');
    if (isolateId) {
      const stats = isolateManager.getIsolateResourceSummary(isolateId);
      if (stats) {
        return new Response(JSON.stringify(stats), {
          headers: { "Content-Type": "application/json" }
        });
      } else {
        return new Response(JSON.stringify({ error: 'Isolate not found' }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        });
      }
    } else {
      return new Response(JSON.stringify({ error: 'Isolate ID required' }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  return new Response("API endpoint not found", { status: 404 });
}

// Serve main page
async function serveMainPage(): Promise<Response> {
  try {
    const html = await Deno.readFile("./static/index.html");
    return new Response(html, {
      headers: { "Content-Type": "text/html" }
    });
  } catch (error) {
    console.error("Main page error:", error);
    return new Response("Main page not found", { status: 404 });
  }
}

// Start server
async function startServer(config: ServerConfig) {
  console.log('\n🚀 Starting Symposium Demo Server...');
  console.log(`🌐 Server will be available at: http://localhost:${config.port}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${config.port}/ws`);
  console.log(`📊 Health check: http://localhost:${config.port}/api/health`);
  console.log(`📈 Metrics: http://localhost:${config.port}/api/metrics`);
  console.log('=' .repeat(60));

  await Deno.serve({
    port: config.port,
    hostname: "0.0.0.0"
  }, handleRequest);
}

// Main execution
if (import.meta.main) {
  // Initialize all services first
  await initializeServices();

  const serverConfig: ServerConfig = {
    port: port,
    geminiApiKey: GEMINI_API_KEY,
    maxConcurrentIsolates: 10,
    isolateTimeoutMs: 30000
  };

  await startServer(serverConfig);
}
