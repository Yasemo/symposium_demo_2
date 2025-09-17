import { OpenRouterClient } from "./src/openrouter-client.ts";
import { SymposiumIsolateManager } from "./src/isolate-manager.ts";
import { SymposiumContentExecutor } from "./src/content-executor.ts";
import { SymposiumChatHandler } from "./src/chat-handler.ts";
import { GCPProvisioner } from "./src/gcp-provisioner.ts";
import { createServiceManagers, DatabaseManager } from "./src/database-manager.ts";
import { getEnvLoader } from "./src/env-loader.ts";
import { initializeOrchestrator, getOrchestrator } from "./src/orchestrator/orchestrator-manager.ts";

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
  openRouterApiKey,
  openRouterDefaultModel,
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

// OpenRouter API configuration
console.log(`🚀 OpenRouter API: ${openRouterApiKey ? '✅ Configured' : '❌ Not configured'}`);

// Global service managers
let databaseManager: DatabaseManager;
let provisioner: GCPProvisioner;

// Global application components
let isolateManager: SymposiumIsolateManager;
let contentExecutor: SymposiumContentExecutor;
let chatHandler: SymposiumChatHandler;
let openRouterClient: OpenRouterClient | null = null;

// Initialize core components with auto-provisioning
async function initializeServices() {
  console.log('\n🚀 Initializing Symposium Demo Services...');
  console.log('=' .repeat(50));

  // Initialize OpenRouter client
  console.log('🚀 Initializing OpenRouter AI client...');
  if (openRouterApiKey) {
    try {
      openRouterClient = new OpenRouterClient({
        apiKey: openRouterApiKey,
        defaultModel: openRouterDefaultModel || 'openai/gpt-4o-mini'
      });
      console.log('   ✅ OpenRouter client initialized');
      console.log(`   📋 Default model: ${openRouterDefaultModel || 'openai/gpt-4o-mini'}`);
    } catch (error) {
      console.error('   ❌ OpenRouter client initialization failed:', error);
      openRouterClient = null;
    }
  } else {
    console.log('   ⚠️  OpenRouter API key not configured, skipping initialization');
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
  chatHandler = new SymposiumChatHandler(openRouterClient, contentExecutor, databaseManager);
  console.log('   ✅ Chat handler initialized');
  console.log(`   🤖 AI Provider: OpenRouter ${openRouterClient ? '✅' : '❌'}`);

  // Load saved chat sessions
  console.log('💬 Loading saved chat sessions...');
  await chatHandler.loadAllSessions();
  console.log('   ✅ Chat sessions loaded from database');

  // Initialize isolate orchestrator proxy system
  console.log('🔧 Initializing Isolate Orchestrator Proxy...');
  const orchestrator = await initializeOrchestrator(databaseManager);
  console.log('   ✅ Isolate orchestrator initialized');
  console.log(`   📊 Supported operations: ${orchestrator.getSupportedOperations().join(', ')}`);

  console.log('\n' + '=' .repeat(50));
  console.log('✅ All Services Initialized Successfully!');
  console.log('📊 Service Status Summary:');
  console.log(`   🔌 Database: ${databaseManager.getConnectionInfo().type} (${databaseManager.getConnectionInfo().status})`);
  console.log(`   ⚡ Isolates: ${isolateStats.activeIsolates}/${isolateStats.maxIsolates} active`);
  console.log(`   🤖 AI: OpenRouter ${openRouterClient ? 'Connected' : 'Disconnected'}`);
  console.log(`   🔌 Orchestrator: ${orchestrator.getStats().handlers.registered} handlers registered`);
  console.log('=' .repeat(50) + '\n');
}

// Server configuration
interface ServerConfig {
  port: number;
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

  socket.addEventListener("open", async () => {
    console.log("Client connected!");

    // Send chat history to the newly connected client
    try {
      const history = await chatHandler.getChatHistory('default');
      if (history.length > 0) {
        socket.send(JSON.stringify({
          type: "chat_history",
          sessionId: 'default',
          history
        }));
        console.log(`Sent ${history.length} chat messages to new client`);
      }
    } catch (error) {
      console.error("Failed to send chat history to new client:", error);
    }
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
        case "get_content_versions":
          handleGetContentVersions(socket, message);
          break;
        case "undo_content_block":
          handleUndoContentBlock(socket, message);
          break;
        case "redo_content_block":
          handleRedoContentBlock(socket, message);
          break;
        case "get_available_models":
          handleGetAvailableModels(socket, message);
          break;
        case "change_model":
          handleChangeModel(socket, message);
          break;
        case "change_block_permission":
          handleChangeBlockPermission(socket, message);
          break;
        case "get_chat_history":
          handleGetChatHistory(socket, message);
          break;
        case "clear_chat_history":
          handleClearChatHistory(socket, message);
          break;
        case "apiCall":
          handleIsolateAPICall(socket, message);
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
    let changeType: 'execution' | 'ai_generated' = 'execution';
    let metadata: any = {};

    // If no code provided, generate content using OpenRouter
    if (!code || (!code.html && !code.css && !code.javascript)) {
      console.log("Generating content block for execution");
      if (!openRouterClient) {
        throw new Error("OpenRouter client not available for content generation");
      }
      const contentBlock = await openRouterClient.generateContentBlock("Create an interactive content block");

      executionCode = {
        html: contentBlock.html,
        css: contentBlock.css,
        javascript: contentBlock.javascript
      };
      changeType = 'ai_generated';
      metadata = {
        description: 'AI-generated content block',
        author: 'ai'
      };
    } else {
      // Use provided code
      executionCode = {
        html: code.html || "<p>Content block executed</p>",
        css: code.css || "",
        javascript: code.javascript || ""
      };
      metadata = {
        description: 'User-executed content block',
        author: 'user'
      };
    }

    // Execute content block in isolate with version tracking
    console.log(`Executing content block ${blockId} in isolate`);
    const result = await contentExecutor.executeContentBlockWithVersion(blockId, executionCode, changeType, metadata);

    // Assign database permissions to the isolate after creation
    try {
      const orchestrator = getOrchestrator();
      orchestrator.assignPermissions(blockId, 'data'); // Give data permissions for database access
      console.log(`Assigned data permissions to isolate ${blockId}`);
    } catch (error) {
      console.warn(`Failed to assign permissions to isolate ${blockId}:`, error);
    }

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
    const { blockId, updates, changeType = 'user_edit', author = 'user' } = message;

    console.log(`Updating content block ${blockId} in isolate`);

    // Update content block in isolate with version tracking
    const result = await contentExecutor.updateContentBlockWithVersion(blockId, updates, changeType, {
      description: `Content block updated by ${author}`,
      author: author
    });

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

    // Route database operations to the orchestrator
    if (method.startsWith('database.')) {
      console.log(`Routing database operation ${method} to orchestrator`);
      const orchestrator = getOrchestrator();
      result = await orchestrator.handleCapabilityRequest(blockId, method, params);
    } else {
      // Handle legacy data operations directly
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

// Handle get content versions requests
async function handleGetContentVersions(socket: WebSocket, message: any) {
  try {
    const { blockId } = message;

    console.log(`Getting versions for content block: ${blockId}`);

    // Get version history from content executor
    const versions = await contentExecutor.getContentBlockVersions(blockId);

    socket.send(JSON.stringify({
      type: "content_versions",
      blockId,
      versions
    }));

    console.log(`Sent ${versions.length} versions for block ${blockId}`);

  } catch (error) {
    console.error("Get content versions error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to get content versions: ${errorMessage}`
    }));
  }
}

// Handle undo content block requests
async function handleUndoContentBlock(socket: WebSocket, message: any) {
  try {
    const { blockId, targetVersionId } = message;

    console.log(`Undoing content block: ${blockId}${targetVersionId ? ` to version ${targetVersionId}` : ' to previous version'}`);

    // Undo the content block
    const result = await contentExecutor.undoContentBlock(blockId, targetVersionId);

    if (result) {
      socket.send(JSON.stringify({
        type: "content_undone",
        blockId,
        result,
        targetVersionId
      }));

      console.log(`Successfully undid block ${blockId}${targetVersionId ? ` to version ${targetVersionId}` : ' to previous version'}`);
    } else {
      // Check if it's because there's only one version
      const versions = await contentExecutor.getContentBlockVersions(blockId);
      const errorMessage = versions.length === 1
        ? `Cannot undo: This is the only version of the content block. Make some changes first to create additional versions.`
        : `Failed to undo content block: No versions available or undo failed`;

      socket.send(JSON.stringify({
        type: "error",
        error: errorMessage
      }));
    }

  } catch (error) {
    console.error("Undo content block error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to undo content block: ${errorMessage}`
    }));
  }
}

// Handle redo content block requests
async function handleRedoContentBlock(socket: WebSocket, message: any) {
  try {
    const { blockId } = message;

    console.log(`Redoing content block: ${blockId}`);

    // Check if redo is available
    const canRedo = await contentExecutor.canRedo(blockId);
    if (!canRedo) {
      socket.send(JSON.stringify({
        type: "error",
        error: `No redo available for block ${blockId}`
      }));
      return;
    }

    // Redo the content block
    const result = await contentExecutor.redoContentBlock(blockId);

    if (result) {
      socket.send(JSON.stringify({
        type: "content_redone",
        blockId,
        result
      }));

      console.log(`Successfully redid block ${blockId}`);
    } else {
      socket.send(JSON.stringify({
        type: "error",
        error: `Failed to redo content block: Redo operation failed`
      }));
    }

  } catch (error) {
    console.error("Redo content block error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to redo content block: ${errorMessage}`
    }));
  }
}

// Handle get available models requests
async function handleGetAvailableModels(socket: WebSocket, message: any) {
  try {
    console.log('Getting available models from OpenRouter');

    if (!openRouterClient) {
      socket.send(JSON.stringify({
        type: "error",
        error: "OpenRouter client not available"
      }));
      return;
    }

    const models = await openRouterClient.getAvailableModels();

    socket.send(JSON.stringify({
      type: "available_models",
      models: models
    }));

    console.log(`Sent ${models.length} available models to frontend`);

  } catch (error) {
    console.error("Get available models error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to get available models: ${errorMessage}`
    }));
  }
}

// Handle change model requests
async function handleChangeModel(socket: WebSocket, message: any) {
  try {
    const { model } = message;

    console.log(`Changing model to: ${model}`);

    if (!openRouterClient) {
      socket.send(JSON.stringify({
        type: "error",
        error: "OpenRouter client not available"
      }));
      return;
    }

    // Update the model in the OpenRouter client with persistence
    await openRouterClient.setCurrentModel(model);

    socket.send(JSON.stringify({
      type: "model_changed",
      model: model,
      success: true
    }));

    console.log(`Successfully changed and persisted model to: ${model}`);

  } catch (error) {
    console.error("Change model error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "model_changed",
      model: message.model,
      success: false,
      error: errorMessage
    }));
  }
}

// Handle change permission requests
async function handleChangePermission(socket: WebSocket, message: any) {
  try {
    const { permission } = message;

    console.log(`Changing permission level to: ${permission}`);

    // Validate permission level
    const validPermissions = ['basic', 'interactive', 'data', 'advanced'];
    if (!validPermissions.includes(permission)) {
      socket.send(JSON.stringify({
        type: "error",
        error: `Invalid permission level: ${permission}. Valid options: ${validPermissions.join(', ')}`
      }));
      return;
    }

    // For now, we'll just acknowledge the permission change
    // In a full implementation, this would update the permission system
    // and potentially restart isolates with new permissions

    socket.send(JSON.stringify({
      type: "permission_changed",
      permission: permission,
      success: true
    }));

    console.log(`Successfully changed permission level to: ${permission}`);

  } catch (error) {
    console.error("Change permission error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "permission_changed",
      permission: message.permission,
      success: false,
      error: errorMessage
    }));
  }
}

// Handle change block permission requests
async function handleChangeBlockPermission(socket: WebSocket, message: any) {
  try {
    const { blockId, permission } = message;

    console.log(`Changing permission level for block ${blockId} to: ${permission}`);

    // Validate permission level
    const validPermissions = ['basic', 'interactive', 'data', 'advanced'];
    if (!validPermissions.includes(permission)) {
      socket.send(JSON.stringify({
        type: "error",
        error: `Invalid permission level: ${permission}. Valid options: ${validPermissions.join(', ')}`
      }));
      return;
    }

    // Get the orchestrator to update block permissions
    const orchestrator = getOrchestrator();
    await orchestrator.updateBlockPermission(blockId, permission);

    socket.send(JSON.stringify({
      type: "block_permission_changed",
      blockId: blockId,
      permission: permission,
      success: true
    }));

    console.log(`Successfully changed permission level for block ${blockId} to: ${permission}`);

  } catch (error) {
    console.error("Change block permission error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "block_permission_changed",
      blockId: message.blockId,
      permission: message.permission,
      success: false,
      error: errorMessage
    }));
  }
}

// Handle get chat history requests
async function handleGetChatHistory(socket: WebSocket, message: any) {
  try {
    const { sessionId = 'default' } = message;

    console.log(`Getting chat history for session: ${sessionId}`);

    // Get chat history from chat handler
    const history = await chatHandler.getChatHistory(sessionId);

    socket.send(JSON.stringify({
      type: "chat_history",
      sessionId,
      history
    }));

    console.log(`Sent ${history.length} chat messages for session ${sessionId}`);

  } catch (error) {
    console.error("Get chat history error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to get chat history: ${errorMessage}`
    }));
  }
}

// Handle clear chat history requests
async function handleClearChatHistory(socket: WebSocket, message: any) {
  try {
    const { sessionId = 'default' } = message;

    console.log(`Clearing chat history for session: ${sessionId}`);

    // Clear chat history through chat handler
    const success = await chatHandler.clearChatHistory(sessionId);

    if (success) {
      socket.send(JSON.stringify({
        type: "chat_history_cleared",
        sessionId,
        success: true
      }));

      console.log(`Successfully cleared chat history for session ${sessionId}`);
    } else {
      socket.send(JSON.stringify({
        type: "error",
        error: `Failed to clear chat history for session ${sessionId}`
      }));
    }

  } catch (error) {
    console.error("Clear chat history error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    socket.send(JSON.stringify({
      type: "error",
      error: `Failed to clear chat history: ${errorMessage}`
    }));
  }
}

// Handle isolate API calls (orchestrator proxy)
async function handleIsolateAPICall(socket: WebSocket, message: any) {
  try {
    const { blockId, method, params, callId } = message;

    console.log(`Handling isolate API call: ${method} for block ${blockId} (callId: ${callId})`);

    // Get the orchestrator instance
    const orchestrator = getOrchestrator();

    // Route the capability request to the orchestrator
    const result = await orchestrator.handleCapabilityRequest(blockId, method, params);

    // Send response back to the isolate via WebSocket
    socket.send(JSON.stringify({
      type: "iframe_api_response",
      blockId,
      callId,
      result
    }));

    console.log(`Successfully processed ${method} for isolate ${blockId}`);

  } catch (error) {
    console.error("Isolate API call error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Send error response back to the isolate
    socket.send(JSON.stringify({
      type: "iframe_api_response",
      blockId: message.blockId,
      callId: message.callId,
      error: errorMessage
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
    maxConcurrentIsolates: 10,
    isolateTimeoutMs: 30000
  };

  await startServer(serverConfig);
}
