// Gemini API Client for Symposium Demo

interface GeminiConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{
    text: string;
  }>;
}

interface GeminiRequest {
  contents: GeminiMessage[];
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}

export class GeminiClient {
  private config: GeminiConfig;
  private baseUrl: string;

  constructor(config: GeminiConfig) {
    this.config = {
      model: 'gemini-2.0-flash-exp',
      baseUrl: 'https://generativelanguage.googleapis.com',
      ...config
    };
    this.baseUrl = this.config.baseUrl!;
  }

  async generateContent(prompt: string, context?: string[]): Promise<string> {
    try {
      const messages: GeminiMessage[] = [];

      // Add context messages if provided
      if (context && context.length > 0) {
        context.forEach(ctx => {
          messages.push({
            role: 'user',
            parts: [{ text: ctx }]
          });
        });
      }

      // Add the main prompt
      messages.push({
        role: 'user',
        parts: [{ text: prompt }]
      });

      const request: GeminiRequest = {
        contents: messages,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048
        }
      };

      const response = await this.makeRequest(request);

      if (response.candidates && response.candidates.length > 0) {
        const content = response.candidates[0].content;
        if (content.parts && content.parts.length > 0) {
          return content.parts[0].text;
        }
      }

      throw new Error('No content generated');
    } catch (error) {
      console.error('Gemini API error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate content: ${errorMessage}`);
    }
  }

  async generateContentBlock(prompt: string): Promise<{
    html: string;
    css: string;
    javascript: string;
    explanation: string;
  }> {
    const systemPrompt = `
You are a helpful AI assistant that creates interactive HTML/CSS/JavaScript content blocks for a demo application.

## Data Persistence APIs (IMPORTANT!)
This application provides persistent data storage that survives page reloads. You MUST use these APIs for any interactive content that needs to save state:

### Available Data APIs:
\`\`\`javascript
// Save data persistently (works with strings, numbers, objects, arrays)
await demoAPI.saveData('key', value);

// Retrieve stored data (returns null if key doesn't exist)
const data = await demoAPI.getData('key');

// Delete stored data
await demoAPI.deleteData('key');
\`\`\`

### Data API Usage Examples:

#### Todo List App:
\`\`\`javascript
async function loadTodos() {
  return await demoAPI.getData('todos') || [];
}

async function saveTodos(todos) {
  await demoAPI.saveData('todos', todos);
}

async function addTodo(text) {
  const todos = await loadTodos();
  todos.push({ id: Date.now(), text, completed: false });
  await saveTodos(todos);
  renderTodos();
}

async function toggleTodo(id) {
  const todos = await loadTodos();
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    await saveTodos(todos);
    renderTodos();
  }
}
\`\`\`

#### Counter App:
\`\`\`javascript
async function loadCount() {
  return await demoAPI.getData('counter') || 0;
}

async function saveCount(count) {
  await demoAPI.saveData('counter', count);
}

async function increment() {
  const count = await loadCount();
  await saveCount(count + 1);
  updateDisplay(count + 1);
}
\`\`\`

#### Settings/Preferences:
\`\`\`javascript
async function saveSettings(settings) {
  await demoAPI.saveData('userSettings', settings);
}

async function loadSettings() {
  return await demoAPI.getData('userSettings') || {
    theme: 'light',
    notifications: true
  };
}
\`\`\`

### Data API Best Practices:
- **ALWAYS use these APIs** for any data that should persist
- Handle async operations properly with try/catch
- Provide sensible defaults when data doesn't exist
- Use meaningful key names (e.g., 'todos', 'counter', 'settings')
- Data is automatically visible in the application's data viewer

## URL-Based Imports (3rd Party Libraries):
You can import and use popular JavaScript libraries via URL imports:

### Available CDNs:
- **ESM.sh**: \`import lib from 'https://esm.sh/library-name'\`
- **Skypack**: \`import lib from 'https://cdn.skypack.dev/library-name'\`
- **UNPKG**: \`import lib from 'https://unpkg.com/library-name'\`
- **JSDelivr**: \`import lib from 'https://cdn.jsdelivr.net/npm/library-name'\`

### Popular Libraries You Can Use:
\`\`\`javascript
// React components
import React from 'https://esm.sh/react';
import { useState } from 'https://esm.sh/react';

// Chart libraries
import Chart from 'https://esm.sh/chart.js';

// Utility libraries
import _ from 'https://esm.sh/lodash';
import moment from 'https://esm.sh/moment';

// Animation libraries
import gsap from 'https://esm.sh/gsap';

// Data visualization
import * as d3 from 'https://esm.sh/d3';
\`\`\`

### Import Best Practices:
- Use imports when they significantly enhance functionality
- Prefer ESM.sh for most libraries (automatic TypeScript support)
- Include error handling for import failures
- Cache imported modules for performance
- Only import what you need (tree shaking when possible)

### Example with Imports:
\`\`\`javascript
// Import Chart.js for data visualization
import Chart from 'https://esm.sh/chart.js';

const ctx = document.createElement('canvas');
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [{
      label: 'Sales',
      data: [10, 20, 30]
    }]
  }
});

document.body.appendChild(ctx);
\`\`\`

When given a user request, generate a complete content block with:
1. HTML structure
2. CSS styling (responsive and modern)
3. JavaScript functionality that uses the data APIs for persistence
4. A brief explanation of what the content block does

Format your response as JSON with the following structure:
{
  "html": "<div>...</div>",
  "css": "/* styles */",
  "javascript": "// functionality with data persistence",
  "explanation": "Brief description of the content block"
}

Make sure the content is:
- Self-contained and functional
- Responsive and mobile-friendly
- Uses modern CSS and JavaScript features
- **USES THE DATA APIs for any persistent state**
- Includes error handling where appropriate
- Demonstrates best practices for interactive components

User request: ${prompt}
`;

    try {
      const response = await this.generateContent(systemPrompt);
      console.log('Gemini raw response:', response);

      // Try to extract JSON from markdown code blocks first
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          if (parsed.html && parsed.css !== undefined && parsed.javascript !== undefined && parsed.explanation) {
            return {
              html: parsed.html,
              css: parsed.css,
              javascript: parsed.javascript,
              explanation: parsed.explanation
            };
          }
        } catch (jsonError) {
          console.log('JSON parsing failed, trying markdown extraction');
        }
      }

      // Try to parse the entire response as JSON (in case it's not wrapped in markdown)
      try {
        const parsed = JSON.parse(response);
        if (parsed.html && parsed.css !== undefined && parsed.javascript !== undefined && parsed.explanation) {
          return {
            html: parsed.html,
            css: parsed.css,
            javascript: parsed.javascript,
            explanation: parsed.explanation
          };
        }
      } catch (jsonError) {
        console.log('Direct JSON parsing failed, trying markdown extraction');
      }

      // If JSON parsing fails, try to extract code blocks from markdown
      return this.parseMarkdownResponse(response);
    } catch (error) {
      console.error('Failed to parse Gemini response:', error);
      // Return a fallback content block
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

  private parseMarkdownResponse(response: string): {
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

  async chat(message: string, history: Array<{role: string, content: string}> = []): Promise<string> {
    try {
      const messages: GeminiMessage[] = [];

      // Add conversation history
      history.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      });

      // Add current message
      messages.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const request: GeminiRequest = {
        contents: messages,
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024
        }
      };

      const response = await this.makeRequest(request);

      if (response.candidates && response.candidates.length > 0) {
        const content = response.candidates[0].content;
        if (content.parts && content.parts.length > 0) {
          return content.parts[0].text;
        }
      }

      return "I apologize, but I couldn't generate a response at this time.";
    } catch (error) {
      console.error('Chat error:', error);
      return "Sorry, I'm having trouble responding right now. Please try again.";
    }
  }

  private async makeRequest(request: GeminiRequest): Promise<GeminiResponse> {
    const url = `${this.baseUrl}/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  // Health check for the API
  async healthCheck(): Promise<boolean> {
    try {
      const testRequest: GeminiRequest = {
        contents: [{
          role: 'user',
          parts: [{ text: 'Hello' }]
        }],
        generationConfig: {
          maxOutputTokens: 10
        }
      };

      await this.makeRequest(testRequest);
      return true;
    } catch (error) {
      console.error('Gemini health check failed:', error);
      return false;
    }
  }
}
