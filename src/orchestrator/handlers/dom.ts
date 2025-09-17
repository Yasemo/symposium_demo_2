// DOM Handler for Isolate Orchestrator Proxy
// Handles HTML parsing, DOM manipulation, and CSS/JS execution securely

import { OrchestratorMessage } from '../message-broker.ts';
import { BaseCapabilityHandler, ValidationError } from '../proxy-base.ts';
import { PermissionManager } from '../permissions.ts';

interface DOMExecutionRequest {
  html: string;
  css?: string;
  javascript?: string;
  operation: 'parse' | 'execute' | 'update' | 'inject_css' | 'inject_js';
}

interface DOMResponse {
  success: boolean;
  html?: string;
  css?: string;
  javascript?: string;
  logs?: string[];
  error?: string;
  executionTime?: number;
}

export class DOMHandler extends BaseCapabilityHandler {
  private domParser: any = null;
  private maxHtmlSize = 10 * 1024 * 1024; // 10MB max HTML
  private maxCssSize = 5 * 1024 * 1024;   // 5MB max CSS
  private maxJsSize = 5 * 1024 * 1024;    // 5MB max JS
  private executionTimeout = 30000;       // 30 seconds

  constructor(broker: any, permissionManager: PermissionManager) {
    super(broker, permissionManager);
    this.initializeDOMParser();
  }

  private async initializeDOMParser() {
    try {
      // Lazy import deno-dom to avoid issues
      const { DOMParser } = await import("deno-dom");
      this.domParser = new DOMParser();
      console.log('[DOMHandler] DOM parser initialized');
    } catch (error) {
      console.error('[DOMHandler] Failed to initialize DOM parser:', error);
      throw error;
    }
  }

  async executeCapability(message: OrchestratorMessage): Promise<any> {
    const { operation, payload, isolateId } = message;

    switch (operation) {
      case 'dom.parse':
        return await this.handleParse(payload, isolateId);
      case 'dom.execute':
        return await this.handleExecute(payload, isolateId);
      case 'dom.update':
        return await this.handleUpdate(payload, isolateId);
      case 'dom.inject_css':
        return await this.handleInjectCss(payload, isolateId);
      case 'dom.inject_js':
        return await this.handleInjectJs(payload, isolateId);
      default:
        throw new ValidationError(operation, isolateId, 'operation', `Unknown DOM operation: ${operation}`);
    }
  }

  private async handleParse(payload: DOMExecutionRequest, isolateId: string): Promise<DOMResponse> {
    return await this.monitorExecution('dom.parse', payload.html?.substring(0, 50) || 'unknown', async () => {
      // Validate request
      if (!payload.html) {
        throw new ValidationError('dom.parse', isolateId, 'html', 'HTML content is required');
      }

      // Check HTML size
      if (payload.html.length > this.maxHtmlSize) {
        throw new ValidationError('dom.parse', isolateId, 'htmlSize', `HTML too large: ${payload.html.length} > ${this.maxHtmlSize}`);
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(isolateId);
      if (!permissions?.capabilities.dom?.enabled) {
        throw new ValidationError('dom.parse', isolateId, 'permissions', 'DOM access not permitted');
      }

      try {
        const startTime = Date.now();

        // Ensure DOM parser is initialized
        if (!this.domParser) {
          await this.initializeDOMParser();
        }

        // Parse HTML
        const document = this.domParser.parseFromString(payload.html, "text/html");

        // Extract basic information
        const title = document.querySelector('title')?.textContent || '';
        const bodyContent = document.body?.innerHTML || '';
        const headContent = document.head?.innerHTML || '';

        const executionTime = Date.now() - startTime;

        return {
          success: true,
          html: payload.html,
          logs: [`Parsed HTML document: ${title ? `Title: ${title}` : 'No title'}`],
          executionTime
        };

      } catch (error) {
        throw new ValidationError('dom.parse', 'unknown', 'execution', `Parse failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleExecute(payload: DOMExecutionRequest, isolateId: string): Promise<DOMResponse> {
    return await this.monitorExecution('dom.execute', payload.javascript?.substring(0, 50) || 'unknown', async () => {
      // Validate request
      if (!payload.html && !payload.javascript) {
        throw new ValidationError('dom.execute', isolateId, 'content', 'HTML or JavaScript content is required');
      }

      // Check sizes
      if (payload.html && payload.html.length > this.maxHtmlSize) {
        throw new ValidationError('dom.execute', isolateId, 'htmlSize', `HTML too large: ${payload.html.length} > ${this.maxHtmlSize}`);
      }
      if (payload.css && payload.css.length > this.maxCssSize) {
        throw new ValidationError('dom.execute', isolateId, 'cssSize', `CSS too large: ${payload.css.length} > ${this.maxCssSize}`);
      }
      if (payload.javascript && payload.javascript.length > this.maxJsSize) {
        throw new ValidationError('dom.execute', isolateId, 'jsSize', `JavaScript too large: ${payload.javascript.length} > ${this.maxJsSize}`);
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(isolateId);
      if (!permissions?.capabilities.dom?.enabled) {
        throw new ValidationError('dom.execute', isolateId, 'permissions', 'DOM execution not permitted');
      }

      try {
        const startTime = Date.now();
        const logs: string[] = [];

        // Ensure DOM parser is initialized
        if (!this.domParser) {
          await this.initializeDOMParser();
        }

        // Parse HTML if provided
        let document: any = null;
        let htmlContent = payload.html || '<html><body></body></html>';
        let extractedCss = payload.css || '';

        if (htmlContent.trim().startsWith('<!DOCTYPE html>')) {
          document = this.domParser.parseFromString(htmlContent, "text/html");
          logs.push('Parsed complete HTML document');

          // Extract CSS from <style> tags in the HTML document
          const styleElements = document.querySelectorAll('style');
          if (styleElements.length > 0) {
            for (const styleElement of styleElements) {
              const cssContent = styleElement.textContent || '';
              if (cssContent.trim()) {
                extractedCss += '\n' + cssContent;
                logs.push(`Extracted CSS from <style> tag: ${cssContent.length} characters`);
              }
            }
          }

          // If we have extracted CSS, ensure it's properly applied
          if (extractedCss.trim()) {
            // Remove existing style elements to avoid duplication
            const existingStyles = document.querySelectorAll('style');
            existingStyles.forEach(style => style.remove());

            // Create a new consolidated style element
            const consolidatedStyle = document.createElement('style');
            consolidatedStyle.textContent = extractedCss.trim();
            document.head.appendChild(consolidatedStyle);
            logs.push(`Consolidated CSS applied: ${extractedCss.length} characters`);
          }
        } else {
          // Create basic document structure
          document = this.domParser.parseFromString(htmlContent, "text/html");
          logs.push('Created HTML document from content');
        }

        // Inject additional CSS if provided separately
        if (payload.css && payload.css.trim()) {
          const styleElement = document.createElement('style');
          styleElement.textContent = payload.css;
          document.head.appendChild(styleElement);
          logs.push(`Injected additional CSS: ${payload.css.length} characters`);
        }

        // Execute JavaScript if provided
        if (payload.javascript) {
          const result = await this.executeJavaScriptInContext(payload.javascript, document, logs);
          logs.push(`Executed JavaScript: ${payload.javascript.length} characters`);
        }

        const executionTime = Date.now() - startTime;

        return {
          success: true,
          html: document.body?.innerHTML || '',
          css: extractedCss || payload.css,
          javascript: payload.javascript,
          logs,
          executionTime
        };

      } catch (error) {
        throw new ValidationError('dom.execute', 'unknown', 'execution', `Execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleUpdate(payload: DOMExecutionRequest, isolateId: string): Promise<DOMResponse> {
    // For updates, we re-execute with new content
    return await this.handleExecute(payload, isolateId);
  }

  private async handleInjectCss(payload: DOMExecutionRequest, isolateId: string): Promise<DOMResponse> {
    return await this.monitorExecution('dom.inject_css', 'css_injection', async () => {
      if (!payload.css) {
        throw new ValidationError('dom.inject_css', isolateId, 'css', 'CSS content is required');
      }

      if (payload.css.length > this.maxCssSize) {
        throw new ValidationError('dom.inject_css', isolateId, 'cssSize', `CSS too large: ${payload.css.length} > ${this.maxCssSize}`);
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(isolateId);
      if (!permissions?.capabilities.dom?.enabled) {
        throw new ValidationError('dom.inject_css', isolateId, 'permissions', 'DOM access not permitted');
      }

      try {
        const startTime = Date.now();

        // Ensure DOM parser is initialized
        if (!this.domParser) {
          await this.initializeDOMParser();
        }

        // Create or update document with CSS
        let document: any;
        if (payload.html) {
          document = this.domParser.parseFromString(payload.html, "text/html");
        } else {
          document = this.domParser.parseFromString('<html><body></body></html>', "text/html");
        }

        // Inject CSS
        const styleElement = document.createElement('style');
        styleElement.textContent = payload.css;
        document.head.appendChild(styleElement);

        const executionTime = Date.now() - startTime;

        return {
          success: true,
          html: document.body?.innerHTML || '',
          css: payload.css,
          logs: [`Injected CSS: ${payload.css.length} characters`],
          executionTime
        };

      } catch (error) {
        throw new ValidationError('dom.inject_css', 'unknown', 'execution', `CSS injection failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleInjectJs(payload: DOMExecutionRequest, isolateId: string): Promise<DOMResponse> {
    return await this.monitorExecution('dom.inject_js', 'js_injection', async () => {
      if (!payload.javascript) {
        throw new ValidationError('dom.inject_js', isolateId, 'javascript', 'JavaScript content is required');
      }

      if (payload.javascript.length > this.maxJsSize) {
        throw new ValidationError('dom.inject_js', isolateId, 'jsSize', `JavaScript too large: ${payload.javascript.length} > ${this.maxJsSize}`);
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(isolateId);
      if (!permissions?.capabilities.dom?.enabled) {
        throw new ValidationError('dom.inject_js', isolateId, 'permissions', 'DOM access not permitted');
      }

      try {
        const startTime = Date.now();
        const logs: string[] = [];

        // Ensure DOM parser is initialized
        if (!this.domParser) {
          await this.initializeDOMParser();
        }

        // Create document context
        let document: any;
        if (payload.html) {
          document = this.domParser.parseFromString(payload.html, "text/html");
        } else {
          document = this.domParser.parseFromString('<html><body></body></html>', "text/html");
        }

        // Execute JavaScript
        const result = await this.executeJavaScriptInContext(payload.javascript, document, logs);

        const executionTime = Date.now() - startTime;

        return {
          success: true,
          html: document.body?.innerHTML || '',
          javascript: payload.javascript,
          logs,
          executionTime
        };

      } catch (error) {
        throw new ValidationError('dom.inject_js', 'unknown', 'execution', `JavaScript injection failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async executeJavaScriptInContext(javascript: string, document: any, logs: string[]): Promise<any> {
    try {
      // Create a safe execution context
      const context = {
        document,
        window: {
          document,
          console: {
            log: (...args: any[]) => {
              const message = args.join(' ');
              logs.push(`LOG: ${message}`);
              console.log(`[DOM JS] ${message}`);
            },
            error: (...args: any[]) => {
              const message = args.join(' ');
              logs.push(`ERROR: ${message}`);
              console.error(`[DOM JS] ${message}`);
            },
            warn: (...args: any[]) => {
              const message = args.join(' ');
              logs.push(`WARN: ${message}`);
              console.warn(`[DOM JS] ${message}`);
            }
          }
        },
        globalThis: globalThis,
        // Add other global objects as needed
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval
      };

      // Create the function with context
      const userFunction = new Function(...Object.keys(context), javascript);

      // Execute with timeout
      const executionPromise = userFunction(...Object.values(context));

      // Add timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('JavaScript execution timeout')), this.executionTimeout);
      });

      const result = await Promise.race([executionPromise, timeoutPromise]);

      logs.push('JavaScript execution completed successfully');
      return result;

    } catch (error) {
      logs.push(`JavaScript execution error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  // Get DOM handler statistics
  getDOMStats() {
    return {
      domParserInitialized: !!this.domParser,
      maxHtmlSize: this.maxHtmlSize,
      maxCssSize: this.maxCssSize,
      maxJsSize: this.maxJsSize,
      executionTimeout: this.executionTimeout,
      supportedOperations: ['parse', 'execute', 'update', 'inject_css', 'inject_js']
    };
  }
}
