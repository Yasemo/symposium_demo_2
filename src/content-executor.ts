// Content Executor for Symposium Demo
// Coordinates content block execution across isolates and manages results

import { SymposiumIsolateManager, ContentBlockIsolate } from './isolate-manager.ts';

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
  data?: any;
}

export class SymposiumContentExecutor implements ContentExecutor {
  private isolateManager: SymposiumIsolateManager;
  private executionCache = new Map<string, ExecutionResult>();

  constructor(isolateManager: SymposiumIsolateManager) {
    this.isolateManager = isolateManager;
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
          staticData: code.data,
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

      // If isolate doesn't exist, recreate it with current code
      if (!isolate) {
        console.log(`Isolate for block ${blockId} not found, recreating...`);

        // Get current code from cache
        const currentResult = this.executionCache.get(blockId);
        if (!currentResult) {
          throw new Error(`No cached result found for block ${blockId}`);
        }

        // Create new isolate with current code
        const currentCode: ContentBlockCode = {
          html: currentResult.html || '',
          css: currentResult.css || '',
          javascript: currentResult.javascript || '',
          data: { restored: true, timestamp: Date.now() }
        };

        isolate = await this.isolateManager.createIsolate({
          blockId,
          timeoutMs: 30000,
          maxMemoryMB: 128,
          allowedAPIs: ['demoAPI'],
          staticData: currentCode.data,
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
  } {
    return {
      totalBlocks: this.executionCache.size,
      activeIsolates: this.isolateManager.listActiveIsolates().length,
      cacheSize: this.executionCache.size
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
}
