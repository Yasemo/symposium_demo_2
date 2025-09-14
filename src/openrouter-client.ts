// OpenRouter API Client for Symposium Demo

interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt: string | number;
    completion: string | number;
  };
  per_request?: number;
  per_hour?: number;
}

export class OpenRouterClient {
  private config: OpenRouterConfig;
  private baseUrl: string;
  private modelsCache: OpenRouterModel[] | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
  private readonly MODEL_STORAGE_KEY = 'symposium_selected_model';

  // System prompts for different interaction modes
  private readonly PLAN_MODE_PROMPT = `
You are a helpful AI assistant for Symposium Demo, an innovative platform for creating and running interactive content blocks in secure Deno isolates.

## Your Role in Plan Mode:
- Help users plan, design, and conceptualize content blocks
- Explain technical concepts and best practices
- Suggest creative ideas and approaches
- Guide users through the development process
- Answer questions about the platform and its capabilities
- Only generate actual code when specifically requested

## Symposium Demo Platform Overview:
- **Secure Execution**: All content blocks run in isolated Deno Web Workers
- **Persistent Storage**: Data survives page reloads via demoAPI
- **Modern Web Standards**: Full support for contemporary HTML/CSS/JavaScript
- **Security-First**: Comprehensive isolation and resource controls

## Available Features:
- Interactive content blocks with HTML/CSS/JavaScript
- Persistent data storage with automatic state management
- URL-based imports for popular libraries (ESM.sh, Skypack, etc.)
- Real-time collaboration and content sharing
- Version control and undo/redo functionality

## Interaction Guidelines:
- Be conversational and helpful
- Ask clarifying questions when needed
- Suggest multiple approaches when appropriate
- Explain technical concepts clearly
- Encourage best practices and modern development patterns

When users ask about creating content, guide them toward using the Create Mode for actual code generation.
`;

  private readonly CREATE_MODE_PROMPT = `
You are a code generation specialist for Symposium Demo, creating interactive content blocks that run in secure Deno isolates.

## Execution Environment:
- **Runtime**: Complete HTML documents executed in isolated Deno Web Workers
- **DOM**: Full browser-compatible DOM API with deno-dom
- **Security**: Isolated execution with resource limits (128MB memory, 30s timeout)
- **APIs**: Controlled access to browser APIs and persistent storage

## Available Browser APIs:
\`\`\`javascript
// Storage APIs
localStorage.setItem('key', 'value');
sessionStorage.setItem('key', 'value');
const data = localStorage.getItem('key');

// Enhanced DOM methods
document.querySelector('.selector');
document.querySelectorAll('.selectors');
document.getElementsByClassName('class');
document.getElementsByTagName('tag');
document.getElementById('id');

// Console logging
console.log('Debug message');
console.error('Error message');
\`\`\`

## Data Persistence APIs (REQUIRED for stateful content):
\`\`\`javascript
// Save data persistently (survives page reloads)
await demoAPI.saveData('key', value);

// Retrieve stored data
const data = await demoAPI.getData('key');

// Delete stored data
await demoAPI.deleteData('key');
\`\`\`

## URL-Based Imports (Available):
\`\`\`javascript
// Popular libraries via ESM.sh
import React from 'https://esm.sh/react';
import Chart from 'https://esm.sh/chart.js';
import _ from 'https://esm.sh/lodash';

// Other CDNs
import lib from 'https://cdn.skypack.dev/library-name';
import lib from 'https://unpkg.com/library-name';
\`\`\`

## Requirements:
- **Complete HTML documents** with DOCTYPE, html, head, body tags
- **Embed styles** in <style> tags within <head>
- **Embed scripts** in <script> tags (preferably at end of <body>)
- **Use demoAPI** for all data persistence
- **Responsive design** with modern CSS
- **Error handling** with try/catch blocks
- **Semantic HTML** and accessible markup

## Response Format:
Generate content blocks as JSON:
{
  "html": "<!DOCTYPE html><html><head>...</head><body>...</body></html>",
  "explanation": "Clear description of functionality and features"
}

## Best Practices:
- ALWAYS use demoAPI for persistent data storage
- Include loading states and error handling
- Provide sensible defaults for missing data
- Use modern CSS with flexbox/grid for layouts
- Test edge cases and provide fallbacks
- Comment complex logic and async operations
- Make content responsive and mobile-friendly
`;

  private readonly EDIT_MODE_PROMPT = (currentCode: any, blockId: string, persistentData?: any) => `
You are modifying an existing content block in Symposium Demo.

## Current Content Block:
**Block ID**: ${blockId}
**HTML**: ${currentCode.html || 'None'}
**CSS**: ${currentCode.css || 'None'}
**JavaScript**: ${currentCode.javascript || 'None'}

## Persistent Data Context:
${persistentData ? Object.entries(persistentData).map(([key, value]) =>
  `- ${key}: ${JSON.stringify(value)}`
).join('\n') : 'No persistent data'}

## Modification Guidelines:
- Preserve existing functionality and structure
- Make targeted, surgical changes only
- Consider the block's persistent data when modifying
- Maintain compatibility with Deno isolate environment
- Keep the same code quality standards

## Available APIs (same as Create Mode):
- demoAPI for data persistence
- localStorage/sessionStorage for temporary storage
- Enhanced DOM methods
- URL imports for libraries

## Response Format:
Return modified content as JSON:
{
  "html": "<modified HTML>",
  "css": "<modified CSS>",
  "javascript": "<modified JavaScript>",
  "explanation": "Description of changes made"
}

Focus on the specific user request while maintaining the block's core functionality.
`;

  constructor(config: OpenRouterConfig) {
    this.config = {
      defaultModel: 'openai/gpt-4o-mini',
      baseUrl: 'https://openrouter.ai/api/v1',
      ...config
    };
    this.baseUrl = this.config.baseUrl!;

    // Load saved model on initialization
    this.loadSavedModel();
  }

  // Load saved model from persistent storage
  private async loadSavedModel(): Promise<void> {
    try {
      // Try to load from Deno KV first (server-side)
      if (typeof Deno !== 'undefined' && Deno.openKv) {
        const kv = await Deno.openKv();
        const savedModel = await kv.get([this.MODEL_STORAGE_KEY]);

        if (savedModel.value && typeof savedModel.value === 'string') {
          this.config.defaultModel = savedModel.value;
          console.log(`Loaded saved model from KV: ${savedModel.value}`);
          return;
        }
      }

      // Fallback: try to load from environment or localStorage (client-side)
      if (typeof localStorage !== 'undefined') {
        const savedModel = localStorage.getItem(this.MODEL_STORAGE_KEY);
        if (savedModel) {
          this.config.defaultModel = savedModel;
          console.log(`Loaded saved model from localStorage: ${savedModel}`);
          return;
        }
      }

      console.log(`Using default model: ${this.config.defaultModel}`);
    } catch (error) {
      console.warn('Failed to load saved model:', error);
    }
  }

  // Save selected model to persistent storage
  private async saveModelToStorage(model: string): Promise<void> {
    try {
      // Try to save to Deno KV first (server-side)
      if (typeof Deno !== 'undefined' && Deno.openKv) {
        const kv = await Deno.openKv();
        await kv.set([this.MODEL_STORAGE_KEY], model);
        console.log(`Saved model to KV: ${model}`);
        return;
      }

      // Fallback: save to localStorage (client-side)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.MODEL_STORAGE_KEY, model);
        console.log(`Saved model to localStorage: ${model}`);
      }
    } catch (error) {
      console.warn('Failed to save model:', error);
    }
  }

  async generateContent(prompt: string, context?: string[], model?: string): Promise<string> {
    try {
      const messages: OpenRouterMessage[] = [];

      // Add context messages if provided
      if (context && context.length > 0) {
        context.forEach(ctx => {
          messages.push({
            role: 'user',
            content: ctx
          });
        });
      }

      // Add the main prompt
      messages.push({
        role: 'user',
        content: prompt
      });

      const request: OpenRouterRequest = {
        model: model || this.config.defaultModel!,
        messages,
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 16384
      };

      const response = await this.makeRequest('/chat/completions', request);

      if (response.choices && response.choices.length > 0) {
        return response.choices[0].message.content;
      }

      throw new Error('No content generated');
    } catch (error) {
      console.error('OpenRouter API error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate content: ${errorMessage}`);
    }
  }

  // Generate content block for Create Mode
  async generateContentBlock(
    prompt: string,
    model?: string,
    isEditing?: boolean,
    currentCode?: any,
    blockId?: string,
    persistentData?: any
  ): Promise<{
    html: string;
    css: string;
    javascript: string;
    explanation: string;
  }> {
    let systemPrompt: string;

    if (isEditing && currentCode && blockId) {
      // Edit Mode: Modify existing content block
      systemPrompt = this.EDIT_MODE_PROMPT(currentCode, blockId, persistentData);
    } else {
      // Create Mode: Generate new content block
      systemPrompt = this.CREATE_MODE_PROMPT;
    }

    // Add the user request
    systemPrompt += `\n\nUser request: ${prompt}`;

    try {
      const response = await this.generateContent(systemPrompt, undefined, model);
      console.log('OpenRouter raw response:', response);

      let parsed: any = null;

      // Try to extract JSON from response
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch (jsonError) {
          console.log('JSON block parsing failed, trying to fix truncated response');
          parsed = this.attemptToFixTruncatedJSON(jsonMatch[1].trim());
        }
      }

      // If no JSON block found, try to parse entire response as JSON
      if (!parsed) {
        try {
          parsed = JSON.parse(response);
        } catch (jsonError) {
          console.log('Direct JSON parsing failed, trying to fix truncated response');
          parsed = this.attemptToFixTruncatedJSON(response);
        }
      }

      // Validate and return parsed response
      if (parsed && this.isValidContentBlockResponse(parsed)) {
        // Ensure JavaScript is complete and valid
        parsed.javascript = this.ensureCompleteJavaScript(parsed.javascript);
        return parsed;
      }

      // Fallback parsing
      console.log('All JSON parsing failed, using fallback parser');
      return this.parseFallbackResponse(response);
    } catch (error) {
      console.error('Failed to parse OpenRouter response:', error);
      return {
        html: `<div style="padding: 20px; text-align: center; background: #f0f8ff; border-radius: 8px;">
          <h3>Content Block</h3>
          <p>Generated content for: ${prompt}</p>
          <p style="color: #666; font-size: 0.9em;">(Note: AI generation failed, showing fallback content)</p>
        </div>`,
        css: '',
        javascript: '',
        explanation: `Fallback content block for: ${prompt}`
      };
    }
  }

  // Attempt to fix truncated JSON responses
  private attemptToFixTruncatedJSON(jsonString: string): any {
    try {
      let fixedJson = jsonString.trim();

      // If the JSON ends abruptly (not with closing brace), assume it's truncated in the last string value
      if (!fixedJson.endsWith('}')) {
        fixedJson += '"}';
      }

      // Try to parse the fixed JSON
      const parsed = JSON.parse(fixedJson);

      // Validate that we have the required fields
      if (this.isValidContentBlockResponse(parsed)) {
        console.log('Successfully fixed truncated JSON response');
        return parsed;
      }

      return null;
    } catch (error) {
      console.log('Failed to fix truncated JSON:', error);
      return null;
    }
  }

  // Validate content block response structure
  private isValidContentBlockResponse(response: any): boolean {
    return (
      response &&
      typeof response === 'object' &&
      typeof response.html === 'string' &&
      response.html.trim().length > 0 && // HTML should not be empty
      (typeof response.css === 'string' || response.css === null || response.css === undefined) &&
      (typeof response.javascript === 'string' || response.javascript === null || response.javascript === undefined) &&
      typeof response.explanation === 'string'
    );
  }

  // Ensure JavaScript code is complete and syntactically valid
  private ensureCompleteJavaScript(jsCode: string): string {
    if (!jsCode || typeof jsCode !== 'string') {
      return '';
    }

    let code = jsCode.trim();

    // Basic syntax checks and completions
    try {
      // Check for common truncation patterns
      if (code.endsWith(',')) {
        code = code.slice(0, -1); // Remove trailing comma
      }

      if (code.endsWith('}')) {
        // Code seems complete
        return code;
      }

      // Try to add missing closing braces/brackets
      const openBraces = (code.match(/\{/g) || []).length;
      const closeBraces = (code.match(/\}/g) || []).length;
      const openParens = (code.match(/\(/g) || []).length;
      const closeParens = (code.match(/\)/g) || []).length;

      // Add missing closing braces
      if (openBraces > closeBraces) {
        code += '\n}'.repeat(openBraces - closeBraces);
      }

      // Add missing closing parentheses
      if (openParens > closeParens) {
        code += ')'.repeat(openParens - closeParens);
      }

      // If code doesn't end with semicolon and isn't a block, add one
      if (!code.endsWith(';') && !code.endsWith('}') && !code.endsWith(')')) {
        code += ';';
      }

      return code;
    } catch (error) {
      console.warn('Failed to complete JavaScript code:', error);
      return jsCode; // Return original if we can't fix it
    }
  }

  private parseFallbackResponse(response: string): {
    html: string;
    css: string;
    javascript: string;
    explanation: string;
  } {
    // Extract code blocks from markdown format
    const htmlMatch = response.match(/```html\s*([\s\S]*?)\s*```/);
    const cssMatch = response.match(/```css\s*([\s\S]*?)\s*```/);
    const jsMatch = response.match(/```javascript\s*([\s\S]*?)\s*```|```js\s*([\s\S]*?)\s*```/);

    return {
      html: htmlMatch ? htmlMatch[1].trim() : '<div>Generated content</div>',
      css: cssMatch ? cssMatch[1].trim() : '',
      javascript: jsMatch ? (jsMatch[1] || jsMatch[2]).trim() : '',
      explanation: 'Content block generated from AI response'
    };
  }

  async chat(message: string, history: Array<{role: string, content: string}> = [], model?: string): Promise<string> {
    try {
      const messages: OpenRouterMessage[] = [];

      // Add system prompt for Plan Mode
      messages.push({
        role: 'system',
        content: this.PLAN_MODE_PROMPT
      });

      // Add conversation history
      history.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });

      // Add current message
      messages.push({
        role: 'user',
        content: message
      });

      const request: OpenRouterRequest = {
        model: model || this.config.defaultModel!,
        messages,
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 1024
      };

      const response = await this.makeRequest('/chat/completions', request);

      if (response.choices && response.choices.length > 0) {
        return response.choices[0].message.content;
      }

      return "I apologize, but I couldn't generate a response at this time.";
    } catch (error) {
      console.error('Chat error:', error);
      return "Sorry, I'm having trouble responding right now. Please try again.";
    }
  }

  async getAvailableModels(): Promise<OpenRouterModel[]> {
    // Check cache first
    if (this.modelsCache && Date.now() < this.cacheExpiry) {
      return this.modelsCache;
    }

    try {
      const response = await this.makeRequest('/models');
      if (response.data) {
        this.modelsCache = response.data;
        this.cacheExpiry = Date.now() + this.CACHE_DURATION;
        return this.modelsCache;
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch models:', error);
      return [];
    }
  }

  private async makeRequest(endpoint: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };

    const requestOptions: RequestInit = {
      method: body ? 'POST' : 'GET',
      headers,
    };

    if (body) {
      requestOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  // Health check for the API
  async healthCheck(): Promise<boolean> {
    try {
      const testRequest: OpenRouterRequest = {
        model: this.config.defaultModel!,
        messages: [{
          role: 'user',
          content: 'Hello'
        }],
        max_tokens: 10
      };

      await this.makeRequest('/chat/completions', testRequest);
      return true;
    } catch (error) {
      console.error('OpenRouter health check failed:', error);
      return false;
    }
  }

  // Get current model
  getCurrentModel(): string {
    return this.config.defaultModel!;
  }

  // Set current model with persistence
  async setCurrentModel(model: string): Promise<void> {
    this.config.defaultModel = model;
    await this.saveModelToStorage(model);
    console.log(`Model changed to: ${model}`);
  }

  // Get saved model (for external access)
  async getSavedModel(): Promise<string | null> {
    try {
      // Try to load from Deno KV first (server-side)
      if (typeof Deno !== 'undefined' && Deno.openKv) {
        const kv = await Deno.openKv();
        const savedModel = await kv.get([this.MODEL_STORAGE_KEY]);
        return savedModel.value as string || null;
      }

      // Fallback: try to load from localStorage (client-side)
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(this.MODEL_STORAGE_KEY);
      }

      return null;
    } catch (error) {
      console.warn('Failed to get saved model:', error);
      return null;
    }
  }
}
