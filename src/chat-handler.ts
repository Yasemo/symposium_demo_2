// Chat Handler for Symposium Demo
// Manages WebSocket chat communication and context

import { GeminiClient } from './gemini-client.ts';

interface ChatMessage {
  id: string;
  type: 'user' | 'bot' | 'system';
  content: string;
  timestamp: number;
  metadata?: any;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  context: Map<string, any>;
  createdAt: number;
  lastActivity: number;
}

export class SymposiumChatHandler {
  private geminiClient: GeminiClient;
  private sessions = new Map<string, ChatSession>();
  private maxSessionAge = 30 * 60 * 1000; // 30 minutes
  private maxMessagesPerSession = 100;

  constructor(geminiClient: GeminiClient) {
    this.geminiClient = geminiClient;
    this.startCleanupInterval();
  }

  // Handle incoming chat message
  async handleMessage(socket: WebSocket, message: any): Promise<void> {
    try {
      const sessionId = message.sessionId || 'default';
      const userMessage = message.text || message.message || '';
      const chatMode = message.mode || 'plan'; // 'plan' or 'create'
      const editingContext = message.editingContext; // Context when editing a block
      const selectedBlockContext = message.selectedBlockContext; // Context when block is selected

      if (!userMessage.trim()) {
        this.sendError(socket, 'Empty message');
        return;
      }

      // Get or create session
      const session = this.getOrCreateSession(sessionId);

      // Add user message to session
      const userChatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'user',
        content: userMessage,
        timestamp: Date.now()
      };

      session.messages.push(userChatMessage);
      session.lastActivity = Date.now();

      let botResponse: string;

      if (selectedBlockContext) {
        // User has selected a block for AI editing - provide contextual modifications
        console.log(`AI Editing Mode: Modifying selected block ${selectedBlockContext.blockId} with "${userMessage}"`);

        const modifiedBlock = await this.geminiClient.generateContentBlock(
          this.buildEditingPrompt(userMessage, selectedBlockContext.currentCode, selectedBlockContext.blockId)
        );

        botResponse = `I've modified your selected content block with the requested changes!

**Updated Code:**
• HTML: ${modifiedBlock.html.substring(0, 100)}${modifiedBlock.html.length > 100 ? '...' : ''}
• CSS: ${modifiedBlock.css ? 'Included' : 'None'}
• JavaScript: ${modifiedBlock.javascript ? 'Included' : 'None'}

The content block has been updated and re-executed in the isolate!`;

        // Send content block update message to frontend
        this.sendContentBlockUpdate(socket, sessionId, selectedBlockContext.blockId, modifiedBlock);

      } else if (editingContext) {
        // User is editing an existing block in modal (fallback) - provide contextual modifications
        console.log(`Modal Editing Mode: Modifying block ${editingContext.blockId} with "${userMessage}"`);

        const modifiedBlock = await this.geminiClient.generateContentBlock(
          this.buildEditingPrompt(userMessage, editingContext.currentCode)
        );

        botResponse = `I've modified your content block with the requested changes!

**Updated Code:**
• HTML: ${modifiedBlock.html.substring(0, 100)}${modifiedBlock.html.length > 100 ? '...' : ''}
• CSS: ${modifiedBlock.css ? 'Included' : 'None'}
• JavaScript: ${modifiedBlock.javascript ? 'Included' : 'None'}

The content block has been updated and re-executed in the isolate!`;

        // Send content block update message to frontend
        this.sendContentBlockUpdate(socket, sessionId, editingContext.blockId, modifiedBlock);

      } else if (chatMode === 'create') {
        // Create Mode: Always generate content, respond only with code
        console.log(`Create Mode: Generating content for "${userMessage}"`);
        const contentBlock = await this.geminiClient.generateContentBlock(userMessage);

        // In Create Mode, just send the content block without chat response
        botResponse = `Content block created and executed!`;

        // Store content block in session context
        session.context.set('lastGeneratedBlock', {
          html: contentBlock.html,
          css: contentBlock.css,
          javascript: contentBlock.javascript,
          explanation: contentBlock.explanation,
          timestamp: Date.now()
        });

        // Send content block creation message to frontend
        this.sendContentBlock(socket, sessionId, contentBlock);

      } else {
        // Plan Mode: Regular chat with optional content generation
        const isContentRequest = this.isContentGenerationRequest(userMessage);

        if (isContentRequest) {
          // Generate content block
          console.log(`Plan Mode: Generating content block for "${userMessage}"`);
          const contentBlock = await this.geminiClient.generateContentBlock(userMessage);

          botResponse = `I've created a content block for you: ${contentBlock.explanation}

**Generated Code:**
• HTML: ${contentBlock.html.substring(0, 100)}${contentBlock.html.length > 100 ? '...' : ''}
• CSS: ${contentBlock.css ? 'Included' : 'None'}
• JavaScript: ${contentBlock.javascript ? 'Included' : 'None'}

The content block has been automatically added to your workspace and executed in an isolate!`;

          // Store content block in session context
          session.context.set('lastGeneratedBlock', {
            html: contentBlock.html,
            css: contentBlock.css,
            javascript: contentBlock.javascript,
            explanation: contentBlock.explanation,
            timestamp: Date.now()
          });

          // Send content block creation message to frontend
          this.sendContentBlock(socket, sessionId, contentBlock);

        } else {
          // Regular chat response with context
          const contextMessages = this.buildContextForAI(session);
          botResponse = await this.geminiClient.chat(userMessage, contextMessages);
        }
      }

      // Add bot response to session
      const botChatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'bot',
        content: botResponse,
        timestamp: Date.now()
      };

      session.messages.push(botChatMessage);

      // Trim old messages if needed
      this.trimSessionMessages(session);

      // Send response
      this.sendResponse(socket, {
        type: 'chat_response',
        message: botResponse,
        sessionId: sessionId,
        messageId: botChatMessage.id,
        timestamp: botChatMessage.timestamp
      });

    } catch (error) {
      console.error('Chat handling error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.sendError(socket, `Failed to process message: ${errorMessage}`);
    }
  }

  // Get or create chat session
  private getOrCreateSession(sessionId: string): ChatSession {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        messages: [],
        context: new Map(),
        createdAt: Date.now(),
        lastActivity: Date.now()
      };

      // Add welcome message
      const welcomeMessage: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'system',
        content: 'Welcome to Symposium Demo! I can help you create interactive content blocks. Try asking me to "create a button" or "make a calculator".',
        timestamp: Date.now()
      };

      session.messages.push(welcomeMessage);
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  // Check if message is requesting content generation
  private isContentGenerationRequest(message: string): boolean {
    const contentKeywords = [
      'create', 'generate', 'make', 'build', 'design',
      'content', 'block', 'component', 'widget',
      'html', 'css', 'javascript', 'js', 'interactive'
    ];

    const lowerMessage = message.toLowerCase();
    return contentKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  // Build context for AI from session history
  private buildContextForAI(session: ChatSession): Array<{role: string, content: string}> {
    // Get last 10 messages for context
    const recentMessages = session.messages.slice(-10);

    return recentMessages.map(msg => ({
      role: msg.type === 'user' ? 'user' : 'model',
      content: msg.content
    }));
  }

  // Trim old messages to prevent memory issues
  private trimSessionMessages(session: ChatSession): void {
    if (session.messages.length > this.maxMessagesPerSession) {
      // Keep the welcome message and the most recent messages
      const welcomeMessage = session.messages.find(msg => msg.type === 'system');
      const recentMessages = session.messages.slice(-this.maxMessagesPerSession + 1);

      session.messages = welcomeMessage ? [welcomeMessage, ...recentMessages] : recentMessages;
    }
  }

  // Get session statistics
  getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    totalMessages: number;
  } {
    const now = Date.now();
    const activeThreshold = 10 * 60 * 1000; // 10 minutes

    let activeSessions = 0;
    let totalMessages = 0;

    for (const session of this.sessions.values()) {
      if (now - session.lastActivity < activeThreshold) {
        activeSessions++;
      }
      totalMessages += session.messages.length;
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      totalMessages
    };
  }

  // Clean up old sessions
  cleanupOldSessions(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.maxSessionAge) {
        toDelete.push(sessionId);
      }
    }

    toDelete.forEach(sessionId => {
      this.sessions.delete(sessionId);
    });

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} old chat sessions`);
    }
  }

  // Start cleanup interval
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupOldSessions();
    }, 5 * 60 * 1000); // Clean up every 5 minutes
  }

  // Send response to client
  private sendResponse(socket: WebSocket, response: any): void {
    try {
      socket.send(JSON.stringify(response));
    } catch (error) {
      console.error('Failed to send response:', error);
    }
  }

  // Send error to client
  private sendError(socket: WebSocket, error: string): void {
    this.sendResponse(socket, {
      type: 'error',
      error: error,
      timestamp: Date.now()
    });
  }

  // Build editing prompt with current code context and persistent data
  private buildEditingPrompt(userRequest: string, currentCode: any, blockId?: string): string {
    let persistentDataContext = '';

    // Include persistent data if available
    if (blockId) {
      const context = this.getSessionContext('default'); // Get current session context
      if (context && context.has('persistentData')) {
        const persistentData = context.get('persistentData');
        if (persistentData && persistentData[blockId]) {
          const blockData = persistentData[blockId];
          persistentDataContext = `

Block Persistent Data:
${Object.entries(blockData).map(([key, value]) =>
  `- ${key}: ${JSON.stringify(value)}`
).join('\n')}

The block has persistent data that should be considered when making changes.`;
        }
      }
    }

    return `
You are modifying an existing content block. The user wants to make changes to their current code.${persistentDataContext}

Current Code:
- HTML: ${currentCode.html || 'None'}
- CSS: ${currentCode.css || 'None'}
- JavaScript: ${currentCode.javascript || 'None'}

User Request: "${userRequest}"

Please modify the existing code according to the user's request. Preserve the existing structure and functionality while making only the requested changes.

Format your response as JSON with the following structure:
{
  "html": "<modified html>",
  "css": "<modified css>",
  "javascript": "<modified javascript>",
  "explanation": "Brief description of the changes made"
}

Make sure to:
- Keep the existing code structure intact
- Only modify what's specifically requested
- Maintain compatibility and functionality
- Use modern, clean code practices
- Consider the block's persistent data when making changes
`;
  }

  // Send content block creation message to frontend
  private sendContentBlock(socket: WebSocket, sessionId: string, contentBlock: any): void {
    const blockId = crypto.randomUUID();

    this.sendResponse(socket, {
      type: 'ai_content_generated',
      blockId: blockId,
      sessionId: sessionId,
      code: {
        html: contentBlock.html,
        css: contentBlock.css,
        javascript: contentBlock.javascript
      },
      explanation: contentBlock.explanation,
      timestamp: Date.now()
    });

    console.log(`Sent AI-generated content block ${blockId} to frontend`);
  }

  // Send content block update message to frontend
  private sendContentBlockUpdate(socket: WebSocket, sessionId: string, blockId: string, contentBlock: any): void {
    this.sendResponse(socket, {
      type: 'content_updated',
      blockId: blockId,
      sessionId: sessionId,
      result: {
        html: contentBlock.html,
        css: contentBlock.css,
        javascript: contentBlock.javascript,
        success: true,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    });

    console.log(`Sent AI-updated content block ${blockId} to frontend`);
  }

  // Get session context (for content block generation)
  getSessionContext(sessionId: string): Map<string, any> | null {
    const session = this.sessions.get(sessionId);
    return session ? session.context : null;
  }
}
