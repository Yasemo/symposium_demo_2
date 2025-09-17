// Process Handler for Isolate Orchestrator Proxy
// Provides secure system command execution to isolates

import { OrchestratorMessage } from '../message-broker.ts';
import { BaseCapabilityHandler, ValidationError } from '../proxy-base.ts';

interface ProcessExecutionRequest {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  input?: string | Uint8Array;
}

interface ProcessResponse {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  executionTime?: number;
  error?: string;
}

export class ProcessHandler extends BaseCapabilityHandler {
  private defaultTimeout = 30000; // 30 seconds
  private maxOutputSize = 10 * 1024 * 1024; // 10MB max output
  private maxInputSize = 1 * 1024 * 1024; // 1MB max input
  private allowedCommands = new Set([
    'echo', 'cat', 'ls', 'pwd', 'date', 'whoami',
    'head', 'tail', 'grep', 'wc', 'sort', 'uniq',
    'curl', 'wget', 'ping', 'nslookup', 'dig'
  ]);

  async executeCapability(message: OrchestratorMessage): Promise<any> {
    const { operation, payload } = message;

    switch (operation) {
      case 'process.execute':
      case 'process.run':
        return await this.handleExecute(payload);
      case 'process.getInfo':
        return await this.handleGetInfo(payload);
      default:
        throw new ValidationError(operation, message.isolateId, 'operation', `Unknown process operation: ${operation}`);
    }
  }

  private async handleExecute(payload: ProcessExecutionRequest): Promise<ProcessResponse> {
    return await this.monitorExecution('process.execute', payload.command, async () => {
      // Validate request
      if (!payload.command) {
        throw new ValidationError('process.execute', 'unknown', 'command', 'Command is required');
      }

      // Get isolate permissions
      const permissions = this.getIsolatePermissions('process');
      if (!permissions?.capabilities.process.enabled) {
        throw new ValidationError('process.execute', 'unknown', 'permissions', 'Process execution not permitted');
      }

      // Validate command
      if (!this.validateCommand(payload.command, permissions)) {
        throw new ValidationError('process.execute', 'unknown', 'command', `Command not permitted: ${payload.command}`);
      }

      // Validate arguments
      if (payload.args) {
        for (const arg of payload.args) {
          if (!this.validateArgument(arg)) {
            throw new ValidationError('process.execute', 'unknown', 'args', `Invalid argument: ${arg}`);
          }
        }
      }

      // Validate input size
      if (payload.input) {
        const inputSize = typeof payload.input === 'string' ? payload.input.length : payload.input.length;
        if (inputSize > this.maxInputSize) {
          throw new ValidationError('process.execute', 'unknown', 'inputSize', `Input too large: ${inputSize} > ${this.maxInputSize}`);
        }
      }

      // Check rate limits
      if (!this.checkRateLimit('process', 'execute')) {
        throw new ValidationError('process.execute', 'unknown', 'rateLimit', 'Process execution rate limit exceeded');
      }

      try {
        const startTime = Date.now();

        // Execute process with timeout
        const result = await this.executeProcessWithTimeout(
          payload,
          payload.timeout || permissions.capabilities.process.maxExecutionTime * 1000
        );

        const executionTime = Date.now() - startTime;

        // Validate output sizes
        const totalOutputSize = (result.stdout?.length || 0) + (result.stderr?.length || 0);
        if (totalOutputSize > permissions.capabilities.process.maxOutputSize) {
          throw new ValidationError('process.execute', 'unknown', 'outputSize', `Output too large: ${totalOutputSize} > ${permissions.capabilities.process.maxOutputSize}`);
        }

        return {
          success: result.exitCode === 0,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          executionTime
        };

      } catch (error) {
        throw new ValidationError('process.execute', 'unknown', 'execution', `Process execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleGetInfo(payload: any): Promise<ProcessResponse> {
    return await this.monitorExecution('process.getInfo', 'info', async () => {
      // Get isolate permissions
      const permissions = this.getIsolatePermissions('process');
      if (!permissions?.capabilities.process.enabled) {
        throw new ValidationError('process.getInfo', 'unknown', 'permissions', 'Process execution not permitted');
      }

      return {
        success: true,
        stdout: JSON.stringify({
          allowedCommands: permissions.capabilities.process.allowedCommands,
          maxExecutionTime: permissions.capabilities.process.maxExecutionTime,
          maxOutputSize: permissions.capabilities.process.maxOutputSize,
          defaultTimeout: this.defaultTimeout
        }, null, 2)
      };
    });
  }

  // Process execution with timeout
  private async executeProcessWithTimeout(
    payload: ProcessExecutionRequest,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    // This is a mock implementation - in a real system, you would:
    // 1. Use Deno.Command or Deno.run to execute the process
    // 2. Handle stdin/stdout/stderr streams
    // 3. Set proper working directory and environment
    // 4. Implement timeout handling

    console.log(`Executing command: ${payload.command} ${payload.args?.join(' ') || ''}`);
    console.log(`Working directory: ${payload.cwd || 'default'}`);
    console.log(`Timeout: ${timeout}ms`);

    // Mock command execution based on command type
    const command = payload.command.toLowerCase();
    let mockResult: { stdout: string; stderr: string; exitCode: number };

    switch (command) {
      case 'echo':
        mockResult = {
          stdout: payload.args?.join(' ') || '',
          stderr: '',
          exitCode: 0
        };
        break;

      case 'date':
        mockResult = {
          stdout: new Date().toISOString(),
          stderr: '',
          exitCode: 0
        };
        break;

      case 'pwd':
        mockResult = {
          stdout: '/mock/working/directory',
          stderr: '',
          exitCode: 0
        };
        break;

      case 'whoami':
        mockResult = {
          stdout: 'mock-user',
          stderr: '',
          exitCode: 0
        };
        break;

      case 'ls':
        mockResult = {
          stdout: 'file1.txt\nfile2.js\ndirectory1/',
          stderr: '',
          exitCode: 0
        };
        break;

      case 'cat':
        if (payload.args && payload.args[0]) {
          mockResult = {
            stdout: `Mock content of file: ${payload.args[0]}`,
            stderr: '',
            exitCode: 0
          };
        } else {
          mockResult = {
            stdout: '',
            stderr: 'cat: missing file operand',
            exitCode: 1
          };
        }
        break;

      case 'ping':
        mockResult = {
          stdout: 'PING mock-host (127.0.0.1): 56 data bytes\n64 bytes from 127.0.0.1: icmp_seq=0 ttl=64 time=0.1 ms',
          stderr: '',
          exitCode: 0
        };
        break;

      case 'curl':
      case 'wget':
        mockResult = {
          stdout: 'Mock HTTP response data',
          stderr: '',
          exitCode: 0
        };
        break;

      default:
        mockResult = {
          stdout: '',
          stderr: `Command not found: ${payload.command}`,
          exitCode: 127
        };
    }

    // Simulate execution time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));

    return mockResult;
  }

  // Command validation
  private validateCommand(command: string, permissions: any): boolean {
    const allowedCommands = permissions.capabilities.process.allowedCommands;

    if (allowedCommands.includes('*')) {
      return true; // Allow all commands
    }

    // Check if command is in allowed list
    if (allowedCommands.includes(command)) {
      return true;
    }

    // Check for command with path
    const baseCommand = command.split('/').pop()?.split('\\').pop();
    if (baseCommand && allowedCommands.includes(baseCommand)) {
      return true;
    }

    return false;
  }

  // Argument validation
  private validateArgument(arg: string): boolean {
    // Prevent dangerous arguments
    const dangerousPatterns = [
      /\.\./, // Directory traversal
      /\|/,   // Pipe operations
      /;/,    // Command chaining
      /&&/,   // Logical AND
      /\|\|/, // Logical OR
      /`/,    // Command substitution
      /\$\(/, // Command substitution
      />/,    // Output redirection
      /</,    // Input redirection
      /2>/,   // Error redirection
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(arg)) {
        return false;
      }
    }

    // Check argument length
    if (arg.length > 1000) {
      return false;
    }

    return true;
  }

  // Rate limiting for process operations
  private checkRateLimit(operation: string, type: string): boolean {
    // This would integrate with the permission manager's rate limiting
    // For now, return true (allow)
    return true;
  }

  // Get process statistics
  getProcessStats() {
    return {
      defaultTimeout: this.defaultTimeout,
      maxOutputSize: this.maxOutputSize,
      maxInputSize: this.maxInputSize,
      allowedCommands: Array.from(this.allowedCommands),
      supportedOperations: ['execute', 'run']
    };
  }
}
