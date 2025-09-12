// Context Manager for Symposium Demo
// Manages chat context and content block relationships

interface ContextItem {
  id: string;
  type: 'content_block' | 'chat_message' | 'user_action' | 'system_event';
  data: any;
  timestamp: number;
  expiresAt?: number;
  tags: string[];
}

interface ContextSession {
  id: string;
  items: ContextItem[];
  metadata: Map<string, any>;
  createdAt: number;
  lastActivity: number;
}

export class SymposiumContextManager {
  private sessions = new Map<string, ContextSession>();
  private maxSessionAge = 60 * 60 * 1000; // 1 hour
  private maxItemsPerSession = 200;
  private defaultExpiration = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.startCleanupInterval();
  }

  // Add item to context
  addItem(sessionId: string, type: ContextItem['type'], data: any, tags: string[] = []): string {
    const session = this.getOrCreateSession(sessionId);
    const itemId = crypto.randomUUID();

    const item: ContextItem = {
      id: itemId,
      type,
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.defaultExpiration,
      tags
    };

    session.items.push(item);
    session.lastActivity = Date.now();

    // Trim old items if needed
    this.trimSessionItems(session);

    return itemId;
  }

  // Get items from context with optional filtering
  getItems(sessionId: string, filters?: {
    type?: ContextItem['type'];
    tags?: string[];
    limit?: number;
    since?: number;
  }): ContextItem[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    let items = session.items.filter(item => {
      // Check expiration
      if (item.expiresAt && Date.now() > item.expiresAt) {
        return false;
      }

      // Filter by type
      if (filters?.type && item.type !== filters.type) {
        return false;
      }

      // Filter by tags
      if (filters?.tags && filters.tags.length > 0) {
        const hasAllTags = filters.tags.every(tag => item.tags.includes(tag));
        if (!hasAllTags) return false;
      }

      // Filter by timestamp
      if (filters?.since && item.timestamp < filters.since) {
        return false;
      }

      return true;
    });

    // Sort by timestamp (newest first)
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (filters?.limit) {
      items = items.slice(0, filters.limit);
    }

    return items;
  }

  // Update item in context
  updateItem(sessionId: string, itemId: string, updates: Partial<ContextItem>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const item = session.items.find(item => item.id === itemId);
    if (!item) return false;

    Object.assign(item, updates);
    session.lastActivity = Date.now();

    return true;
  }

  // Remove item from context
  removeItem(sessionId: string, itemId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const index = session.items.findIndex(item => item.id === itemId);
    if (index === -1) return false;

    session.items.splice(index, 1);
    session.lastActivity = Date.now();

    return true;
  }

  // Get session metadata
  getSessionMetadata(sessionId: string): Map<string, any> | null {
    const session = this.sessions.get(sessionId);
    return session ? session.metadata : null;
  }

  // Set session metadata
  setSessionMetadata(sessionId: string, key: string, value: any): void {
    const session = this.getOrCreateSession(sessionId);
    session.metadata.set(key, value);
    session.lastActivity = Date.now();
  }

  // Get context summary for AI
  getContextSummary(sessionId: string): {
    recentContentBlocks: number;
    recentMessages: number;
    activeTags: string[];
    sessionAge: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        recentContentBlocks: 0,
        recentMessages: 0,
        activeTags: [],
        sessionAge: 0
      };
    }

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    const recentItems = session.items.filter(item => item.timestamp > oneHourAgo);

    const recentContentBlocks = recentItems.filter(item => item.type === 'content_block').length;
    const recentMessages = recentItems.filter(item => item.type === 'chat_message').length;

    const activeTags = Array.from(new Set(
      recentItems.flatMap(item => item.tags)
    ));

    const sessionAge = now - session.createdAt;

    return {
      recentContentBlocks,
      recentMessages,
      activeTags,
      sessionAge
    };
  }

  // Search context items
  searchItems(sessionId: string, query: string, options?: {
    type?: ContextItem['type'];
    limit?: number;
  }): ContextItem[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const lowerQuery = query.toLowerCase();

    let items = session.items.filter(item => {
      // Check expiration
      if (item.expiresAt && Date.now() > item.expiresAt) {
        return false;
      }

      // Filter by type if specified
      if (options?.type && item.type !== options.type) {
        return false;
      }

      // Search in data (simple text search)
      const dataString = JSON.stringify(item.data).toLowerCase();
      const tagsString = item.tags.join(' ').toLowerCase();

      return dataString.includes(lowerQuery) || tagsString.includes(lowerQuery);
    });

    // Sort by relevance (timestamp for now)
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (options?.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  // Get or create session
  private getOrCreateSession(sessionId: string): ContextSession {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        id: sessionId,
        items: [],
        metadata: new Map(),
        createdAt: Date.now(),
        lastActivity: Date.now()
      };

      this.sessions.set(sessionId, session);
    }

    return session;
  }

  // Trim old items to prevent memory issues
  private trimSessionItems(session: ContextSession): void {
    // Remove expired items
    const now = Date.now();
    session.items = session.items.filter(item => {
      return !item.expiresAt || item.expiresAt > now;
    });

    // If still too many items, remove oldest
    if (session.items.length > this.maxItemsPerSession) {
      session.items.sort((a, b) => b.timestamp - a.timestamp);
      session.items = session.items.slice(0, this.maxItemsPerSession);
    }
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
      console.log(`Cleaned up ${toDelete.length} old context sessions`);
    }
  }

  // Start cleanup interval
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupOldSessions();
    }, 10 * 60 * 1000); // Clean up every 10 minutes
  }

  // Get statistics
  getStats(): {
    totalSessions: number;
    totalItems: number;
    averageItemsPerSession: number;
    oldestSessionAge: number;
  } {
    const now = Date.now();
    let totalItems = 0;
    let oldestSessionAge = 0;

    for (const session of this.sessions.values()) {
      totalItems += session.items.length;
      const sessionAge = now - session.createdAt;
      if (sessionAge > oldestSessionAge) {
        oldestSessionAge = sessionAge;
      }
    }

    return {
      totalSessions: this.sessions.size,
      totalItems,
      averageItemsPerSession: this.sessions.size > 0 ? totalItems / this.sessions.size : 0,
      oldestSessionAge
    };
  }

  // Export session data (for debugging)
  exportSession(sessionId: string): ContextSession | null {
    return this.sessions.get(sessionId) || null;
  }

  // Import session data (for testing)
  importSession(session: ContextSession): void {
    this.sessions.set(session.id, session);
  }
}
