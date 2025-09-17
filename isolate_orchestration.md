# Isolate Orchestrator Proxy Guide

## Overview: The Orchestration Problem

You have a working demo that spins up isolates for content blocks, but you've hit the extensibility wall. Isolates can run JavaScript but can't access the full capabilities that creators need - file system operations, network requests beyond basic fetch, Canvas APIs, database connections, or any system-level operations.

The solution is to transform your main Deno runtime into an **Isolate Orchestrator** that acts as a proxy between the isolated content blocks and the capabilities they need. Think of it as creating a secure bridge where isolates can request services from the main runtime without breaking isolation boundaries.

## Core Architectural Principle

The fundamental concept is **capability delegation through message passing**:

1. **Isolates remain completely isolated** - they cannot directly access anything outside their sandbox
2. **All powerful operations happen in the main runtime** - file I/O, network requests, Canvas rendering, database queries
3. **Communication happens through controlled message channels** - isolates send requests, main runtime executes them and returns results
4. **Permission system controls access** - each isolate has a specific set of allowed operations

## The Communication Flow

### Request-Response Pattern
When a content block needs to do something beyond basic JavaScript:

1. **Content block calls a proxy function** (like `await symposium.readFile('/path/to/file')`)
2. **Proxy function sends a message to main runtime** with the request details
3. **Main runtime receives the message** and validates permissions
4. **Main runtime executes the operation** using its full capabilities
5. **Main runtime sends the result back** to the requesting isolate
6. **Proxy function returns the result** to the content block code

### Message Structure
All communication uses a standardized message format that includes:
- **Message ID**: For matching requests with responses
- **Operation type**: What capability is being requested
- **Parameters**: The data needed to perform the operation
- **Isolate ID**: Which content block is making the request
- **Permissions context**: What this isolate is allowed to do

## Core Proxy Capabilities to Implement

### File System Operations
**Purpose**: Allow content blocks to read configuration files, process uploaded data, or save generated content

**Main runtime responsibilities**:
- Validate file paths against isolate permissions
- Handle actual file reading/writing operations
- Manage file size limits and storage quotas
- Provide secure temporary directories for each isolate

**Isolate interface**: Simple functions that feel like normal file operations but actually send messages to main runtime

### Enhanced Network Operations
**Purpose**: Beyond basic fetch - webhook handling, custom headers, request/response processing

**Main runtime responsibilities**:
- Enforce domain allowlists for each isolate
- Handle complex HTTP scenarios (redirects, authentication, custom protocols)
- Manage rate limiting and request quotas
- Process and sanitize responses before returning to isolates

### Canvas and Graphics Rendering
**Purpose**: Enable visual content creation without requiring browser environment

**Main runtime responsibilities**:
- Load Canvas libraries (like Deno Canvas) on demand
- Execute Canvas drawing operations requested by isolates
- Return rendered images or graphics data back to isolates
- Handle complex graphics operations that require system libraries

### Database Connectivity
**Purpose**: Allow content blocks to store and retrieve data persistently

**Main runtime responsibilities**:
- Maintain database connection pools
- Execute SQL queries with parameter binding for security
- Enforce query limits and database permissions per isolate
- Handle transactions and connection management

### Process Execution
**Purpose**: Enable content blocks to run external tools or scripts

**Main runtime responsibilities**:
- Maintain whitelist of allowed commands per isolate
- Execute processes in controlled environments
- Capture and return output/errors safely
- Enforce execution time and resource limits

## Permission System Architecture

### Isolate Permission Profiles
Each content block operates under a specific permission profile that determines what capabilities it can access:

**Basic Profile**: Read-only operations, limited network access
**Interactive Profile**: File upload/download, broader network access, Canvas operations
**Data Profile**: Database access, external API calls, file processing
**Advanced Profile**: Process execution, system operations (for trusted creators)

### Runtime Permission Checking
Before executing any operation, the main runtime validates:
- Does this isolate have permission for this operation type?
- Are the parameters within allowed bounds (file paths, domains, etc.)?
- Has this isolate exceeded its usage quotas?
- Is this operation safe given the current system state?

## Implementation Strategy

### Message Broker Pattern
Create a central message broker in your main runtime that:
- Receives all messages from isolates
- Routes messages to appropriate capability handlers
- Manages response routing back to originating isolates
- Handles message queuing and timeout management

### Capability Handlers
Implement separate handlers for each major capability area:
- FileSystemHandler: Manages all file operations
- NetworkHandler: Manages HTTP requests and network operations
- GraphicsHandler: Manages Canvas and image operations
- DatabaseHandler: Manages data storage and retrieval
- ProcessHandler: Manages external process execution

### Isolate-Side Proxy Layer
In each isolate, implement a proxy layer that:
- Provides familiar JavaScript APIs to content block code
- Translates API calls into messages to main runtime
- Handles async operations and promise resolution
- Provides helpful error messages when operations fail

## Error Handling and Security

### Graceful Degradation
When an isolate requests a capability it doesn't have permission for:
- Return clear error messages explaining the limitation
- Suggest alternative approaches when possible
- Log the attempt for security monitoring
- Don't crash the isolate - just fail the specific operation

### Resource Management
The orchestrator must prevent isolates from overwhelming the system:
- Enforce memory limits for operations
- Set timeout limits for long-running operations
- Implement rate limiting for API calls
- Monitor and terminate runaway processes

### Security Boundaries
Maintain strict security by:
- Never allowing isolates to specify arbitrary file paths
- Validating all user input before processing
- Using parameter binding for database queries
- Sanitizing all data flowing between isolates and main runtime

## Performance Considerations

### Operation Batching
For efficiency, batch similar operations when possible:
- Combine multiple file reads into single batch
- Group database queries into transactions
- Cache frequently accessed data in main runtime

### Capability Caching
Avoid repeated setup costs by:
- Keeping Canvas contexts alive between operations
- Maintaining persistent database connections
- Caching compiled processes and configurations

### Async Operation Management
Handle long-running operations gracefully:
- Use streaming for large file operations
- Provide progress updates for slow operations
- Allow operations to be cancelled if isolate terminates

## Integration with Your Existing Demo

### Gradual Enhancement Approach
You can implement this incrementally:

1. **Start with file system proxy** - Replace any direct file access with proxy calls
2. **Add enhanced network capabilities** - Extend beyond basic fetch
3. **Implement Canvas support** - Enable graphics operations
4. **Add database layer** - Enable persistent data storage
5. **Include process execution** - Allow external tool usage

### Backward Compatibility
Ensure your existing content blocks continue working by:
- Maintaining existing APIs while adding new capabilities
- Providing sensible defaults for permission profiles
- Gracefully handling cases where proxy operations aren't available

## Success Metrics

You'll know the orchestrator proxy is working when:
- Content blocks can perform complex operations (Canvas drawing, file processing, database queries) seamlessly
- Creators don't need to think about isolation boundaries - capabilities just work
- System remains stable and secure even with multiple content blocks running complex operations
- Performance is acceptable - proxy operations feel reasonably fast to end users

## The End Goal

With this orchestrator proxy implemented, your demo will demonstrate that Symposium content blocks can be **more capable than traditional browser-based environments** while maintaining **complete security isolation**. Creators will be able to build sophisticated, interactive content that accesses real capabilities while you maintain full control over security and resource usage.

The orchestrator transforms isolated JavaScript execution from a limitation into a superpower - giving creators access to server-side capabilities through a secure, controlled interface.