// Test script for Isolate Orchestrator Proxy
// This demonstrates the enhanced capabilities now available to content blocks

console.log('🧪 Testing Isolate Orchestrator Proxy System');
console.log('=' .repeat(50));

// Test 1: File System Operations
console.log('\n📁 Testing File System Operations...');

async function testFileOperations() {
  try {
    // Create a test file
    const testContent = 'Hello from the orchestrator proxy system!';
    const result = await symposium.writeFile('test/hello.txt', testContent);
    console.log('✅ File written:', result);

    // Read the file back
    const readResult = await symposium.readFile('test/hello.txt');
    console.log('✅ File read:', readResult.data);

    // List directory contents
    const listResult = await symposium.listDirectory('test');
    console.log('✅ Directory listed:', listResult.data?.length || 0, 'items');

    // Get file info
    const infoResult = await symposium.getFileInfo('test/hello.txt');
    console.log('✅ File info retrieved:', infoResult.size, 'bytes');

    // Check if file exists
    const existsResult = await symposium.fileExists('test/hello.txt');
    console.log('✅ File exists check:', existsResult.data);

    // Clean up
    const deleteResult = await symposium.deleteFile('test/hello.txt');
    console.log('✅ File deleted:', deleteResult.success);

  } catch (error) {
    console.error('❌ File system test failed:', error.message);
  }
}

// Test 2: Network Operations
console.log('\n🌐 Testing Network Operations...');

async function testNetworkOperations() {
  try {
    // Test enhanced fetch with custom headers
    const fetchResult = await symposium.network.fetch('https://httpbin.org/get', {
      method: 'GET',
      headers: {
        'X-Test-Header': 'orchestrator-proxy-test'
      }
    });
    console.log('✅ Enhanced fetch successful');

    // Test webhook sending (mock endpoint)
    const webhookResult = await symposium.network.sendWebhook('https://httpbin.org/post', {
      event: 'test',
      data: { message: 'Hello from orchestrator!' }
    });
    console.log('✅ Webhook sent:', webhookResult);

  } catch (error) {
    console.error('❌ Network test failed:', error.message);
  }
}

// Test 3: Canvas Operations
console.log('\n🎨 Testing Canvas Operations...');

async function testCanvasOperations() {
  try {
    // Create a canvas
    const canvasResult = await symposium.canvas.createCanvas(800, 600);
    console.log('✅ Canvas created:', canvasResult);

    // Execute drawing operations
    const drawResult = await symposium.canvas.draw('canvas-1', [
      { type: 'fillRect', x: 10, y: 10, width: 100, height: 100 },
      { type: 'fillText', text: 'Hello Canvas!', x: 20, y: 30 }
    ]);
    console.log('✅ Canvas drawing completed');

    // Export as image
    const exportResult = await symposium.canvas.exportImage('canvas-1', 'png');
    console.log('✅ Canvas exported as image');

  } catch (error) {
    console.error('❌ Canvas test failed:', error.message);
  }
}

// Test 4: Database Operations
console.log('\n🗄️ Testing Database Operations...');

async function testDatabaseOperations() {
  try {
    // Get database info
    const infoResult = await symposium.database.getInfo();
    console.log('✅ Database info retrieved:', infoResult.data);

    // Create test table
    const createResult = await symposium.database.query(`
      CREATE TABLE IF NOT EXISTS test_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        created_at INTEGER NOT NULL
      )
    `);
    console.log('✅ Test table created');

    // Insert test data
    const insertResult = await symposium.database.query(
      'INSERT INTO test_tasks (title, completed, created_at) VALUES (?, ?, ?)',
      ['Test Task', false, Date.now()]
    );
    console.log('✅ Test data inserted:', insertResult);

    // Query the data back
    const selectResult = await symposium.database.query(
      'SELECT * FROM test_tasks WHERE completed = ?',
      [false]
    );
    console.log('✅ Data queried successfully:', selectResult.data.rows.length, 'rows');

    // Update the data
    const updateResult = await symposium.database.query(
      'UPDATE test_tasks SET completed = ? WHERE title = ?',
      [true, 'Test Task']
    );
    console.log('✅ Data updated:', updateResult);

    // Execute transaction
    const transactionResult = await symposium.database.transaction([
      {
        query: 'INSERT INTO test_tasks (title, completed, created_at) VALUES (?, ?, ?)',
        params: ['Transaction Task 1', false, Date.now()]
      },
      {
        query: 'INSERT INTO test_tasks (title, completed, created_at) VALUES (?, ?, ?)',
        params: ['Transaction Task 2', false, Date.now()]
      }
    ]);
    console.log('✅ Transaction completed:', transactionResult);

    // Clean up - delete test data
    const deleteResult = await symposium.database.query(
      'DELETE FROM test_tasks WHERE title LIKE ?',
      ['%Test%']
    );
    console.log('✅ Test data cleaned up:', deleteResult);

  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  }
}

// Test 5: Process Execution
console.log('\n⚙️ Testing Process Execution...');

async function testProcessOperations() {
  try {
    // Execute a system command
    const processResult = await symposium.process.execute('echo', ['Hello from orchestrator!']);
    console.log('✅ Process executed:', processResult);

  } catch (error) {
    console.error('❌ Process test failed:', error.message);
  }
}

// Test 6: Utility Functions
console.log('\n🛠️ Testing Utility Functions...');

function testUtilities() {
  try {
    // Generate temporary path
    const tempPath = symposium.utils.generateTempPath('.txt');
    console.log('✅ Temporary path generated:', tempPath);

    // Get timestamp
    const timestamp = symposium.utils.getTimestamp();
    console.log('✅ Timestamp retrieved:', timestamp);

    // Generate unique ID
    const uniqueId = symposium.utils.generateId();
    console.log('✅ Unique ID generated:', uniqueId);

  } catch (error) {
    console.error('❌ Utilities test failed:', error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting comprehensive orchestrator tests...\n');

  await testFileOperations();
  await testNetworkOperations();
  await testCanvasOperations();
  await testDatabaseOperations();
  await testProcessOperations();
  testUtilities();

  console.log('\n' + '=' .repeat(50));
  console.log('✅ All orchestrator tests completed!');
  console.log('🎉 Content blocks now have access to powerful server-side capabilities!');
  console.log('');
  console.log('Available APIs:');
  console.log('  • symposium.fileSystem (file operations)');
  console.log('  • symposium.network (enhanced HTTP)');
  console.log('  • symposium.canvas (graphics rendering)');
  console.log('  • symposium.database (data persistence)');
  console.log('  • symposium.process (system commands)');
  console.log('  • symposium.utils (helper functions)');
}

// Export for use in content blocks
if (typeof globalThis !== 'undefined') {
  globalThis.testOrchestrator = runAllTests;
}

// Auto-run if this is the main module
if (typeof Deno !== 'undefined' && Deno.mainModule === import.meta.url) {
  runAllTests();
}

export { runAllTests as testOrchestrator };
