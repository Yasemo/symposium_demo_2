import { GeminiClient } from "./src/gemini-client.ts";
import { SymposiumIsolateManager } from "./src/isolate-manager.ts";
import { SymposiumContentExecutor } from "./src/content-executor.ts";
import { SymposiumChatHandler } from "./src/chat-handler.ts";

// Environment configuration
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "AIzaSyDNmaBk3Vb4zHd5DTTxusXWMYrfHUDIo88";
const PORT = parseInt(Deno.env.get("PORT") || "8000");

// Initialize core components
const geminiClient = new GeminiClient({
  apiKey: GEMINI_API_KEY
});

const isolateManager = new SymposiumIsolateManager(10); // Max 10 concurrent isolates
const contentExecutor = new SymposiumContentExecutor(isolateManager);
const chatHandler = new SymposiumChatHandler(geminiClient);

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
  data?: any;
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
        javascript: contentBlock.javascript,
        data: { generated: true, explanation: contentBlock.explanation }
      };
    } else {
      // Use provided code
      executionCode = {
        html: code.html || "<p>Content block executed</p>",
        css: code.css || "",
        javascript: code.javascript || "",
        data: code.data
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
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" }
    });
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
  console.log(`Starting Symposium Demo Server on port ${config.port}`);

  await Deno.serve({
    port: config.port,
    hostname: "0.0.0.0"
  }, handleRequest);
}

// Main execution
if (import.meta.main) {
  const config: ServerConfig = {
    port: PORT,
    geminiApiKey: GEMINI_API_KEY,
    maxConcurrentIsolates: 10,
    isolateTimeoutMs: 30000
  };

  await startServer(config);
}
