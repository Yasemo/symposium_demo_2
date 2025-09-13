// Content Executor for Symposium Demo
// Coordinates content block execution across isolates and manages results

import { SymposiumIsolateManager, ContentBlockIsolate } from './isolate-manager.ts';
import { envLoader } from './env-loader.ts';

// Deno KV is built-in to Deno 2.0+
const { openKv } = Deno;

// Compression utilities for large content
async function compressText(text: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  // Use CompressionStream if available (Deno 1.30+), otherwise store uncompressed
  try {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    writer.write(data);
    writer.close();

    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
      }
    }

    // Concatenate all chunks
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  } catch (error) {
    // Fallback to uncompressed if compression fails
    console.warn('Compression not available, storing uncompressed');
    return data;
  }
}

async function decompressText(data: Uint8Array): Promise<string> {
  try {
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    writer.write(data);
    writer.close();

    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        totalLength += value.length;
      }
    }

    // Concatenate all chunks
    const decompressed = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }

    const decoder = new TextDecoder();
    return decoder.decode(decompressed);
  } catch (error) {
    // Fallback to direct decoding if decompression fails
    console.warn('Decompression failed, trying direct decode');
    const decoder = new TextDecoder();
    return decoder.decode(data);
  }
}

interface ContentExecutor {
  executeContentBlock(blockId: string, code: ContentBlockCode): Promise<ExecutionResult>;
  updateContentBlock(blockId: string, updates: Partial<ContentBlockCode>): Promise<ExecutionResult>;
  getContentBlockOutput(blockId: string): Promise<string>;
  terminateContentBlock(blockId: string): Promise<void>;
}

interface ExecutionResult {
  success: boolean;
  html?: string;
  css?: string;
  javascript?: string;
  data?: any;
  logs?: string[];
  error?: string;
  timestamp: number;
}

interface ContentBlockCode {
  html: string;
  css: string;
  javascript: string;
}

export class SymposiumContentExecutor implements ContentExecutor {
  private isolateManager: SymposiumIsolateManager;
  private executionCache = new Map<string, ExecutionResult>();
  private kv: any;

  constructor(isolateManager: SymposiumIsolateManager) {
    this.isolateManager = isolateManager;
    this.initializeKV();
  }

  private async initializeKV() {
    try {
      this.kv = await Deno.openKv();
      console.log('Deno KV initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Deno KV:', error);
      // Continue without KV - content blocks will work but without persistence
    }
  }

  async executeContentBlock(blockId: string, code: ContentBlockCode): Promise<ExecutionResult> {
    try {
      console.log(`Executing content block: ${blockId}`);

      let isolate;

      // Check if isolate already exists
      const existingIsolate = this.isolateManager.getIsolate(blockId);
      if (existingIsolate) {
        console.log(`Reusing existing isolate for block ${blockId}`);
        isolate = existingIsolate;
      } else {
        // Create new isolate for this content block
        isolate = await this.isolateManager.createIsolate({
          blockId,
          timeoutMs: 30000,
          maxMemoryMB: 128,
          allowedAPIs: ['demoAPI'],
          networkAccess: {
            allowedUrls: [
              'https://esm.sh/',
              'https://cdn.skypack.dev/',
              'https://unpkg.com/',
              'https://cdn.jsdelivr.net/'
            ],
            allowFetch: true
          }
        });
      }

      // Execute code in isolate
      const result = await isolate.executeCode(code);

      // Cache the result
      this.executionCache.set(blockId, result);

      // Save content block to database for persistence
      await this.saveContentBlockToDatabase(blockId, result);

      // Handle isolate API calls
      this.setupIsolateAPIHandlers(isolate, blockId);

      console.log(`Content block ${blockId} executed successfully`);
      return result;

    } catch (error) {
      console.error(`Content block ${blockId} execution failed:`, error);

      const errorResult: ExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs: [`Execution failed: ${error instanceof Error ? error.message : String(error)}`],
        timestamp: Date.now()
      };

      // Cache the error result
      this.executionCache.set(blockId, errorResult);

      return errorResult;
    }
  }

  async updateContentBlock(blockId: string, updates: Partial<ContentBlockCode>): Promise<ExecutionResult> {
    try {
      console.log(`Updating content block: ${blockId}`);

      let isolate = this.isolateManager.getIsolate(blockId);

      // If isolate doesn't exist, try to recreate it with current code
      if (!isolate) {
        console.log(`Isolate for block ${blockId} not found, attempting to recreate...`);

        // Get current code from cache
        const currentResult = this.executionCache.get(blockId);
        if (currentResult) {
          // Create new isolate with current code
          const currentCode: ContentBlockCode = {
            html: currentResult.html || '',
            css: currentResult.css || '',
            javascript: currentResult.javascript || ''
          };

          isolate = await this.isolateManager.createIsolate({
            blockId,
            timeoutMs: 30000,
            maxMemoryMB: 128,
            allowedAPIs: ['demoAPI'],
            networkAccess: {
              allowedUrls: [
                'https://esm.sh/',
                'https://cdn.skypack.dev/',
                'https://unpkg.com/',
                'https://cdn.jsdelivr.net/'
              ],
              allowFetch: true
            }
          });

          // Execute current code in the new isolate first
          await isolate.executeCode(currentCode);
          console.log(`Isolate recreated and initialized for block ${blockId}`);
        } else {
          // No cached result available, create isolate and execute updates as new content
          console.log(`No cached result for block ${blockId}, creating isolate and executing updates as new content`);

          isolate = await this.isolateManager.createIsolate({
            blockId,
            timeoutMs: 30000,
            maxMemoryMB: 128,
            allowedAPIs: ['demoAPI'],
            networkAccess: {
              allowedUrls: [
                'https://esm.sh/',
                'https://cdn.skypack.dev/',
                'https://unpkg.com/',
                'https://cdn.jsdelivr.net/'
              ],
              allowFetch: true
            }
          });

          // Execute the updates as new content
          const result = await isolate.executeCode(updates as ContentBlockCode);

          // Cache the result
          this.executionCache.set(blockId, result);

          // Save content block to database for persistence
          await this.saveContentBlockToDatabase(blockId, result);

          // Handle isolate API calls
          this.setupIsolateAPIHandlers(isolate, blockId);

          console.log(`Content block ${blockId} created and updated successfully`);
          return result;
        }
      }

      // Now update with the new code
      const result = await isolate.updateCode(updates);

      // Update cache with new result
      const cachedResult = this.executionCache.get(blockId);
      if (cachedResult) {
        // Merge updates into cached result
        Object.assign(cachedResult, result);
      } else {
        this.executionCache.set(blockId, result);
      }

      // Save updated content block to database
      await this.saveContentBlockToDatabase(blockId, result);

      console.log(`Content block ${blockId} updated successfully`);
      return result;

    } catch (error) {
      console.error(`Content block ${blockId} update failed:`, error);

      const errorResult: ExecutionResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs: [`Update failed: ${error instanceof Error ? error.message : String(error)}`],
        timestamp: Date.now()
      };

      return errorResult;
    }
  }

  async getContentBlockOutput(blockId: string): Promise<string> {
    const cachedResult = this.executionCache.get(blockId);
    if (!cachedResult || !cachedResult.success) {
      throw new Error(`No successful execution result found for block ${blockId}`);
    }

    // Generate complete HTML document for iframe display
    return this.generateHTMLOutput(cachedResult);
  }

  async terminateContentBlock(blockId: string): Promise<void> {
    // Clear from cache
    this.executionCache.delete(blockId);

    // Delete from database
    await this.deleteContentBlockFromDatabase(blockId);

    // Terminate isolate
    await this.isolateManager.terminateIsolate(blockId);
    console.log(`Content block ${blockId} terminated`);
  }

  private setupIsolateAPIHandlers(isolate: ContentBlockIsolate, blockId: string) {
    // In a real implementation, you'd set up listeners for API calls from the isolate
    // For now, this is a placeholder for future API handling
    console.log(`API handlers set up for isolate ${blockId}`);
  }

  private generateHTMLOutput(result: ExecutionResult): string {
    // Create complete HTML document for iframe display
    const css = result.css || '';
    const html = result.html || '<p>Content block executed successfully</p>';
    const javascript = result.javascript || '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 16px;
            line-height: 1.6;
          }
          ${css}
        </style>
      </head>
      <body>
        ${html}
        <script>
          ${javascript}
        </script>
      </body>
      </html>
    `.trim();
  }

  // Get execution statistics
  getExecutionStats(): {
    totalBlocks: number;
    activeIsolates: number;
    cacheSize: number;
    executionMetrics: {
      totalExecutions: number;
      successfulExecutions: number;
      failedExecutions: number;
      averageExecutionTime: number;
      totalExecutionTime: number;
      cacheHitRate: number;
    };
    performance: {
      memoryUsage: number;
      cacheEfficiency: number;
      isolateUtilization: number;
    };
  } {
    const activeIsolates = this.isolateManager.listActiveIsolates().length;
    const maxIsolates = 10; // From main.ts

    // Calculate execution metrics
    let totalExecutionTime = 0;
    let successfulExecutions = 0;
    let failedExecutions = 0;
    let cacheHits = 0;

    for (const [blockId, result] of this.executionCache.entries()) {
      if (result.success) {
        successfulExecutions++;
      } else {
        failedExecutions++;
      }

      // Estimate execution time from timestamp (rough approximation)
      if (result.timestamp) {
        totalExecutionTime += Date.now() - result.timestamp;
      }
    }

    const totalExecutions = successfulExecutions + failedExecutions;
    const averageExecutionTime = totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0;
    const cacheHitRate = totalExecutions > 0 ? (cacheHits / totalExecutions) * 100 : 0;

    // Get memory usage
    let memoryUsage = 0;
    try {
      const memInfo = Deno.memoryUsage();
      memoryUsage = memInfo.heapUsed / (1024 * 1024);
    } catch (error) {
      console.warn('Unable to get memory usage in content executor:', error);
    }

    return {
      totalBlocks: this.executionCache.size,
      activeIsolates,
      cacheSize: this.executionCache.size,
      executionMetrics: {
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        averageExecutionTime,
        totalExecutionTime,
        cacheHitRate
      },
      performance: {
        memoryUsage,
        cacheEfficiency: this.executionCache.size > 0 ? (cacheHits / this.executionCache.size) * 100 : 0,
        isolateUtilization: (activeIsolates / maxIsolates) * 100
      }
    };
  }

  // Clear execution cache
  clearCache(): void {
    this.executionCache.clear();
    console.log('Execution cache cleared');
  }

  // Get cached result for a block
  getCachedResult(blockId: string): ExecutionResult | null {
    return this.executionCache.get(blockId) || null;
  }

  // KV-based persistent storage for content blocks
  async saveContentBlockData(blockId: string, key: string, value: any): Promise<boolean> {
    if (!this.kv) {
      console.warn('KV not available, data not persisted');
      return false;
    }

    try {
      await this.kv.set(['content-blocks', blockId, 'data', key], value);
      // Reduced logging for data operations to avoid spam
      if (envLoader?.getConfig().debugMode) {
        console.log(`💾 Saved data for block ${blockId}: ${key}`);
      }
      return true;
    } catch (error) {
      console.error(`Failed to save data for block ${blockId}:`, error);
      return false;
    }
  }

  async getContentBlockData(blockId: string, key: string): Promise<any> {
    if (!this.kv) {
      console.warn('KV not available, returning null');
      return null;
    }

    try {
      const entry = await this.kv.get(['content-blocks', blockId, 'data', key]);
      return entry.value;
    } catch (error) {
      console.error(`Failed to get data for block ${blockId}:`, error);
      return null;
    }
  }

  async getAllContentBlockData(blockId: string): Promise<Record<string, any>> {
    if (!this.kv) {
      console.warn('KV not available, returning empty object');
      return {};
    }

    try {
      const data: Record<string, any> = {};
      const entries = this.kv.list({ prefix: ['content-blocks', blockId, 'data'] });

      for await (const entry of entries) {
        const key = entry.key[3]; // Extract the data key from the array
        data[key] = entry.value;
      }

      return data;
    } catch (error) {
      console.error(`Failed to get all data for block ${blockId}:`, error);
      return {};
    }
  }

  async deleteContentBlockData(blockId: string, key: string): Promise<boolean> {
    if (!this.kv) {
      console.warn('KV not available, cannot delete');
      return false;
    }

    try {
      await this.kv.delete(['content-blocks', blockId, 'data', key]);
      console.log(`Deleted data for block ${blockId}: ${key}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete data for block ${blockId}:`, error);
      return false;
    }
  }

  // Save content block code to database for persistence
  async saveContentBlockToDatabase(blockId: string, result: ExecutionResult): Promise<boolean> {
    if (!this.kv) {
      console.warn('KV not available, content block not persisted');
      return false;
    }

    try {
      // Calculate sizes to determine storage strategy
      const codeSize = JSON.stringify(result.html || '').length +
                      JSON.stringify(result.css || '').length +
                      JSON.stringify(result.javascript || '').length;

      const executionDataSize = JSON.stringify({
        success: result.success,
        data: result.data,
        logs: result.logs,
        error: result.error,
        timestamp: result.timestamp
      }).length;

      const totalSize = codeSize + executionDataSize;

      console.log(`📊 Content block ${blockId} sizes: code=${codeSize}B, execution=${executionDataSize}B, total=${totalSize}B`);

      // Strategy: Store code + essential metadata in main entry, execution results separately if large
      const mainEntry = {
        id: blockId,
        code: {
          html: result.html || '',
          css: result.css || '',
          javascript: result.javascript || ''
        },
        success: result.success,
        timestamp: result.timestamp || Date.now(),
        lastUpdated: Date.now(),
        hasSeparateExecutionData: false
      };

      // If total size is approaching 64KB limit, store execution data separately
      if (totalSize > 50000) { // 50KB threshold to be safe
        console.log(`📦 Large content block detected, storing execution data separately`);

        // Compress execution data
        const executionData = {
          data: result.data,
          logs: result.logs,
          error: result.error
        };

        const executionDataJson = JSON.stringify(executionData);
        const compressedExecutionData = await compressText(executionDataJson);

        // Store execution data separately
        await this.kv.set(['content-blocks', blockId, 'execution'], {
          compressed: true,
          data: compressedExecutionData,
          originalSize: executionDataJson.length,
          compressedSize: compressedExecutionData.length
        });

        mainEntry.hasSeparateExecutionData = true;
        console.log(`💾 Stored compressed execution data (${compressedExecutionData.length}B compressed from ${executionDataJson.length}B)`);
      } else {
        // Store everything in main entry
        mainEntry.data = result.data;
        mainEntry.logs = result.logs;
        mainEntry.error = result.error;
      }

      // Compress large code content if needed
      const codeJson = JSON.stringify(mainEntry.code);
      if (codeJson.length > 30000) { // Compress if code > 30KB
        console.log(`🗜️ Compressing large code content`);
        const compressedCode = await compressText(codeJson);
        mainEntry.code = { compressed: true, data: compressedCode, originalSize: codeJson.length };
        console.log(`💾 Stored compressed code (${compressedCode.length}B compressed from ${codeJson.length}B)`);
      }

      await this.kv.set(['content-blocks', blockId, 'code'], mainEntry);
      console.log(`💾 Saved content block ${blockId} to database (${totalSize > 50000 ? 'split storage' : 'single entry'})`);
      return true;
    } catch (error) {
      console.error(`Failed to save content block ${blockId} to database:`, error);
      return false;
    }
  }

  // Load content block from database
  async loadContentBlockFromDatabase(blockId: string): Promise<ExecutionResult | null> {
    if (!this.kv) {
      console.warn('KV not available, cannot load content block');
      return null;
    }

    try {
      const mainEntry = await this.kv.get(['content-blocks', blockId, 'code']);
      if (!mainEntry.value) {
        return null;
      }

      const data = mainEntry.value;
      console.log(`📖 Loaded content block ${blockId} from database`);

      // Reconstruct the execution result
      const result: ExecutionResult = {
        success: data.success,
        timestamp: data.timestamp
      };

      // Handle compressed or uncompressed code
      if (data.code.compressed) {
        console.log(`🗜️ Decompressing code for ${blockId}`);
        const decompressedCode = await decompressText(data.code.data);
        const codeData = JSON.parse(decompressedCode);
        result.html = codeData.html;
        result.css = codeData.css;
        result.javascript = codeData.javascript;
      } else {
        result.html = data.code.html;
        result.css = data.code.css;
        result.javascript = data.code.javascript;
      }

      // Load execution data (logs, error, data)
      if (data.hasSeparateExecutionData) {
        console.log(`📦 Loading separate execution data for ${blockId}`);
        const executionEntry = await this.kv.get(['content-blocks', blockId, 'execution']);
        if (executionEntry.value) {
          const execData = executionEntry.value;
          if (execData.compressed) {
            const decompressedExec = await decompressText(execData.data);
            const executionJson = JSON.parse(decompressedExec);
            result.data = executionJson.data;
            result.logs = executionJson.logs;
            result.error = executionJson.error;
          } else {
            result.data = execData.data;
            result.logs = execData.logs;
            result.error = execData.error;
          }
        }
      } else {
        // Execution data is in main entry
        result.data = data.data;
        result.logs = data.logs;
        result.error = data.error;
      }

      return result;
    } catch (error) {
      console.error(`Failed to load content block ${blockId} from database:`, error);
      return null;
    }
  }

  // Load all content blocks from database on startup
  async loadAllContentBlocksFromDatabase(): Promise<void> {
    if (!this.kv) {
      console.warn('KV not available, cannot load content blocks');
      return;
    }

    try {
      console.log('📚 Loading content blocks from database...');
      const entries = this.kv.list({ prefix: ['content-blocks'] });
      let loadedCount = 0;

      for await (const entry of entries) {
        // Only process code entries (not data or execution entries)
        if (entry.key.length === 3 && entry.key[2] === 'code') {
          const blockId = entry.key[1];

          // Use the proper load method to handle compression and separate storage
          const result = await this.loadContentBlockFromDatabase(blockId);
          if (result) {
            // Restore to execution cache
            this.executionCache.set(blockId, result);
            loadedCount++;
            console.log(`✅ Restored content block ${blockId} from database`);
          }
        }
      }

      console.log(`📚 Loaded ${loadedCount} content blocks from database`);
    } catch (error) {
      console.error('Failed to load content blocks from database:', error);
    }
  }

  // Delete content block from database
  async deleteContentBlockFromDatabase(blockId: string): Promise<boolean> {
    if (!this.kv) {
      console.warn('KV not available, cannot delete content block');
      return false;
    }

    try {
      // Delete the code entry
      await this.kv.delete(['content-blocks', blockId, 'code']);

      // Delete the separate execution data entry if it exists
      await this.kv.delete(['content-blocks', blockId, 'execution']);

      // Delete all associated data entries
      const dataEntries = this.kv.list({ prefix: ['content-blocks', blockId, 'data'] });
      for await (const entry of dataEntries) {
        await this.kv.delete(entry.key);
      }

      console.log(`🗑️ Deleted content block ${blockId} from database`);
      return true;
    } catch (error) {
      console.error(`Failed to delete content block ${blockId} from database:`, error);
      return false;
    }
  }
}
