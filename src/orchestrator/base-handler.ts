// Base Handler Classes for Isolate Orchestrator
// Contains common handler functionality to avoid circular dependencies

import { MessageBroker, OrchestratorMessage } from './message-broker.ts';

// Handler interface for capability operations
export interface MessageHandler {
  handleRequest(message: OrchestratorMessage): Promise<any>;
}

// Base handler class with common functionality
export abstract class BaseMessageHandler implements MessageHandler {
  protected broker: MessageBroker;

  constructor(broker: MessageBroker) {
    this.broker = broker;
  }

  abstract handleRequest(message: OrchestratorMessage): Promise<any>;

  // Common validation methods
  protected validateIsolateId(isolateId: string): boolean {
    return typeof isolateId === 'string' && isolateId.length > 0;
  }

  protected validatePayload(payload: any): boolean {
    return payload !== null && payload !== undefined;
  }

  // Common error handling
  protected createError(message: string, details?: any): Error {
    const error = new Error(message);
    if (details) {
      (error as any).details = details;
    }
    return error;
  }
}
