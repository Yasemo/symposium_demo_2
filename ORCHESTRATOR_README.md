# Isolate Orchestrator Proxy System

## Overview

The Isolate Orchestrator Proxy is a comprehensive system that extends Deno isolates (Web Workers) with powerful server-side capabilities while maintaining complete security isolation. This system transforms basic JavaScript execution environments into fully-capable development platforms.

## Architecture

### Core Components

1. **Message Broker** (`src/orchestrator/message-broker.ts`)
   - Handles all communication between isolates and main runtime
   - Request-response pattern with correlation IDs
   - Timeout management and error handling

2. **Permission System** (`src/orchestrator/permissions.ts`)
   - 4 permission levels: Basic, Interactive, Data, Advanced
   - Granular capability controls
   - Rate limiting and resource quotas

3. **Capability Handlers**
   - **File System** (`src/orchestrator/handlers/file-system.ts`)
   - **Network** (`src/orchestrator/handlers/network.ts`)
   - **Canvas/Graphics** (`src/orchestrator/handlers/canvas.ts`)
   - **Database** (`src/orchestrator/handlers/database.ts`)
   - **Process Execution** (`src/orchestrator/handlers/process.ts`)

4. **Proxy API** (`isolate-sandbox/proxy-api.js`)
   - Natural JavaScript APIs for isolates
   - Async/await support
   - Comprehensive error handling

## Permission Profiles

### Basic Profile
- **Network**: Limited to CDN domains (10 requests/minute)
- **Capabilities**: Read-only operations, basic fetch

### Interactive Profile
- **File System**: Read/write files (5MB limit)
- **Network**: All domains (30 requests/minute)
- **Canvas**: 1920x1080 graphics, image export
- **Memory**: 128MB, Execution: 60s

### Data Profile
- **Database**: Full SQL access (100 queries/minute)
- **File System**: Large files (50MB), data directories
- **Network**: All domains (60 requests/minute)
- **Canvas**: 4K graphics, multiple formats
- **Memory**: 256MB, Execution: 300s

### Advanced Profile
- **Process**: System command execution
- **File System**: All operations (500MB files)
- **Network**: All domains (200 requests/minute)
- **Canvas**: 8K graphics, all formats
- **Database**: Complex queries, high limits
- **Memory**: 512MB, Execution: 600s

## API Reference

### File System Operations

```javascript
// Read a file
const result = await symposium.readFile('data/config.json');
console.log(result.data);

// Write a file
await symposium.writeFile('output/result.txt', 'Hello World');

// List directory
const files = await symposium.listDirectory('uploads');
console.log(files.data);

// Get file info
const info = await symposium.getFileInfo('data/large-file.zip');
console.log(`${info.size} bytes`);

// Check if file exists
const exists = await symposium.fileExists('config/settings.json');
if (exists.data) { /* file exists */ }

// Delete a file
await symposium.deleteFile('temp/cache.tmp');
```

### Network Operations

```javascript
// Enhanced fetch with custom headers
const response = await symposium.network.fetch('https://api.example.com/data', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer token123',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ query: 'test' })
});
console.log(response.data);

// Send webhook
const webhookResult = await symposium.network.sendWebhook(
  'https://webhook.site/xyz',
  {
    event: 'user_action',
    data: { action: 'file_upload', size: 1024 }
  }
);
```

### Canvas Operations

```javascript
// Create a canvas
const canvas = await symposium.canvas.createCanvas(800, 600);
console.log(`Created canvas: ${canvas.canvasId}`);

// Draw on canvas
await symposium.canvas.draw(canvas.canvasId, [
  { type: 'fillRect', x: 10, y: 10, width: 100, height: 100, style: '#ff0000' },
  { type: 'fillText', text: 'Hello World', x: 20, y: 30, style: '#000000' },
  { type: 'beginPath' },
  { type: 'arc', x: 200, y: 200, radius: 50, startAngle: 0, endAngle: Math.PI * 2 },
  { type: 'stroke', style: '#00ff00' }
]);

// Export as image
const imageData = await symposium.canvas.exportImage(canvas.canvasId, 'png');
console.log(`Exported ${imageData.data.length} bytes of PNG data`);
```

### Database Operations

```javascript
// Execute a query
const users = await symposium.database.query(
  'SELECT * FROM users WHERE active = ?',
  [true]
);
console.log(`Found ${users.data.rows.length} active users`);

// Execute transaction
const transactionResult = await symposium.database.transaction([
  {
    query: 'INSERT INTO logs (action, user_id, timestamp) VALUES (?, ?, ?)',
    params: ['file_upload', 123, Date.now()]
  },
  {
    query: 'UPDATE users SET last_activity = ? WHERE id = ?',
    params: [Date.now(), 123]
  }
]);
console.log('Transaction completed:', transactionResult.success);
```

### Process Execution

```javascript
// Execute system command
const result = await symposium.process.execute('ls', ['-la', '/tmp'], {
  cwd: '/home/user',
  timeout: 10000
});

console.log('Exit code:', result.exitCode);
console.log('Output:', result.stdout);
if (result.stderr) {
  console.error('Errors:', result.stderr);
}

// Execute with environment variables
const envResult = await symposium.process.execute('echo', ['$HOME'], {
  env: { CUSTOM_VAR: 'value' }
});
```

### Utility Functions

```javascript
// Generate temporary file path
const tempPath = symposium.utils.generateTempPath('.json');
console.log(tempPath); // 'temp/tmp_1640995200000_abc123.json'

// Get current timestamp
const timestamp = symposium.utils.getTimestamp();
console.log(timestamp); // 1640995200000

// Generate unique ID
const uniqueId = symposium.utils.generateId();
console.log(uniqueId); // 'abc123def456'
```

## Security Features

### Input Validation
- SQL injection prevention through parameterized queries
- Path traversal attack prevention
- Command injection prevention
- File type and size restrictions

### Permission-Based Access
- Each isolate operates under a specific permission profile
- Operations are validated against permissions before execution
- Rate limiting prevents abuse
- Resource quotas prevent system overload

### Error Handling
- Comprehensive error messages without information leakage
- Graceful degradation when operations fail
- Timeout protection for long-running operations
- Resource cleanup on failures

## Usage Examples

### Content Block with File Processing

```javascript
// Content block that processes uploaded files
async function processUploadedFile(filePath) {
  try {
    // Read uploaded file
    const fileData = await symposium.readFile(filePath);

    // Process the data (e.g., parse CSV)
    const processedData = processCSV(fileData.data);

    // Save processed results
    const outputPath = `processed/${Date.now()}_results.json`;
    await symposium.writeFile(outputPath, JSON.stringify(processedData));

    // Log the operation
    await symposium.database.query(
      'INSERT INTO file_logs (file_path, processed_at, record_count) VALUES (?, ?, ?)',
      [filePath, Date.now(), processedData.length]
    );

    return { success: true, outputPath, recordCount: processedData.length };
  } catch (error) {
    console.error('File processing failed:', error.message);
    return { success: false, error: error.message };
  }
}
```

### Interactive Dashboard with Canvas

```javascript
// Content block that creates interactive charts
async function createDashboard(data) {
  // Create canvas for chart
  const canvas = await symposium.canvas.createCanvas(1200, 800);

  // Draw background
  await symposium.canvas.draw(canvas.canvasId, [
    { type: 'fillRect', x: 0, y: 0, width: 1200, height: 800, style: '#f5f5f5' }
  ]);

  // Draw data visualization
  const chartOperations = generateChartOperations(data);
  await symposium.canvas.draw(canvas.canvasId, chartOperations);

  // Export as PNG
  const imageData = await symposium.canvas.exportImage(canvas.canvasId, 'png');

  // Save to file
  const filename = `charts/dashboard_${Date.now()}.png`;
  await symposium.writeFile(filename, imageData.data);

  return { success: true, filename, size: imageData.data.length };
}
```

### Data Pipeline with External APIs

```javascript
// Content block that fetches data from external APIs and processes it
async function dataPipeline() {
  try {
    // Fetch data from external API
    const apiResponse = await symposium.network.fetch(
      'https://api.example.com/data?limit=1000',
      {
        headers: { 'Authorization': `Bearer ${process.env.API_KEY}` }
      }
    );

    const rawData = apiResponse.data;

    // Process and transform data
    const transformedData = transformData(rawData);

    // Store in database
    await symposium.database.transaction([
      { query: 'DELETE FROM raw_data WHERE source = ?', params: ['api'] },
      { query: 'INSERT INTO raw_data (source, data, processed_at) VALUES (?, ?, ?)',
        params: ['api', JSON.stringify(transformedData), Date.now()] }
    ]);

    // Send notification webhook
    await symposium.network.sendWebhook(
      process.env.WEBHOOK_URL,
      {
        event: 'data_pipeline_complete',
        recordCount: transformedData.length,
        timestamp: Date.now()
      }
    );

    return { success: true, processed: transformedData.length };
  } catch (error) {
    console.error('Data pipeline failed:', error.message);
    return { success: false, error: error.message };
  }
}
```

## Implementation Details

### Message Flow
1. Content block calls `symposium.method()`
2. Proxy API sends message to main runtime
3. Orchestrator validates permissions
4. Capability handler executes operation
5. Result returned through message broker
6. Proxy API resolves promise with result

### Error Handling
- All operations include comprehensive error handling
- Permission errors return clear messages
- Network errors include timeout information
- Database errors sanitized for security

### Performance Considerations
- Operations are monitored for execution time
- Resource usage is tracked and limited
- Large data transfers are streamed
- Connection pooling for database operations

## Testing

Run the comprehensive test suite:

```bash
# Test all capabilities
deno run test-orchestrator.js

# Or import and run in your code
import { testOrchestrator } from './test-orchestrator.js';
await testOrchestrator();
```

## Integration

The orchestrator is automatically initialized when the main server starts. Content blocks can immediately use the enhanced capabilities without any additional setup.

## Future Enhancements

- **WebSocket Support**: Real-time communication capabilities
- **Email Integration**: SMTP and email sending capabilities
- **Image Processing**: Advanced image manipulation libraries
- **Scheduled Tasks**: Cron-like job scheduling
- **External Service Integration**: AWS, Google Cloud, Azure APIs

## Security Best Practices

1. **Use Appropriate Permission Levels**: Start with Basic and upgrade only when necessary
2. **Validate All Inputs**: Never trust user-provided data
3. **Monitor Resource Usage**: Set appropriate limits for your use case
4. **Log Security Events**: Track permission violations and unusual activity
5. **Regular Updates**: Keep dependencies and handlers updated

This system provides a secure, powerful platform for executing untrusted code with access to server-side capabilities while maintaining complete isolation and security.
