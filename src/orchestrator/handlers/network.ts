// Network Handler for Isolate Orchestrator Proxy
// Provides enhanced network capabilities to isolates

import { OrchestratorMessage } from '../message-broker.ts';
import { BaseCapabilityHandler, ValidationError } from '../proxy-base.ts';

interface FetchRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  timeout?: number;
}

interface WebhookRequest {
  url: string;
  payload: any;
  method?: string;
  headers?: Record<string, string>;
}

interface NetworkResponse {
  success: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: any;
  error?: string;
  responseTime?: number;
}

export class NetworkHandler extends BaseCapabilityHandler {
  private defaultTimeout = 30000; // 30 seconds
  private maxResponseSize = 10 * 1024 * 1024; // 10MB

  async executeCapability(message: OrchestratorMessage): Promise<any> {
    const { operation, payload } = message;

    switch (operation) {
      case 'network.request':
      case 'network.fetch':
        return await this.handleFetch(payload);
      case 'network.webhook':
        return await this.handleWebhook(payload);
      default:
        throw new ValidationError(operation, message.isolateId, 'operation', `Unknown network operation: ${operation}`);
    }
  }

  private async handleFetch(payload: FetchRequest): Promise<NetworkResponse> {
    return await this.monitorExecution('network.fetch', payload.url, async () => {
      // Validate request
      if (!payload.url) {
        throw new ValidationError('network.fetch', 'unknown', 'url', 'URL is required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(payload.url);
      if (!permissions?.capabilities.network.enabled) {
        throw new ValidationError('network.fetch', 'unknown', 'permissions', 'Network access not permitted');
      }

      // Validate URL
      if (!this.validateUrl(payload.url, permissions.capabilities.network.allowedDomains)) {
        throw new ValidationError('network.fetch', 'unknown', 'url', 'URL not in allowed domains');
      }

      // Check rate limits
      const rateLimitKey = `network_${payload.method || 'GET'}`;
      if (!this.checkRateLimit(payload.url, rateLimitKey)) {
        throw new ValidationError('network.fetch', 'unknown', 'rateLimit', 'Network request rate limit exceeded');
      }

      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: payload.method || 'GET',
        headers: {
          'User-Agent': 'Symposium-Orchestrator/1.0',
          ...payload.headers
        }
      };

      // Add body if provided
      if (payload.body) {
        if (typeof payload.body === 'string') {
          fetchOptions.body = payload.body;
        } else if (payload.body instanceof Uint8Array) {
          fetchOptions.body = payload.body;
        }
      }

      // Set timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), payload.timeout || this.defaultTimeout);
      fetchOptions.signal = controller.signal;

      try {
        const startTime = Date.now();

        // Execute the fetch request
        const response = await fetch(payload.url, fetchOptions);
        const responseTime = Date.now() - startTime;

        clearTimeout(timeoutId);

        // Check response size
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > this.maxResponseSize) {
          throw new ValidationError('network.fetch', 'unknown', 'responseSize', `Response too large: ${contentLength} > ${this.maxResponseSize}`);
        }

        // Get response headers
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        // Get response data
        let data: any;
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          data = await response.json();
        } else if (contentType.includes('text/')) {
          data = await response.text();
        } else {
          // For binary data, return as Uint8Array
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > this.maxResponseSize) {
            throw new ValidationError('network.fetch', 'unknown', 'responseSize', `Binary response too large: ${buffer.byteLength} > ${this.maxResponseSize}`);
          }
          data = new Uint8Array(buffer);
        }

        return {
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers,
          data,
          responseTime
        };

      } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          throw new ValidationError('network.fetch', 'unknown', 'timeout', 'Request timeout');
        }

        throw new ValidationError('network.fetch', 'unknown', 'network', `Network error: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleWebhook(payload: WebhookRequest): Promise<NetworkResponse> {
    return await this.monitorExecution('network.webhook', payload.url, async () => {
      // Validate request
      if (!payload.url) {
        throw new ValidationError('network.webhook', 'unknown', 'url', 'Webhook URL is required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions(payload.url);
      if (!permissions?.capabilities.network.enabled || !permissions.capabilities.network.allowWebhooks) {
        throw new ValidationError('network.webhook', 'unknown', 'permissions', 'Webhook sending not permitted');
      }

      // Validate URL
      if (!this.validateUrl(payload.url, permissions.capabilities.network.allowedDomains)) {
        throw new ValidationError('network.webhook', 'unknown', 'url', 'Webhook URL not in allowed domains');
      }

      // Check rate limits
      if (!this.checkRateLimit(payload.url, 'webhook')) {
        throw new ValidationError('network.webhook', 'unknown', 'rateLimit', 'Webhook rate limit exceeded');
      }

      // Prepare webhook payload
      const webhookData = JSON.stringify(payload.payload);
      if (webhookData.length > this.maxResponseSize) {
        throw new ValidationError('network.webhook', 'unknown', 'payloadSize', `Webhook payload too large: ${webhookData.length} > ${this.maxResponseSize}`);
      }

      // Prepare fetch options for webhook
      const fetchOptions: RequestInit = {
        method: payload.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Symposium-Orchestrator-Webhook/1.0',
          ...payload.headers
        },
        body: webhookData
      };

      // Set timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);
      fetchOptions.signal = controller.signal;

      try {
        const startTime = Date.now();

        // Send the webhook
        const response = await fetch(payload.url, fetchOptions);
        const responseTime = Date.now() - startTime;

        clearTimeout(timeoutId);

        // Get response data
        let responseData: any;
        try {
          responseData = await response.text();
          // Try to parse as JSON
          try {
            responseData = JSON.parse(responseData);
          } catch (parseError) {
            // Keep as string if not valid JSON
          }
        } catch (readError) {
          responseData = null;
        }

        return {
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          data: responseData,
          responseTime
        };

      } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          throw new ValidationError('network.webhook', 'unknown', 'timeout', 'Webhook timeout');
        }

        throw new ValidationError('network.webhook', 'unknown', 'network', `Webhook error: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  // Check rate limits for network operations
  private checkRateLimit(url: string, operation: string): boolean {
    // Extract domain for rate limiting
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      const rateLimitKey = `network_${domain}_${operation}`;

      // Use the permission manager's rate limiting
      // This would be implemented in the permission manager
      return true; // Placeholder - actual implementation in permission manager

    } catch (error) {
      console.warn('Failed to parse URL for rate limiting:', url);
      return false;
    }
  }

  // Get network statistics
  getNetworkStats() {
    return {
      defaultTimeout: this.defaultTimeout,
      maxResponseSize: this.maxResponseSize,
      supportedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      supportedHeaders: ['Content-Type', 'Authorization', 'User-Agent', 'Accept', 'Accept-Language']
    };
  }
}
