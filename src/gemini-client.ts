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

IMPORTANT: This application supports dynamic data through a DATA object that is automatically injected into your JavaScript code.

## Data/Variables Feature:
- A JSON data object is available as \`globalThis.DATA\` in JavaScript
- You can access data like: \`DATA.variableName\`, \`DATA.settings.theme\`, etc.
- The data is user-configurable and can be changed without modifying code
- Use this for dynamic content, configuration, and reusable components

## When to Use DATA:
- Dynamic text content: \`DATA.title\`, \`DATA.description\`
- Configuration settings: \`DATA.theme\`, \`DATA.colors\`
- Arrays and lists: \`DATA.items\`, \`DATA.options\`
- API endpoints: \`DATA.apiUrl\`, \`DATA.authToken\`
- Game settings: \`DATA.difficulty\`, \`DATA.maxScore\`

## URL-Based Imports (3rd Party Libraries):
You can now import and use popular JavaScript libraries via URL imports:

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
const chartData = DATA.chartData || { labels: [], datasets: [] };

new Chart(ctx, {
  type: 'bar',
  data: chartData,
  options: DATA.chartOptions || {}
});

document.body.appendChild(ctx);
\`\`\`

## Example Usage:
\`\`\`javascript
// Access data in JavaScript
const title = DATA.title || 'Default Title';
const colors = DATA.colors || { primary: '#007bff' };

// Use data to control behavior
if (DATA.debug) {
  console.log('Debug mode enabled');
}

// Dynamic content rendering
DATA.items?.forEach(item => {
  // render item
});
\`\`\`

When given a user request, generate a complete content block with:
1. HTML structure (can include template-like syntax)
2. CSS styling (responsive and modern)
3. JavaScript functionality (use DATA object for dynamic behavior)
4. A brief explanation of what the content block does

Format your response as JSON with the following structure:
{
  "html": "<div>...</div>",
  "css": "/* styles */",
  "javascript": "// functionality using DATA object",
  "explanation": "Brief description of the content block and how it uses data"
}

Make sure the content is:
- Self-contained and functional
- Responsive and mobile-friendly
- Uses modern CSS and JavaScript features
- Leverages the DATA object for dynamic behavior
- Includes error handling where appropriate
- Demonstrates best practices for data-driven components

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
