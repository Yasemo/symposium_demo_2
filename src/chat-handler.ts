// Chat Handler for Symposium Demo
// Manages WebSocket chat communication and context

import { OpenRouterClient } from './openrouter-client.ts';
import { SymposiumContentExecutor } from './content-executor.ts';
import { DatabaseManager } from './database-manager.ts';

interface ContentBlockCode {
  html: string;
  css: string;
  javascript: string;
}

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
  private openRouterClient: OpenRouterClient | null = null;
  private contentExecutor: SymposiumContentExecutor | null = null;
  private databaseManager: DatabaseManager | null = null;
  private sessions = new Map<string, ChatSession>();
  private maxSessionAge = 30 * 60 * 1000; // 30 minutes
  private maxMessagesPerSession = 100;

  constructor(
    openRouterClient: OpenRouterClient | null = null,
    contentExecutor: SymposiumContentExecutor | null = null,
    databaseManager: DatabaseManager | null = null
  ) {
    this.openRouterClient = openRouterClient;
    this.contentExecutor = contentExecutor;
    this.databaseManager = databaseManager;
    this.startCleanupInterval();
  }

  // Get the current AI client (only OpenRouter now)
  private getCurrentClient() {
    return this.openRouterClient;
  }

  // Handle incoming chat message
  async handleMessage(socket: WebSocket, message: any): Promise<void> {
    try {
      const sessionId = message.sessionId || 'default';
      const userMessage = message.text || message.message || '';
      const chatMode = message.mode || 'plan'; // 'plan' or 'create'
      const editingContext = message.editingContext; // Context when editing a block
      const selectedBlockContext = message.selectedBlockContext; // Context when block is selected
      const visibleMessages = message.visibleMessages || []; // Filtered message history from frontend

      if (!userMessage.trim()) {
        this.sendError(socket, 'Empty message');
        return;
      }

      // Get or create session
      const session = await this.getOrCreateSession(sessionId);

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

        const currentClient = this.getCurrentClient();
        if (!currentClient) {
          throw new Error('No AI client available');
        }
        const modifiedBlock = await currentClient.generateContentBlock(
          this.buildEditingPrompt(userMessage, selectedBlockContext.currentCode, selectedBlockContext.blockId),
          undefined, // model
          true // isEditing
        );

        botResponse = `I've modified your selected content block with the requested changes!

**Updated Code:**
• HTML: ${modifiedBlock.html.substring(0, 100)}${modifiedBlock.html.length > 100 ? '...' : ''}
• CSS: ${modifiedBlock.css ? 'Included' : 'None'}
• JavaScript: ${modifiedBlock.javascript ? 'Included' : 'None'}

The content block has been updated and re-executed in the isolate!`;

        // Update content block through content executor with proper versioning
        if (this.contentExecutor) {
          const updates: ContentBlockCode = {
            html: modifiedBlock.html,
            css: modifiedBlock.css,
            javascript: modifiedBlock.javascript
          };

          await this.contentExecutor.updateContentBlockWithVersion(
            selectedBlockContext.blockId,
            updates,
            'ai_modified',
            {
              description: `AI modified content block: ${userMessage}`,
              author: 'ai'
            }
          );
          console.log(`AI modification versioned for block ${selectedBlockContext.blockId}`);
        } else {
          console.error('Content executor not available for AI editing');
          throw new Error('Content executor not available');
        }

      } else if (editingContext) {
        // User is editing an existing block in modal (fallback) - provide contextual modifications
        console.log(`Modal Editing Mode: Modifying block ${editingContext.blockId} with "${userMessage}"`);

        const currentClient = this.getCurrentClient();
        if (!currentClient) {
          throw new Error('No AI client available');
        }
        const modifiedBlock = await currentClient.generateContentBlock(
          this.buildEditingPrompt(userMessage, editingContext.currentCode),
          undefined, // model
          true // isEditing
        );

        botResponse = `I've modified your content block with the requested changes!

**Updated Code:**
• HTML: ${modifiedBlock.html.substring(0, 100)}${modifiedBlock.html.length > 100 ? '...' : ''}
• CSS: ${modifiedBlock.css ? 'Included' : 'None'}
• JavaScript: ${modifiedBlock.javascript ? 'Included' : 'None'}

The content block has been updated and re-executed in the isolate!`;

        // Update content block through content executor with proper versioning
        if (this.contentExecutor) {
          const updates: ContentBlockCode = {
            html: modifiedBlock.html,
            css: modifiedBlock.css,
            javascript: modifiedBlock.javascript
          };

          await this.contentExecutor.updateContentBlockWithVersion(
            editingContext.blockId,
            updates,
            'ai_modified',
            {
              description: `AI modified content block: ${userMessage}`,
              author: 'ai'
            }
          );
          console.log(`AI modification versioned for block ${editingContext.blockId}`);
        } else {
          console.error('Content executor not available for AI editing');
          throw new Error('Content executor not available');
        }

      } else if (chatMode === 'create') {
        // Create Mode: Always generate content, respond only with code
        console.log(`Create Mode: Generating content for "${userMessage}"`);

        // Build context for better content generation
        const contextMessages = this.buildContextForAI(session, visibleMessages);

        const currentClient = this.getCurrentClient();
        if (!currentClient) {
          throw new Error('No AI client available');
        }

        // Include context in the prompt for better generation
        const contextualPrompt = contextMessages.length > 0
          ? `${userMessage}\n\nConversation context:\n${contextMessages.map(m => `${m.role}: ${m.content}`).join('\n')}`
          : userMessage;

        const contentBlock = await currentClient.generateContentBlock(contextualPrompt);

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
        // Plan Mode: Conversational AI - NO content generation
        console.log(`Plan Mode: Providing guidance for "${userMessage}"`);

        // Check if user is asking about content creation
        const isContentRequest = this.isContentGenerationRequest(userMessage);

        if (isContentRequest) {
          // In Plan Mode, guide user to Create Mode instead of generating content
          botResponse = `I see you'd like to create a content block! In Plan Mode, I can help you design and plan your content block, but I won't generate the actual code here.

## What I can help with in Plan Mode:
- **Design planning**: Help you think through the user experience and functionality
- **Technical guidance**: Explain how different features work in Symposium Demo
- **Best practices**: Share tips for creating effective content blocks
- **API recommendations**: Suggest which data persistence patterns to use

## To create the actual content block:
Please switch to **Create Mode** (click the "Create Mode" button above) and I'll generate the complete HTML/CSS/JavaScript code for you.

Would you like me to help you plan out what this content block should include first?`;
        } else {
          // Regular conversational response with context
          const contextMessages = this.buildContextForAI(session, visibleMessages);
          const currentClient = this.getCurrentClient();
          if (!currentClient) {
            throw new Error('No AI client available');
          }
          botResponse = await currentClient.chat(userMessage, contextMessages);
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

      // Save session to database
      await this.saveSession(session);

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
  private async getOrCreateSession(sessionId: string): Promise<ChatSession> {
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Try to load from database first
      const savedSession = await this.loadSession(sessionId);
      if (savedSession) {
        session = savedSession;
        this.sessions.set(sessionId, session);
        console.log(`Restored session ${sessionId} from database with ${session.messages.length} messages`);
      } else {
        // Create new session
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
        console.log(`Created new session ${sessionId}`);
      }
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
  private buildContextForAI(session: ChatSession, visibleMessages?: any[]): Array<{role: string, content: string}> {
    // If visibleMessages are provided from frontend, use them instead of full session history
    if (visibleMessages && visibleMessages.length > 0) {
      console.log(`Using ${visibleMessages.length} visible messages from frontend for context`);
      return visibleMessages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        content: msg.content
      }));
    }

    // Fallback to session history (last 10 messages)
    const recentMessages = session.messages.slice(-10);
    console.log(`Using ${recentMessages.length} messages from session history for context`);

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

  // Database persistence methods
  private async saveSession(session: ChatSession): Promise<void> {
    if (!this.databaseManager) {
      console.warn('Database manager not available, skipping session save');
      return;
    }

    try {
      const sessionKey = `chat_session:${session.id}`;
      const sessionData = {
        id: session.id,
        messages: session.messages,
        context: Array.from(session.context.entries()), // Convert Map to array for storage
        createdAt: session.createdAt,
        lastActivity: session.lastActivity
      };

      await this.databaseManager.set(sessionKey, sessionData);
      console.log(`Saved chat session ${session.id} with ${session.messages.length} messages`);
    } catch (error) {
      console.error('Failed to save chat session:', error);
    }
  }

  private async loadSession(sessionId: string): Promise<ChatSession | null> {
    if (!this.databaseManager) {
      console.warn('Database manager not available, cannot load session');
      return null;
    }

    try {
      const sessionKey = `chat_session:${sessionId}`;
      const sessionData = await this.databaseManager.get(sessionKey);

      if (!sessionData) {
        console.log(`No saved session found for ${sessionId}`);
        return null;
      }

      // Reconstruct the session
      const session: ChatSession = {
        id: sessionData.id,
        messages: sessionData.messages || [],
        context: new Map(sessionData.context || []), // Convert array back to Map
        createdAt: sessionData.createdAt,
        lastActivity: sessionData.lastActivity
      };

      console.log(`Loaded chat session ${sessionId} with ${session.messages.length} messages`);
      return session;
    } catch (error) {
      console.error('Failed to load chat session:', error);
      return null;
    }
  }

  // Get chat history for a session (used when sending to frontend)
  async getChatHistory(sessionId: string): Promise<ChatMessage[]> {
    const session = this.sessions.get(sessionId);
    if (session) {
      return session.messages;
    }

    // Try to load from database
    const savedSession = await this.loadSession(sessionId);
    return savedSession ? savedSession.messages : [];
  }

  // Clear chat history for a session
  async clearChatHistory(sessionId: string): Promise<boolean> {
    try {
      // Remove from memory
      const session = this.sessions.get(sessionId);
      if (session) {
        // Keep only the welcome message
        const welcomeMessage = session.messages.find(msg => msg.type === 'system');
        session.messages = welcomeMessage ? [welcomeMessage] : [];
        session.lastActivity = Date.now();
      }

      // Remove from database
      if (this.databaseManager) {
        const sessionKey = `chat_session:${sessionId}`;
        await this.databaseManager.delete(sessionKey);
      }

      console.log(`Cleared chat history for session ${sessionId}`);
      return true;
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      return false;
    }
  }

  // Load all saved sessions on startup
  async loadAllSessions(): Promise<void> {
    if (!this.databaseManager) {
      console.log('Database manager not available, skipping session loading');
      return;
    }

    try {
      console.log('Loading saved chat sessions from database...');
      const sessionKeys = await this.databaseManager.list(['chat_session:']);

      let loadedCount = 0;
      for (const entry of sessionKeys) {
        if (entry.key && typeof entry.key === 'string') {
          const sessionId = entry.key.replace('chat_session:', '');
          const session = await this.loadSession(sessionId);
          if (session) {
            this.sessions.set(sessionId, session);
            loadedCount++;
          }
        }
      }

      console.log(`Loaded ${loadedCount} chat sessions from database`);
    } catch (error) {
      console.error('Failed to load saved sessions:', error);
    }
  }
}
