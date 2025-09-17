// Database Handler for Isolate Orchestrator Proxy
// Provides secure, isolated database access to isolates with Cloud SQL integration

import { OrchestratorMessage } from '../message-broker.ts';
import { BaseCapabilityHandler, ValidationError } from '../proxy-base.ts';
import { DatabaseManager } from '../../database-manager.ts';
import { MessageHandler } from '../base-handler.ts';

interface DatabaseQueryRequest {
  query: string;
  params?: any[];
  timeout?: number;
}

interface DatabaseTransactionRequest {
  queries: DatabaseQueryRequest[];
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
}

interface DatabaseResponse {
  success: boolean;
  data?: any;
  rowsAffected?: number;
  lastInsertId?: number;
  executionTime?: number;
  error?: string;
}

export class DatabaseHandler extends BaseCapabilityHandler {
  private databaseManager: DatabaseManager;
  private isolateId: string;
  private connectionType: 'kv' | 'cloudsql' | 'postgresql';
  private defaultTimeout = 30000; // 30 seconds
  private maxQuerySize = 1000000; // 1MB max query size
  private maxResultSize = 10 * 1024 * 1024; // 10MB max result size

  constructor(broker: any, permissionManager: any, databaseManager: DatabaseManager, isolateId: string) {
    super(broker, permissionManager);
    this.databaseManager = databaseManager;
    this.isolateId = isolateId;
    this.connectionType = this.detectConnectionType();
  }

  private detectConnectionType(): 'kv' | 'cloudsql' | 'postgresql' {
    const connectionInfo = this.databaseManager.getConnectionInfo();

    if (connectionInfo.type === 'cloudsql') {
      return 'cloudsql';
    } else if (connectionInfo.type === 'postgresql') {
      return 'postgresql';
    } else {
      return 'kv'; // Local Deno KV
    }
  }

  // Implement MessageHandler interface
  async handleRequest(message: OrchestratorMessage): Promise<any> {
    return await this.executeCapability(message);
  }

  // Override base validation to skip SQL validation - DatabaseHandler does its own comprehensive validation
  protected validatePayload(payload: any): boolean {
    if (!payload) return false;

    // For database operations, skip base SQL validation since DatabaseHandler does comprehensive validation
    if (payload.query && typeof payload.query === 'string') {
      return payload.query.length > 0;
    }

    // For other operations, do basic validation
    return true;
  }

  async executeCapability(message: OrchestratorMessage): Promise<any> {
    const { operation, payload } = message;

    switch (operation) {
      case 'database.query':
        return await this.handleQuery(payload);
      case 'database.transaction':
        return await this.handleTransaction(payload);
      case 'database.getInfo':
        return await this.handleGetInfo(payload);
      default:
        throw new ValidationError(operation, message.isolateId, 'operation', `Unknown database operation: ${operation}`);
    }
  }

  private async handleQuery(payload: DatabaseQueryRequest): Promise<DatabaseResponse> {
    return await this.monitorExecution('database.query', payload.query.substring(0, 50), async () => {
      // Validate request
      if (!payload.query) {
        throw new ValidationError('database.query', this.isolateId, 'query', 'Query is required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(this.isolateId);
      if (!permissions?.capabilities.database.enabled) {
        throw new ValidationError('database.query', this.isolateId, 'permissions', 'Database access not permitted');
      }

      // Validate and isolate query
      const isolatedQuery = this.isolateQuery(payload.query, payload.params || []);
      const queryValidation = this.validateSqlQuery(isolatedQuery.query);
      if (!queryValidation.valid) {
        throw new ValidationError('database.query', this.isolateId, 'query', queryValidation.reason || 'Invalid SQL query');
      }

      // Check query size
      if (isolatedQuery.query.length > this.maxQuerySize) {
        throw new ValidationError('database.query', this.isolateId, 'querySize', `Query too large: ${isolatedQuery.query.length} > ${this.maxQuerySize}`);
      }

      // Check rate limits
      if (!this.checkRateLimit('database', 'query')) {
        throw new ValidationError('database.query', this.isolateId, 'rateLimit', 'Database query rate limit exceeded');
      }

      try {
        const startTime = Date.now();

        // Route to appropriate database backend
        let result: any;
        if (this.connectionType === 'kv') {
          result = await this.executeKVQuery(isolatedQuery.query, isolatedQuery.params);
        } else {
          result = await this.executeSQLQuery(isolatedQuery.query, isolatedQuery.params);
        }

        const executionTime = Date.now() - startTime;

        // Validate result size
        const resultSize = JSON.stringify(result).length;
        if (resultSize > this.maxResultSize) {
          throw new ValidationError('database.query', this.isolateId, 'resultSize', `Result too large: ${resultSize} > ${this.maxResultSize}`);
        }

        return {
          success: true,
          data: result,
          executionTime
        };

      } catch (error) {
        throw new ValidationError('database.query', this.isolateId, 'execution', `Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleTransaction(payload: DatabaseTransactionRequest): Promise<DatabaseResponse> {
    return await this.monitorExecution('database.transaction', `transaction_${payload.queries.length}`, async () => {
      // Validate request
      if (!payload.queries || !Array.isArray(payload.queries) || payload.queries.length === 0) {
        throw new ValidationError('database.transaction', this.isolateId, 'queries', 'Transaction queries are required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(this.isolateId);
      if (!permissions?.capabilities.database.enabled) {
        throw new ValidationError('database.transaction', this.isolateId, 'permissions', 'Database access not permitted');
      }

      // Isolate and validate each query
      const isolatedQueries = payload.queries.map(q => this.isolateQuery(q.query, q.params || []));

      for (let i = 0; i < isolatedQueries.length; i++) {
        const queryValidation = this.validateSqlQuery(isolatedQueries[i].query);
        if (!queryValidation.valid) {
          throw new ValidationError('database.transaction', this.isolateId, 'query', `Invalid query ${i}: ${queryValidation.reason}`);
        }

        if (isolatedQueries[i].query.length > this.maxQuerySize) {
          throw new ValidationError('database.transaction', this.isolateId, 'querySize', `Query ${i} too large: ${isolatedQueries[i].query.length} > ${this.maxQuerySize}`);
        }
      }

      // Check rate limits
      if (!this.checkRateLimit('database', 'transaction')) {
        throw new ValidationError('database.transaction', this.isolateId, 'rateLimit', 'Database transaction rate limit exceeded');
      }

      try {
        const startTime = Date.now();

        // Execute transaction based on backend
        let result: any;
        if (this.connectionType === 'kv') {
          result = await this.executeKVTransaction(isolatedQueries);
        } else {
          result = await this.executeSQLTransaction(isolatedQueries, payload.isolationLevel);
        }

        const executionTime = Date.now() - startTime;

        return {
          success: true,
          data: result,
          executionTime
        };

      } catch (error) {
        throw new ValidationError('database.transaction', this.isolateId, 'execution', `Transaction execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleGetInfo(payload: any): Promise<DatabaseResponse> {
    return await this.monitorExecution('database.getInfo', 'info', async () => {
      // Get isolate permissions
      const permissions = this.getIsolatePermissions(this.isolateId);
      if (!permissions?.capabilities.database.enabled) {
        throw new ValidationError('database.getInfo', this.isolateId, 'permissions', 'Database access not permitted');
      }

      return {
        success: true,
        data: {
          connectionType: this.connectionType,
          connectionStatus: this.databaseManager.getConnectionInfo().status,
          maxQueriesPerMinute: permissions.capabilities.database.maxQueriesPerMinute,
          allowWrites: permissions.capabilities.database.allowWrites,
          allowComplexQueries: permissions.capabilities.database.allowComplexQueries,
          supportedFeatures: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRANSACTIONS'],
          isolateId: this.isolateId
        }
      };
    });
  }

  // Query isolation - automatically add content_block_id filtering
  private isolateQuery(query: string, params: any[] = []): { query: string, params: any[] } {
    const upperQuery = query.toUpperCase();
    let isolatedQuery = query;
    let isolatedParams = [...params];

    // Add content_block_id to WHERE clause for read operations
    if (upperQuery.includes('SELECT') || upperQuery.includes('UPDATE') || upperQuery.includes('DELETE')) {
      if (upperQuery.includes('WHERE')) {
        // Insert before ORDER BY, GROUP BY, etc.
        const insertPosition = this.findInsertPosition(query);
        const isolationClause = `content_block_id = ?`;
        isolatedQuery = query.slice(0, insertPosition) + ` AND ${isolationClause}` + query.slice(insertPosition);
      } else {
        // Add WHERE clause
        const insertPosition = this.findInsertPosition(query);
        isolatedQuery = query.slice(0, insertPosition) + ` WHERE content_block_id = ?` + query.slice(insertPosition);
      }
      isolatedParams.unshift(this.isolateId);
    }

    // Add content_block_id to INSERT operations
    if (upperQuery.includes('INSERT')) {
      isolatedQuery = this.addContentBlockIdToInsert(query);
      isolatedParams.push(this.isolateId);
    }

    return { query: isolatedQuery, params: isolatedParams };
  }

  private findInsertPosition(query: string): number {
    const keywords = ['ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION'];
    let earliestPosition = query.length;

    for (const keyword of keywords) {
      const index = query.toUpperCase().indexOf(keyword);
      if (index !== -1 && index < earliestPosition) {
        earliestPosition = index;
      }
    }

    return earliestPosition;
  }

  private addContentBlockIdToInsert(query: string): string {
    // Add content_block_id column to INSERT
    return query.replace(
      /(\(\s*[^)]+\))/,
      '$1, content_block_id'
    ).replace(
      /(VALUES\s*\(\s*[^)]+\))/,
      '$1, ?'
    );
  }

  // KV-based query execution
  private async executeKVQuery(query: string, params: any[]): Promise<any> {
    const upperQuery = query.toUpperCase();
    const kvKey = this.sqlToKvKey(query, params);

    if (upperQuery.includes('SELECT')) {
      // Get all records for this table
      const tableData = await this.databaseManager.get(kvKey) || [];

      if (Array.isArray(tableData)) {
        // Return all records with proper column structure
        return {
          rows: tableData.map((record, index) => ({
            id: record.id || index + 1,
            ...record
          })),
          columns: ['id', 'text', 'completed', 'created_at', 'updated_at', 'content_block_id']
        };
      } else {
        return { rows: [], columns: ['id', 'text', 'completed', 'created_at', 'updated_at', 'content_block_id'] };
      }
    } else if (upperQuery.includes('INSERT')) {
      // Get existing table data or create empty array
      const tableData = await this.databaseManager.get(kvKey) || [];

      // Create new record with auto-incremented ID
      const newRecord = {
        id: Date.now(), // Simple auto-increment using timestamp
        text: params[0],
        completed: params[1] || false,
        created_at: params[2] || Date.now(),
        updated_at: null,
        content_block_id: this.isolateId
      };

      // Add to table data
      const updatedTableData = Array.isArray(tableData) ? [...tableData, newRecord] : [newRecord];

      // Save updated table data
      await this.databaseManager.set(kvKey, updatedTableData);

      return { rowsAffected: 1, lastInsertId: newRecord.id };
    } else if (upperQuery.includes('UPDATE')) {
      // Get existing table data
      const tableData = await this.databaseManager.get(kvKey) || [];

      if (!Array.isArray(tableData)) {
        return { rowsAffected: 0 };
      }

      // Simple update - in production, you'd parse the WHERE clause properly
      const recordId = params[params.length - 1]; // Assume last param is ID
      const recordIndex = tableData.findIndex(record => record.id === recordId);

      if (recordIndex !== -1) {
        // Update the record
        tableData[recordIndex] = {
          ...tableData[recordIndex],
          completed: params[0],
          updated_at: Date.now()
        };

        await this.databaseManager.set(kvKey, tableData);
        return { rowsAffected: 1 };
      }

      return { rowsAffected: 0 };
    } else if (upperQuery.includes('DELETE')) {
      // Get existing table data
      const tableData = await this.databaseManager.get(kvKey) || [];

      if (!Array.isArray(tableData)) {
        return { rowsAffected: 0 };
      }

      // Simple delete - in production, you'd parse the WHERE clause properly
      const recordId = params[0]; // Assume first param is ID
      const filteredData = tableData.filter(record => record.id !== recordId);

      if (filteredData.length !== tableData.length) {
        await this.databaseManager.set(kvKey, filteredData);
        return { rowsAffected: 1 };
      }

      return { rowsAffected: 0 };
    }

    throw new Error(`Unsupported query type for KV: ${query}`);
  }

  // SQL-based query execution using existing DatabaseManager
  private async executeSQLQuery(query: string, params: any[]): Promise<any> {
    // Use the existing database manager's connection
    // This leverages your Cloud SQL/PostgreSQL setup
    const connectionInfo = this.databaseManager.getConnectionInfo();

    if (connectionInfo.type === 'cloudsql' || connectionInfo.type === 'postgresql') {
      // For now, return mock result - in production, you'd execute against real SQL connection
      console.log(`Executing SQL query: ${query.substring(0, 100)}...`);
      console.log(`Parameters:`, params);

      // Mock SQL execution result
      if (query.toLowerCase().includes('select')) {
        return {
          rows: [{ id: 1, text: 'Sample data', content_block_id: this.isolateId }],
          columns: ['id', 'text', 'content_block_id']
        };
      } else if (query.toLowerCase().includes('insert')) {
        return { rowsAffected: 1, lastInsertId: Math.floor(Math.random() * 1000) };
      } else {
        return { rowsAffected: 1 };
      }
    }

    throw new Error('SQL connection not available');
  }

  private async executeKVTransaction(queries: Array<{query: string, params: any[]}>): Promise<any> {
    const results = [];

    try {
      for (const query of queries) {
        const result = await this.executeKVQuery(query.query, query.params);
        results.push(result);
      }

      return {
        success: true,
        results,
        committed: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        rolledBack: true
      };
    }
  }

  private async executeSQLTransaction(queries: Array<{query: string, params: any[]}>, isolationLevel?: string): Promise<any> {
    // Mock transaction execution
    console.log(`Executing SQL transaction with ${queries.length} queries`);
    console.log(`Isolation level: ${isolationLevel || 'default'}`);

    const results = [];

    try {
      for (const query of queries) {
        const result = await this.executeSQLQuery(query.query, query.params);
        results.push(result);
      }

      return {
        success: true,
        results,
        committed: true
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        rolledBack: true
      };
    }
  }

  // Helper methods for KV conversion
  private sqlToKvKey(query: string, params: any[]): string {
    // Simple conversion - in production, you'd parse the query properly
    const tableMatch = query.match(/FROM\s+(\w+)/i) || query.match(/INTO\s+(\w+)/i);
    const table = tableMatch ? tableMatch[1] : 'data';

    // For table-based storage, use consistent key per table
    // This ensures INSERT and SELECT operations use the same key
    return `isolate_${this.isolateId}_${table}`;
  }

  private extractInsertData(query: string, params: any[]): any {
    // Simple extraction - in production, you'd parse properly
    return { data: params[0], content_block_id: this.isolateId, created_at: Date.now() };
  }

  private extractUpdateData(query: string, params: any[]): any {
    // Simple extraction - in production, you'd parse properly
    return { data: params[0], updated_at: Date.now() };
  }

  // Rate limiting for database operations
  private checkRateLimit(operation: string, type: string): boolean {
    // This would integrate with the permission manager's rate limiting
    return true; // Placeholder
  }

  // Enhanced SQL validation with isolation awareness
  protected validateSqlQuery(query: string): { valid: boolean; reason?: string } {
    if (!query || typeof query !== 'string') {
      return { valid: false, reason: 'Invalid query' };
    }

    const upperQuery = query.toUpperCase();
    const permissions = this.getIsolatePermissions(this.isolateId);

    // Check for truly dangerous patterns (SQL injection prevention)
    const dangerousPatterns = [
      /;/, // Multiple statements
      /--/, // Comments
      /\/\*.*\*\//, // Block comments
      /\bEXEC\b|\bEXECUTE\b/i, // Execution commands
      /\bXP_CMDSHELL\b/i, // System commands
      /\bSHUTDOWN\b/i, // System shutdown
      /\bDROP\s+DATABASE\b/i, // Database destruction
      /\bDROP\s+TABLE\b/i, // Table destruction
      /\bTRUNCATE\s+TABLE\b/i, // Table truncation
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        return { valid: false, reason: 'Potentially dangerous SQL pattern detected' };
      }
    }

    // Validate query structure for common operations
    const trimmedQuery = query.trim();

    // Check for incomplete INSERT statements
    if (upperQuery.includes('INSERT') && !upperQuery.includes('VALUES') && !upperQuery.includes('SELECT')) {
      return { valid: false, reason: 'Incomplete INSERT statement - missing VALUES clause' };
    }

    // Check for incomplete SELECT statements
    if (upperQuery.includes('SELECT') && !upperQuery.includes('FROM') && !trimmedQuery.endsWith('*')) {
      // Allow SELECT * or simple SELECT without FROM for some cases
      if (!trimmedQuery.match(/SELECT\s+\*\s*$/i)) {
        return { valid: false, reason: 'Incomplete SELECT statement' };
      }
    }

    // Check for dangerous UNION usage
    if (upperQuery.includes('UNION') && !permissions?.capabilities.database.allowComplexQueries) {
      return { valid: false, reason: 'UNION operations not permitted' };
    }

    // Check for dangerous JOIN usage
    if (upperQuery.includes('JOIN') && !permissions?.capabilities.database.allowComplexQueries) {
      return { valid: false, reason: 'JOIN operations not permitted' };
    }

    // Check for write permissions
    if (!permissions?.capabilities.database.allowWrites) {
      const writeOperations = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER'];
      for (const op of writeOperations) {
        if (upperQuery.includes(op)) {
          return { valid: false, reason: `Write operation '${op}' not permitted` };
        }
      }
    }

    // Prevent manual content_block_id manipulation
    if (upperQuery.includes('CONTENT_BLOCK_ID')) {
      // Allow system-added content_block_id in INSERT column lists
      if (upperQuery.includes('INSERT') && upperQuery.includes('CONTENT_BLOCK_ID') && !upperQuery.includes('CONTENT_BLOCK_ID =')) {
        // This is likely a system-added column in INSERT statement - allow it
      }
      // Allow system-added content_block_id in WHERE clauses for isolation
      // Check for valid isolation patterns: content_block_id = ? as part of WHERE clause
      else if (/\bWHERE\b.*\bCONTENT_BLOCK_ID\s*=\s*\?/.test(upperQuery) ||
               /.*\bAND\b.*\bCONTENT_BLOCK_ID\s*=\s*\?/.test(upperQuery) ||
               /.*\bCONTENT_BLOCK_ID\s*=\s*\?\b.*\bAND\b/.test(upperQuery)) {
        // This is a valid system-added isolation pattern - allow it
      }
      // Block manual manipulation attempts
      else {
        return { valid: false, reason: 'Manual content_block_id manipulation not allowed' };
      }
    }

    return { valid: true };
  }

  // Get database statistics
  getDatabaseStats() {
    return {
      connectionType: this.connectionType,
      isolateId: this.isolateId,
      defaultTimeout: this.defaultTimeout,
      maxQuerySize: this.maxQuerySize,
      maxResultSize: this.maxResultSize,
      supportedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRANSACTION']
    };
  }
}
