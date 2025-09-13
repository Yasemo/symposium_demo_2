// Symposium Demo Frontend Application

class SymposiumDemo {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.activeBlocks = new Map();
        this.currentBlockId = null;
        this.currentlyEditingBlockId = null; // Track which block is being edited
        this.selectedBlockId = null; // Track which block is selected for AI editing
        this.autocomplete = new AutocompleteManager();
        this.chatMode = 'plan'; // 'plan' or 'create'
        this.isRestoring = false; // Flag to prevent saving during restoration

        this.init();
    }

    init() {
        this.setupWebSocket();
        this.setupEventListeners();
        this.updateConnectionStatus();
    }

    // WebSocket connection management
    setupWebSocket() {
        try {
            this.ws = new WebSocket('ws://localhost:8000/ws');

            this.ws.onopen = (event) => {
                console.log('WebSocket connected:', event);
                this.isConnected = true;
                this.updateConnectionStatus();

                // Restore content blocks once connected
                this.restoreContentBlocks();
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = (event) => {
                console.log('WebSocket disconnected:', event);
                this.isConnected = false;
                this.updateConnectionStatus();
                // Attempt to reconnect after 3 seconds
                setTimeout(() => this.setupWebSocket(), 3000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isConnected = false;
                this.updateConnectionStatus();
            };

        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
        }
    }

    updateConnectionStatus() {
        const indicator = document.getElementById('status-indicator');
        const text = document.getElementById('status-text');

        if (this.isConnected) {
            indicator.className = 'status-indicator connected';
            text.textContent = 'Connected';
        } else {
            indicator.className = 'status-indicator disconnected';
            text.textContent = 'Disconnected';
        }
    }

    handleWebSocketMessage(message) {
        console.log('Received message:', message);

        switch (message.type) {
            case 'chat_response':
                this.addChatMessage(message.message, 'bot');
                break;
            case 'ai_content_generated':
                this.handleAIContentGenerated(message);
                break;
            case 'content_executed':
                this.handleContentExecuted(message);
                break;
            case 'content_updated':
                this.handleContentUpdated(message);
                break;
            case 'block_data':
                this.handleBlockData(message);
                break;
            case 'iframe_api_response':
                this.handleIframeAPIResponse(message);
                break;
            case 'data_item_deleted':
                this.handleDataItemDeleted(message);
                break;
            case 'content_block_terminated':
                this.handleContentBlockTerminated(message);
                break;
            case 'error':
                this.showError(message.error);
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }

    // Chat functionality
    setupEventListeners() {
        // Chat input
        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-button');

        chatInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendChatMessage();
            }
        });

        sendButton.addEventListener('click', () => {
            this.sendChatMessage();
        });

        // New block button
        const newBlockButton = document.getElementById('new-block-button');
        newBlockButton.addEventListener('click', () => {
            this.openCodeEditor();
        });

        // Modal controls
        const closeModal = document.getElementById('close-modal');
        const executeButton = document.getElementById('execute-button');
        const updateButton = document.getElementById('update-button');

        closeModal.addEventListener('click', () => {
            this.closeCodeEditor();
        });

        executeButton.addEventListener('click', () => {
            this.executeContentBlock();
        });

        updateButton.addEventListener('click', () => {
            this.updateContentBlock();
        });

        // Close modal when clicking outside
        const modal = document.getElementById('editor-modal');
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                this.closeCodeEditor();
            }
        });

        // Mode toggle buttons
        const planModeBtn = document.getElementById('plan-mode-btn');
        const createModeBtn = document.getElementById('create-mode-btn');

        planModeBtn.addEventListener('click', () => {
            this.setChatMode('plan');
        });

        createModeBtn.addEventListener('click', () => {
            this.setChatMode('create');
        });

        // Listen for API calls from iframes
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'apiCall') {
                this.handleIframeAPICall(event.data);
            }
        });
    }

    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message || !this.isConnected) return;

        // Add user message to chat
        this.addChatMessage(message, 'user');
        input.value = '';

        // Prepare message data
        const messageData = {
            type: 'chat',
            text: message,
            mode: this.chatMode,
            timestamp: Date.now()
        };

        // Include selected block context for AI editing
        if (this.selectedBlockId && this.activeBlocks.has(this.selectedBlockId)) {
            const selectedBlock = this.activeBlocks.get(this.selectedBlockId);
            messageData.selectedBlockContext = {
                blockId: this.selectedBlockId,
                currentCode: {
                    html: selectedBlock.code.html,
                    css: selectedBlock.code.css,
                    javascript: selectedBlock.code.javascript
                }
            };
            console.log('Including selected block context:', messageData.selectedBlockContext);
        }

        // Include editing context if currently editing a block (fallback)
        if (this.currentlyEditingBlockId && this.activeBlocks.has(this.currentlyEditingBlockId)) {
            const currentBlock = this.activeBlocks.get(this.currentlyEditingBlockId);
            messageData.editingContext = {
                blockId: this.currentlyEditingBlockId,
                currentCode: {
                    html: currentBlock.code.html,
                    css: currentBlock.code.css,
                    javascript: currentBlock.code.javascript
                }
            };
            console.log('Including editing context:', messageData.editingContext);
        }

        // Send to server
        this.ws.send(JSON.stringify(messageData));
    }

    addChatMessage(text, sender) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        messageDiv.innerHTML = `
            <div class="message-content">
                ${this.escapeHtml(text)}
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Content block management
    openCodeEditor(blockId = null) {
        this.currentBlockId = blockId;
        this.currentlyEditingBlockId = blockId; // Track editing context
        const modal = document.getElementById('editor-modal');

        // Always clear editors first to ensure clean state
        this.clearAllEditors();

        if (blockId && this.activeBlocks.has(blockId)) {
            // Load existing block data
            const block = this.activeBlocks.get(blockId);
            document.getElementById('html-editor').value = block.code.html || '';
            document.getElementById('css-editor').value = block.code.css || '';
            document.getElementById('js-editor').value = block.code.javascript || '';
            console.log(`Now editing block: ${blockId}`);

            // Load stored data for this block
            this.loadBlockData(blockId);
        } else {
            // New block - editors are already cleared
            this.currentlyEditingBlockId = null; // Not editing existing block
            this.clearDataViewer(); // Clear data viewer for new blocks
            console.log('Creating new content block');
        }

        modal.classList.add('show');
    }

    closeCodeEditor() {
        const modal = document.getElementById('editor-modal');
        modal.classList.remove('show');
        this.currentBlockId = null;
        this.currentlyEditingBlockId = null; // Clear editing context
        console.log('Cleared editing context');
    }

    executeContentBlock() {
        const html = document.getElementById('html-editor').value;
        const css = document.getElementById('css-editor').value;
        const javascript = document.getElementById('js-editor').value;

        const blockId = this.currentBlockId || crypto.randomUUID();

        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        // Send to server for execution
        this.ws.send(JSON.stringify({
            type: 'execute_content',
            blockId,
            code: { html, css, javascript }
        }));

        this.closeCodeEditor();
    }

    updateContentBlock() {
        if (!this.currentBlockId) return;

        const html = document.getElementById('html-editor').value;
        const css = document.getElementById('css-editor').value;
        const javascript = document.getElementById('js-editor').value;

        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        // Send update to server
        this.ws.send(JSON.stringify({
            type: 'update_content',
            blockId: this.currentBlockId,
            updates: { html, css, javascript }
        }));

        this.closeCodeEditor();
    }

    handleAIContentGenerated(message) {
        const { blockId, code, explanation } = message;
        console.log(`AI generated content block: ${blockId}`, code);

        // Create a result object from the AI-generated code
        const result = {
            html: code.html,
            css: code.css,
            javascript: code.javascript,
            success: true,
            timestamp: Date.now()
        };

        // Create the content block element
        this.createContentBlockElement(blockId, result);

        // Store in active blocks
        this.activeBlocks.set(blockId, {
            id: blockId,
            code: result,
            result,
            explanation,
            source: 'ai_generated'
        });

        // Save content blocks to localStorage
        this.saveContentBlocks();

        console.log(`AI-generated content block ${blockId} created and displayed`);
    }

    handleContentExecuted(message) {
        const { blockId, result } = message;

        // Check if block already exists
        if (this.activeBlocks.has(blockId)) {
            console.log(`Updating existing block: ${blockId}`);
            // Update existing block
            const existingBlock = this.activeBlocks.get(blockId);
            existingBlock.result = result;
            existingBlock.code = result;

            // Update the iframe content
            const iframe = document.getElementById(`block-${blockId}`);
            if (iframe) {
                iframe.setAttribute('srcdoc', this.generateHTMLContent(result, blockId));
            }
        } else {
            console.log(`Creating new block: ${blockId}`);
            // Create new block
            this.createContentBlockElement(blockId, result);
            this.activeBlocks.set(blockId, {
                id: blockId,
                code: result,
                result
            });
        }

        // Save content blocks to localStorage
        this.saveContentBlocks();
    }

    handleContentUpdated(message) {
        const { blockId, result } = message;

        if (this.activeBlocks.has(blockId)) {
            const block = this.activeBlocks.get(blockId);
            // Update both result and code to maintain consistency
            block.result = result;
            block.code = result;

            // Update the main content block iframe
            const mainIframe = document.getElementById(`block-${blockId}`);
            if (mainIframe) {
                mainIframe.setAttribute('srcdoc', this.generateHTMLContent(result, blockId));
            }

            // Update the expand modal iframe if it's currently showing this block
            const expandModal = document.getElementById('expand-modal');
            if (expandModal && expandModal.classList.contains('show')) {
                const currentBlockId = this.getCurrentExpandBlockId();
                if (currentBlockId === blockId) {
                    const expandIframe = expandModal.querySelector('#expanded-block-content');
                    if (expandIframe) {
                        expandIframe.setAttribute('srcdoc', this.generateHTMLContent(result, blockId));
                    }
                }
            }

            // Save content blocks to localStorage
            this.saveContentBlocks();
        }
    }

    handleBlockData(message) {
        const { blockId, data } = message;
        console.log(`Received block data for ${blockId}:`, data);

        // Update the data viewer with the received data
        this.updateDataViewer(data);
    }

    createContentBlockElement(blockId, result) {
        const container = document.getElementById('content-blocks');
        const blockDiv = document.createElement('div');
        blockDiv.className = 'content-block';
        blockDiv.id = `content-block-${blockId}`;

        // Add click handler for selection
        blockDiv.addEventListener('click', (e) => {
            // Don't select if clicking on buttons
            if (e.target.tagName === 'BUTTON') return;
            this.selectBlock(blockId);
        });

        blockDiv.innerHTML = `
            <div class="content-block-header">
                <h3>Content Block ${blockId.slice(0, 8)}</h3>
                <div>
                    <button onclick="app.expandBlock('${blockId}')" title="Expand view">⛶</button>
                    <button onclick="app.editBlock('${blockId}')">Edit</button>
                    <button onclick="app.deleteBlock('${blockId}')" style="background: #dc3545;">Delete</button>
                </div>
            </div>
            <div class="content-block-output">
                <iframe id="block-${blockId}" sandbox="allow-scripts">
                </iframe>
            </div>
        `;

        // Set the srcdoc using setAttribute to avoid HTML escaping issues
        const iframe = blockDiv.querySelector(`#block-${blockId}`);
        if (iframe) {
            iframe.setAttribute('srcdoc', this.generateHTMLContent(result, blockId));
        }

        container.appendChild(blockDiv);

        // Auto-select the newly created block
        this.selectBlock(blockId);
    }

    generateHTMLContent(result, blockId) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: system-ui; margin: 0; padding: 16px; }
                    ${result.css || ''}
                </style>
            </head>
            <body>
                ${result.html || '<p>Content block executed successfully</p>'}
                <script>
                    // Demo API for content blocks - communicates with parent window
                    window.demoAPI = {
                        async saveData(key, value) {
                            return await this._callAPI('saveData', { key, value });
                        },

                        async getData(key) {
                            return await this._callAPI('getData', { key });
                        },

                        async deleteData(key) {
                            return await this._callAPI('deleteData', { key });
                        },

                        async _callAPI(method, params) {
                            return new Promise((resolve, reject) => {
                                const callId = Date.now() + Math.random();

                                const handleMessage = (event) => {
                                    if (event.data.type === 'apiResponse' && event.data.callId === callId) {
                                        window.removeEventListener('message', handleMessage);
                                        if (event.data.error) {
                                            reject(new Error(event.data.error));
                                        } else {
                                            resolve(event.data.result);
                                        }
                                    }
                                };

                                window.addEventListener('message', handleMessage);

                                // Send API call to parent window
                                window.parent.postMessage({
                                    type: 'apiCall',
                                    blockId: '${blockId}',
                                    method,
                                    params,
                                    callId
                                }, '*');

                                // Timeout after 10 seconds
                                setTimeout(() => {
                                    window.removeEventListener('message', handleMessage);
                                    reject(new Error('API call timeout'));
                                }, 10000);
                            });
                        }
                    };

                    ${result.javascript || ''}
                </script>
            </body>
            </html>
        `;
    }

    expandBlock(blockId) {
        console.log(`🔍 EXPAND: Attempting to expand block ${blockId}`);

        if (this.activeBlocks.has(blockId)) {
            console.log(`✅ EXPAND: Block ${blockId} found in activeBlocks`);
            const block = this.activeBlocks.get(blockId);
            console.log(`📊 EXPAND: Block data:`, {
                hasResult: !!block.result,
                resultKeys: block.result ? Object.keys(block.result) : 'no result',
                resultSuccess: block.result?.success,
                hasHtml: !!block.result?.html,
                hasCss: !!block.result?.css,
                hasJs: !!block.result?.javascript
            });
            this.openExpandModal(blockId);
        } else {
            console.error(`❌ EXPAND: Block ${blockId} not found in activeBlocks`);
            console.log(`📋 EXPAND: Available blocks:`, Array.from(this.activeBlocks.keys()));
        }
    }

    openExpandModal(blockId) {
        console.log(`🔧 MODAL: Opening expand modal for block ${blockId}`);

        const block = this.activeBlocks.get(blockId);
        if (!block) {
            console.error(`❌ MODAL: Block ${blockId} not found in activeBlocks`);
            return;
        }

        console.log(`📦 MODAL: Block data validation:`, {
            hasResult: !!block.result,
            resultType: typeof block.result,
            resultKeys: block.result ? Object.keys(block.result) : 'no keys',
            htmlLength: block.result?.html?.length || 0,
            cssLength: block.result?.css?.length || 0,
            jsLength: block.result?.javascript?.length || 0
        });

        // Create or update the expand modal
        let modal = document.getElementById('expand-modal');
        console.log(`🔍 MODAL: Existing modal found:`, !!modal);

        if (!modal) {
            console.log(`🏗️ MODAL: Creating new modal element`);
            modal = document.createElement('div');
            modal.id = 'expand-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content expand-modal-content" style="
                    position: fixed;
                    top: 20px;
                    left: 20px;
                    right: 20px;
                    bottom: 20px;
                    max-width: none;
                    max-height: none;
                    width: auto;
                    height: auto;
                    margin: 0;
                    border-radius: 8px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                ">
                    <div class="modal-header" style="
                        padding: 15px 20px;
                        border-bottom: 1px solid #e0e0e0;
                        background: #f8f9fa;
                        border-radius: 8px 8px 0 0;
                    ">
                        <h3 style="margin: 0; font-size: 18px; font-weight: 600;" data-block-id="${blockId}">Content Block ${blockId.slice(0, 8)}</h3>
                        <div class="modal-header-buttons">
                            <button class="edit-button" onclick="app.toggleExpandEditors()" style="
                                padding: 8px 16px;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 0.9rem;
                                font-weight: 500;
                                transition: transform 0.2s;
                            ">Edit</button>
                            <button class="close-button" onclick="app.closeExpandModal()" style="
                                background: none;
                                border: none;
                                font-size: 24px;
                                cursor: pointer;
                                color: #666;
                                padding: 0;
                                width: 30px;
                                height: 30px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                border-radius: 50%;
                                transition: background-color 0.2s;
                            ">&times;</button>
                        </div>
                    </div>
                    <div class="expand-modal-body" style="
                        padding: 0;
                        height: calc(100% - 70px);
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                    ">
                        <div class="expand-iframe-container" style="
                            flex: 1;
                            position: relative;
                        ">
                            <iframe id="expanded-block-content" sandbox="allow-scripts" style="
                                width: 100%;
                                height: 100%;
                                border: none;
                                border-radius: 0;
                            ">
                            </iframe>
                        </div>
                        <div class="expand-editors-section" id="expand-editors-section" style="
                            display: none;
                            background: white;
                            border-top: 1px solid #e0e0e0;
                            padding: 20px;
                            max-height: 50%;
                            overflow-y: auto;
                        ">
                            <div class="expand-code-editors" style="
                                display: grid;
                                grid-template-columns: 1fr 1fr 1fr;
                                gap: 15px;
                                margin-bottom: 15px;
                            ">
                                <div class="expand-editor-section">
                                    <h4 style="margin-bottom: 8px; color: #333; font-size: 0.9rem;">HTML</h4>
                                    <textarea id="expand-html-editor" class="expand-editor-textarea" placeholder="Enter your HTML code..."></textarea>
                                </div>
                                <div class="expand-editor-section">
                                    <h4 style="margin-bottom: 8px; color: #333; font-size: 0.9rem;">CSS</h4>
                                    <textarea id="expand-css-editor" class="expand-editor-textarea" placeholder="Enter your CSS styles..."></textarea>
                                </div>
                                <div class="expand-editor-section">
                                    <h4 style="margin-bottom: 8px; color: #333; font-size: 0.9rem;">JavaScript</h4>
                                    <textarea id="expand-js-editor" class="expand-editor-textarea" placeholder="Enter your JavaScript code..."></textarea>
                                </div>
                            </div>
                            <div class="expand-modal-actions" style="
                                display: flex;
                                justify-content: flex-end;
                                gap: 10px;
                            ">
                                <button id="expand-update-button" class="primary-button" style="
                                    padding: 10px 20px;
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                    color: white;
                                    border: none;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    font-size: 0.9rem;
                                    font-weight: 500;
                                    transition: transform 0.2s;
                                ">Update</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            console.log(`✅ MODAL: Modal element created and appended to body`);

            // Add event listener for update button
            const updateButton = modal.querySelector('#expand-update-button');
            if (updateButton) {
                updateButton.addEventListener('click', () => this.updateFromExpandModal(blockId));
            }
        } else {
            console.log(`♻️ MODAL: Reusing existing modal element`);

            // Update the title
            const titleElement = modal.querySelector('h3');
            if (titleElement) {
                titleElement.textContent = `Content Block ${blockId.slice(0, 8)}`;
                titleElement.setAttribute('data-block-id', blockId);
            }

            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeExpandModal();
                }
            });

            // More robust iframe reset strategy
            const existingIframe = modal.querySelector('#expanded-block-content');
            if (existingIframe) {
                console.log(`🧹 MODAL: Performing complete iframe reset`);

                // Method 1: Clear content and force reload
                existingIframe.setAttribute('srcdoc', '');
                existingIframe.src = 'about:blank';

                // Method 2: Remove and recreate iframe element
                const iframeContainer = existingIframe.parentNode;
                const newIframe = document.createElement('iframe');
                newIframe.id = 'expanded-block-content';
                newIframe.setAttribute('sandbox', 'allow-scripts');
                newIframe.style.cssText = 'width: 100%; height: 100%; border: none; border-radius: 0;';

                // Replace the old iframe
                iframeContainer.replaceChild(newIframe, existingIframe);
                console.log(`✅ MODAL: iframe element completely replaced`);
            }

            // Modal is already clean and ready to use
        }

        // Set the iframe content
        console.log(`🔍 MODAL: Looking for iframe element`);
        const iframe = modal.querySelector('#expanded-block-content');
        console.log(`📺 MODAL: iframe element found:`, !!iframe);

        if (iframe) {
            console.log(`📝 MODAL: Setting iframe content with robust method`);

            // Generate content with cache-busting
            const htmlContent = this.generateHTMLContent(block.result, blockId);
            const cacheBustedContent = htmlContent.replace(
                '<!DOCTYPE html>',
                `<!DOCTYPE html><!-- Cache bust: ${Date.now()} ${Math.random()} -->`
            );

            console.log(`📄 MODAL: Generated HTML content length:`, htmlContent.length);
            console.log(`📄 MODAL: Content preview:`, htmlContent.substring(0, 200) + '...');

            // Method 1: Try srcdoc with delay
            const setContentWithDelay = () => {
                try {
                    iframe.setAttribute('srcdoc', cacheBustedContent);
                    console.log(`✅ MODAL: iframe srcdoc set successfully`);

                    // Verify content was set
                    const currentSrcdoc = iframe.getAttribute('srcdoc');
                    console.log(`🔍 MODAL: Verification - srcdoc length:`, currentSrcdoc?.length || 0);

                    if (!currentSrcdoc || currentSrcdoc.length === 0) {
                        console.warn(`⚠️ MODAL: srcdoc appears to be empty, trying alternative method`);
                        // Method 2: Try data URL approach
                        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(cacheBustedContent);
                        iframe.src = dataUrl;
                        console.log(`🔄 MODAL: Using data URL method`);
                    }
                } catch (error) {
                    console.error(`❌ MODAL: Failed to set iframe content:`, error);
                    // Method 3: Try blob URL as fallback
                    try {
                        const blob = new Blob([cacheBustedContent], { type: 'text/html' });
                        const blobUrl = URL.createObjectURL(blob);
                        iframe.src = blobUrl;
                        console.log(`🔄 MODAL: Using blob URL method`);
                    } catch (blobError) {
                        console.error(`❌ MODAL: All content setting methods failed:`, blobError);
                    }
                }
            };

            // Wait a bit for iframe to be ready, then set content
            if (iframe.contentDocument || iframe.contentWindow) {
                console.log(`⚡ MODAL: iframe ready, setting content immediately`);
                setContentWithDelay();
            } else {
                console.log(`⏳ MODAL: iframe not ready, waiting 50ms`);
                setTimeout(setContentWithDelay, 50);
            }

            // Add comprehensive event listeners
            const loadHandler = () => {
                console.log(`🎯 MODAL: iframe content loaded successfully`);
                // Clean up blob URL if used
                if (iframe.src && iframe.src.startsWith('blob:')) {
                    URL.revokeObjectURL(iframe.src);
                }
            };

            const errorHandler = (e) => {
                console.error(`❌ MODAL: iframe content failed to load:`, e);
                // Show error content in iframe
                const errorContent = `
                    <!DOCTYPE html>
                    <html>
                    <head><title>Error</title></head>
                    <body style="color: red; padding: 20px;">
                        <h2>Content Load Error</h2>
                        <p>Failed to load content for block ${blockId.slice(0, 8)}</p>
                        <p>Error: ${e.message || 'Unknown error'}</p>
                    </body>
                    </html>
                `;
                iframe.setAttribute('srcdoc', errorContent);
            };

            // Remove existing listeners and add new ones
            iframe.removeEventListener('load', loadHandler);
            iframe.removeEventListener('error', errorHandler);
            iframe.addEventListener('load', loadHandler);
            iframe.addEventListener('error', errorHandler);

            // Add timeout for content loading
            setTimeout(() => {
                if (!iframe.contentDocument && !iframe.contentWindow?.document) {
                    console.warn(`⏰ MODAL: iframe content loading timeout`);
                    errorHandler(new Error('Content loading timeout'));
                }
            }, 3000);

        } else {
            console.error(`❌ MODAL: Could not find iframe element in modal`);
            console.log(`🔍 MODAL: Modal HTML:`, modal.innerHTML);
        }

        console.log(`👁️ MODAL: Showing modal`);
        modal.classList.add('show');
        console.log(`✅ MODAL: Modal show class added`);

        // Force a reflow to ensure modal is visible
        modal.offsetHeight;
        console.log(`🔄 MODAL: Forced reflow completed`);

        // Verify modal visibility after a short delay
        setTimeout(() => {
            const computedStyle = window.getComputedStyle(modal);
            console.log(`👁️ MODAL: Modal visibility check:`, {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity,
                hasShowClass: modal.classList.contains('show'),
                zIndex: computedStyle.zIndex
            });
        }, 100);
    }

    closeExpandModal() {
        const modal = document.getElementById('expand-modal');
        if (modal) {
            modal.classList.remove('show');
            // Hide editors when closing modal
            const editorsSection = modal.querySelector('#expand-editors-section');
            if (editorsSection) {
                editorsSection.style.display = 'none';
            }
        }
    }

    toggleExpandEditors() {
        const modal = document.getElementById('expand-modal');
        if (!modal) {
            console.error('Expand modal not found');
            return;
        }

        const editorsSection = modal.querySelector('#expand-editors-section');
        const iframeContainer = modal.querySelector('.expand-iframe-container');

        if (!editorsSection || !iframeContainer) {
            console.error('Required modal elements not found');
            return;
        }

        const isVisible = editorsSection.style.display !== 'none';

        if (isVisible) {
            // Hide editors
            editorsSection.style.display = 'none';
            iframeContainer.style.flex = '1';
            console.log('Editors hidden');
        } else {
            // Show editors and populate with current code
            const blockId = this.getCurrentExpandBlockId();
            console.log('Toggle editors - extracted blockId:', blockId);

            if (blockId && this.activeBlocks.has(blockId)) {
                const block = this.activeBlocks.get(blockId);
                console.log('Block found:', block);
                console.log('Block code:', block.code);

                const htmlEditor = modal.querySelector('#expand-html-editor');
                const cssEditor = modal.querySelector('#expand-css-editor');
                const jsEditor = modal.querySelector('#expand-js-editor');

                console.log('Editors found:', { htmlEditor: !!htmlEditor, cssEditor: !!cssEditor, jsEditor: !!jsEditor });

                if (htmlEditor) {
                    htmlEditor.value = block.code.html || '';
                    console.log('HTML editor populated with:', block.code.html);
                }
                if (cssEditor) {
                    cssEditor.value = block.code.css || '';
                    console.log('CSS editor populated with:', block.code.css);
                }
                if (jsEditor) {
                    jsEditor.value = block.code.javascript || '';
                    console.log('JS editor populated with:', block.code.javascript);
                }
            } else {
                console.error('Block not found for blockId:', blockId);
                console.log('Available blocks:', Array.from(this.activeBlocks.keys()));
            }

            editorsSection.style.display = 'block';
            iframeContainer.style.flex = '1';
            console.log('Editors shown');
        }
    }

    getCurrentExpandBlockId() {
        const modal = document.getElementById('expand-modal');
        if (!modal) return null;

        const titleElement = modal.querySelector('h3');
        if (!titleElement) return null;

        // Try to get the block ID from the data attribute first
        const blockId = titleElement.getAttribute('data-block-id');
        if (blockId) return blockId;

        // Fallback to parsing the text (for backward compatibility)
        const titleText = titleElement.textContent;
        const match = titleText.match(/Content Block ([a-f0-9-]{8})/);
        return match ? match[1] : null;
    }

    updateFromExpandModal(blockId) {
        if (!blockId) {
            blockId = this.getCurrentExpandBlockId();
        }

        if (!blockId || !this.activeBlocks.has(blockId)) return;

        const modal = document.getElementById('expand-modal');
        if (!modal) return;

        const html = modal.querySelector('#expand-html-editor')?.value || '';
        const css = modal.querySelector('#expand-css-editor')?.value || '';
        const javascript = modal.querySelector('#expand-js-editor')?.value || '';

        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        // Send update to server
        this.ws.send(JSON.stringify({
            type: 'update_content',
            blockId: blockId,
            updates: { html, css, javascript }
        }));

        console.log(`Updating content block ${blockId} from expand modal`);
    }

    editBlock(blockId) {
        if (this.activeBlocks.has(blockId)) {
            this.openCodeEditor(blockId);
        }
    }

    deleteBlock(blockId) {
        if (this.activeBlocks.has(blockId)) {
            // Send termination message to server first
            if (this.isConnected) {
                this.ws.send(JSON.stringify({
                    type: 'terminate_content_block',
                    blockId: blockId
                }));
                console.log(`Sent termination request for block ${blockId}`);

                // Set a timeout to handle cases where termination response is not received
                setTimeout(() => {
                    if (this.activeBlocks.has(blockId)) {
                        console.warn(`Termination timeout for block ${blockId}, forcing cleanup`);
                        this.forceDeleteBlock(blockId);
                    }
                }, 5000); // 5 second timeout
            } else {
                // Not connected, force delete immediately
                console.log(`Not connected, forcing immediate deletion of block ${blockId}`);
                this.forceDeleteBlock(blockId);
            }
        }
    }

    // Force delete a block (used when termination fails or times out)
    forceDeleteBlock(blockId) {
        if (this.activeBlocks.has(blockId)) {
            console.log(`Force deleting block ${blockId}`);

            this.activeBlocks.delete(blockId);
            const element = document.getElementById(`content-block-${blockId}`);
            if (element) {
                element.remove();
            }

            // Clear selection if the deleted block was selected
            if (this.selectedBlockId === blockId) {
                this.selectedBlockId = null;
            }

            // Save content blocks to localStorage after deletion
            this.saveContentBlocks();

            console.log(`Block ${blockId} successfully deleted`);
        }
    }

    // Block selection for AI editing
    selectBlock(blockId) {
        if (!this.activeBlocks.has(blockId)) return;

        // Remove selection from previously selected block
        if (this.selectedBlockId) {
            const prevElement = document.getElementById(`content-block-${this.selectedBlockId}`);
            if (prevElement) {
                prevElement.classList.remove('selected');
            }
        }

        // Set new selection
        this.selectedBlockId = blockId;
        const element = document.getElementById(`content-block-${blockId}`);
        if (element) {
            element.classList.add('selected');
        }

        console.log(`Selected block for AI editing: ${blockId}`);
    }

    // Utility functions
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setChatMode(mode) {
        this.chatMode = mode;
        console.log(`Chat mode switched to: ${mode}`);

        // Update UI
        const planBtn = document.getElementById('plan-mode-btn');
        const createBtn = document.getElementById('create-mode-btn');

        if (mode === 'plan') {
            planBtn.classList.add('active');
            createBtn.classList.remove('active');
        } else {
            createBtn.classList.add('active');
            planBtn.classList.remove('active');
        }

        // Update placeholder text
        const chatInput = document.getElementById('chat-input');
        if (mode === 'create') {
            chatInput.placeholder = 'Describe what you want to create...';
        } else {
            chatInput.placeholder = 'Ask me to create content blocks...';
        }
    }

    showError(message) {
        console.error('Error:', message);
        // You could implement a toast notification system here
        alert(`Error: ${message}`);
    }

    // Persistence methods
    saveContentBlocks() {
        if (this.isRestoring) return; // Don't save during restoration

        const blocksData = {};
        for (const [blockId, block] of this.activeBlocks.entries()) {
            blocksData[blockId] = {
                code: block.code,
                explanation: block.explanation,
                source: block.source,
                timestamp: Date.now()
            };
        }

        try {
            localStorage.setItem('symposiumContentBlocks', JSON.stringify(blocksData));
            console.log('Content blocks saved to localStorage');
        } catch (error) {
            console.error('Failed to save content blocks:', error);
        }
    }

    restoreContentBlocks() {
        try {
            const savedData = localStorage.getItem('symposiumContentBlocks');
            if (!savedData) {
                console.log('No saved content blocks found');
                return;
            }

            const blocksData = JSON.parse(savedData);
            console.log('Restoring content blocks from localStorage:', Object.keys(blocksData).length, 'blocks');

            this.isRestoring = true;

            // Re-execute all saved blocks
            const restorePromises = Object.entries(blocksData).map(async ([blockId, blockData]) => {
                try {
                    console.log(`Restoring block ${blockId}`);

                    // Send to server for execution
                    this.ws.send(JSON.stringify({
                        type: 'execute_content',
                        blockId,
                        code: blockData.code
                    }));
                } catch (error) {
                    console.error(`Failed to restore block ${blockId}:`, error);
                }
            });

            // Wait for all restorations to complete
            Promise.all(restorePromises).then(() => {
                this.isRestoring = false;
                console.log('Content block restoration completed');
            });

        } catch (error) {
            console.error('Failed to restore content blocks:', error);
            this.isRestoring = false;
        }
    }

    clearSavedContentBlocks() {
        try {
            localStorage.removeItem('symposiumContentBlocks');
            console.log('Saved content blocks cleared');
        } catch (error) {
            console.error('Failed to clear saved content blocks:', error);
        }
    }

    // Data viewer methods
    async loadBlockData(blockId) {
        if (!this.isConnected) {
            this.clearDataViewer();
            return;
        }

        try {
            // Request data from server for this block
            this.ws.send(JSON.stringify({
                type: 'get_block_data',
                blockId: blockId
            }));
        } catch (error) {
            console.error('Failed to load block data:', error);
            this.clearDataViewer();
        }
    }

    clearDataViewer() {
        const dataItems = document.getElementById('data-items');
        if (dataItems) {
            dataItems.innerHTML = '<div class="no-data">No data stored for this block</div>';
        }
    }

    updateDataViewer(data) {
        const dataItems = document.getElementById('data-items');
        const dataCount = document.querySelector('.data-count');
        if (!dataItems) return;

        if (!data || Object.keys(data).length === 0) {
            this.clearDataViewer();
            if (dataCount) dataCount.textContent = '0';
            return;
        }

        // Update count badge
        if (dataCount) {
            dataCount.textContent = Object.keys(data).length;
        }

        dataItems.innerHTML = '';
        Object.entries(data).forEach(([key, value]) => {
            const dataItem = document.createElement('div');
            dataItem.className = 'data-item';

            const dataType = this.getDataType(value);
            const formattedValue = this.formatDataValue(value, dataType);

            dataItem.innerHTML = `
                <div class="data-item-header">
                    <div class="data-key">
                        ${this.escapeHtml(key)}
                        <span class="data-type data-type-${dataType}">${dataType}</span>
                    </div>
                    <div class="data-actions">
                        <button class="data-action-btn" onclick="app.copyDataValue('${key}')" title="Copy value">📋</button>
                        <button class="data-action-btn" onclick="app.deleteDataItem('${key}')" title="Delete item">🗑️</button>
                    </div>
                </div>
                <div class="data-value data-value-${dataType}">${formattedValue}</div>
            `;

            dataItems.appendChild(dataItem);
        });
    }

    getDataType(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    formatDataValue(value, type) {
        if (value === null) return 'null';

        switch (type) {
            case 'string':
                return this.escapeHtml(`"${value}"`);
            case 'number':
                return this.escapeHtml(String(value));
            case 'boolean':
                return this.escapeHtml(String(value));
            case 'object':
            case 'array':
                return this.syntaxHighlightJSON(value);
            default:
                return this.escapeHtml(String(value));
        }
    }

    syntaxHighlightJSON(obj) {
        const jsonString = JSON.stringify(obj, null, 2);
        return jsonString.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return `<span class="${cls}">${this.escapeHtml(match)}</span>`;
        });
    }

    copyDataValue(key) {
        // This would need to be implemented to copy the value to clipboard
        console.log(`Copy data value for key: ${key}`);
        // For now, just show an alert
        alert(`Copied value for "${key}" to clipboard`);
    }

    deleteDataItem(key) {
        if (confirm(`Are you sure you want to delete the data item "${key}"?`)) {
            // Send delete request to server
            this.ws.send(JSON.stringify({
                type: 'delete_data_item',
                key: key
            }));
            console.log(`Deleting data item: ${key}`);
        }
    }

    // Handle API calls from iframes
    async handleIframeAPICall(data) {
        const { blockId, method, params, callId } = data;

        try {
            console.log(`Handling iframe API call: ${method} for block ${blockId}`);

            // Send the API call to the server
            this.ws.send(JSON.stringify({
                type: 'iframe_api_call',
                blockId,
                method,
                params,
                callId
            }));
        } catch (error) {
            console.error('Error handling iframe API call:', error);

            // Send error response back to iframe
            const iframe = document.getElementById(`block-${blockId}`);
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'apiResponse',
                    callId,
                    error: error.message
                }, '*');
            }
        }
    }

    // Handle API responses from server and forward to iframe
    handleIframeAPIResponse(message) {
        const { blockId, callId, result, error } = message;

        console.log(`Forwarding API response to iframe for block ${blockId}`);

        // Find the iframe and send the response
        const iframe = document.getElementById(`block-${blockId}`);
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'apiResponse',
                callId,
                result,
                error
            }, '*');
        } else {
            console.error(`Could not find iframe for block ${blockId}`);
        }
    }

    // Handle data item deletion response
    handleDataItemDeleted(message) {
        const { key } = message;
        console.log(`Data item deleted: ${key}`);

        // Refresh the data viewer for the currently editing block
        if (this.currentlyEditingBlockId) {
            this.loadBlockData(this.currentlyEditingBlockId);
        }
    }

    // Handle content block termination response
    handleContentBlockTerminated(message) {
        const { blockId } = message;
        console.log(`Content block ${blockId} terminated successfully on server`);

        // Now that server confirms termination, perform the final cleanup
        this.forceDeleteBlock(blockId);
    }

    // Clear all editors to ensure clean state
    clearAllEditors() {
        const htmlEditor = document.getElementById('html-editor');
        const cssEditor = document.getElementById('css-editor');
        const jsEditor = document.getElementById('js-editor');

        if (htmlEditor) htmlEditor.value = '';
        if (cssEditor) cssEditor.value = '';
        if (jsEditor) jsEditor.value = '';

        console.log('All editors cleared');
    }
}

// Initialize the application when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SymposiumDemo();
});

// Autocomplete Manager for Code Editors
class AutocompleteManager {
    constructor() {
        this.currentEditor = null;
        this.suggestions = [];
        this.selectedIndex = -1;
        this.autocompleteElement = null;
        this.isVisible = false;

        this.init();
    }

    init() {
        this.createAutocompleteElement();
        this.setupEventListeners();
    }

    createAutocompleteElement() {
        this.autocompleteElement = document.createElement('div');
        this.autocompleteElement.className = 'autocomplete-dropdown';
        this.autocompleteElement.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-height: 200px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
            min-width: 200px;
        `;
        document.body.appendChild(this.autocompleteElement);
    }

    setupEventListeners() {
        // Listen for input events on code editors
        document.addEventListener('input', (e) => {
            const target = e.target;
            if (target.matches('#html-editor, #css-editor, #js-editor')) {
                this.handleInput(target);
            }
        });

        // Handle keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.isVisible) return;

            const target = e.target;
            if (!target.matches('#html-editor, #css-editor, #js-editor')) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.selectNext();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.selectPrevious();
                    break;
                case 'Enter':
                case 'Tab':
                    e.preventDefault();
                    this.applySelection();
                    break;
                case 'Escape':
                    this.hide();
                    break;
            }
        });

        // Hide autocomplete when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.autocompleteElement.contains(e.target) &&
                !e.target.matches('#html-editor, #css-editor, #js-editor')) {
                this.hide();
            }
        });
    }

    handleInput(editor) {
        const cursorPosition = editor.selectionStart;
        const text = editor.value;
        const currentWord = this.getCurrentWord(text, cursorPosition);

        if (currentWord.length < 2) {
            this.hide();
            return;
        }

        const editorType = editor.id.replace('-editor', '');
        const suggestions = this.getSuggestions(currentWord, editorType);

        if (suggestions.length > 0) {
            this.show(editor, suggestions, currentWord);
        } else {
            this.hide();
        }
    }

    getCurrentWord(text, cursorPosition) {
        // Find the word being typed (from cursor back to whitespace or special chars)
        let start = cursorPosition - 1;
        while (start >= 0 && this.isValidChar(text[start])) {
            start--;
        }
        start++;

        return text.substring(start, cursorPosition);
    }

    isValidChar(char) {
        // Allow letters, numbers, hyphens, underscores
        return /[a-zA-Z0-9\-_]/.test(char);
    }

    getSuggestions(word, type) {
        const lowerWord = word.toLowerCase();
        let suggestions = [];

        switch (type) {
            case 'html':
                suggestions = this.htmlTags.filter(tag =>
                    tag.toLowerCase().startsWith(lowerWord)
                );
                break;
            case 'css':
                suggestions = this.cssProperties.filter(prop =>
                    prop.toLowerCase().startsWith(lowerWord)
                );
                break;
            case 'js':
                suggestions = this.jsKeywords.filter(keyword =>
                    keyword.toLowerCase().startsWith(lowerWord)
                );
                break;
        }

        return suggestions.slice(0, 10); // Limit to 10 suggestions
    }

    show(editor, suggestions, currentWord) {
        this.currentEditor = editor;
        this.suggestions = suggestions;
        this.selectedIndex = 0;

        // Position the dropdown
        const rect = editor.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(editor).lineHeight) || 20;
        const top = rect.top + lineHeight + 5;
        const left = rect.left + this.getCursorXPosition(editor);

        this.autocompleteElement.style.top = `${top}px`;
        this.autocompleteElement.style.left = `${left}px`;

        // Create suggestion items
        this.autocompleteElement.innerHTML = '';
        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.className = `autocomplete-item ${index === 0 ? 'selected' : ''}`;
            item.textContent = suggestion;
            item.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid #eee;
                background: ${index === 0 ? '#f0f8ff' : 'white'};
            `;
            item.addEventListener('click', () => this.applySuggestion(suggestion));
            item.addEventListener('mouseenter', () => this.selectItem(index));
            this.autocompleteElement.appendChild(item);
        });

        this.autocompleteElement.style.display = 'block';
        this.isVisible = true;
    }

    hide() {
        if (this.autocompleteElement) {
            this.autocompleteElement.style.display = 'none';
        }
        this.isVisible = false;
        this.selectedIndex = -1;
    }

    selectNext() {
        if (this.selectedIndex < this.suggestions.length - 1) {
            this.selectItem(this.selectedIndex + 1);
        }
    }

    selectPrevious() {
        if (this.selectedIndex > 0) {
            this.selectItem(this.selectedIndex - 1);
        }
    }

    selectItem(index) {
        // Remove previous selection
        const items = this.autocompleteElement.querySelectorAll('.autocomplete-item');
        items.forEach(item => item.classList.remove('selected'));

        // Add new selection
        if (items[index]) {
            items[index].classList.add('selected');
            this.selectedIndex = index;
        }
    }

    applySelection() {
        if (this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length) {
            this.applySuggestion(this.suggestions[this.selectedIndex]);
        }
    }

    applySuggestion(suggestion) {
        if (!this.currentEditor) return;

        const cursorPosition = this.currentEditor.selectionStart;
        const text = this.currentEditor.value;
        const currentWord = this.getCurrentWord(text, cursorPosition);

        // Replace the current word with the suggestion
        const beforeWord = text.substring(0, cursorPosition - currentWord.length);
        const afterWord = text.substring(cursorPosition);

        this.currentEditor.value = beforeWord + suggestion + afterWord;
        this.currentEditor.selectionStart = this.currentEditor.selectionEnd =
            beforeWord.length + suggestion.length;

        this.hide();
        this.currentEditor.focus();
    }

    getCursorXPosition(editor) {
        // Approximate cursor position (simplified)
        const text = editor.value;
        const cursorPosition = editor.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPosition);

        // Rough estimation: ~8px per character
        return Math.min(textBeforeCursor.length * 8, editor.clientWidth - 200);
    }

    // HTML tags for autocomplete
    htmlTags = [
        'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'img', 'button', 'input', 'textarea', 'select', 'option',
        'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody',
        'form', 'label', 'fieldset', 'legend', 'section', 'article',
        'header', 'footer', 'nav', 'aside', 'main', 'figure', 'figcaption'
    ];

    // CSS properties for autocomplete
    cssProperties = [
        'color', 'background', 'background-color', 'margin', 'padding',
        'border', 'border-radius', 'width', 'height', 'display',
        'position', 'top', 'left', 'right', 'bottom', 'float',
        'font-size', 'font-family', 'font-weight', 'text-align',
        'line-height', 'letter-spacing', 'text-decoration', 'opacity',
        'transform', 'transition', 'animation', 'box-shadow', 'z-index',
        'overflow', 'cursor', 'visibility', 'flex', 'grid'
    ];

    // JavaScript keywords for autocomplete
    jsKeywords = [
        'function', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
        'do', 'switch', 'case', 'default', 'try', 'catch', 'finally',
        'throw', 'return', 'break', 'continue', 'class', 'extends',
        'constructor', 'super', 'this', 'new', 'typeof', 'instanceof',
        'in', 'of', 'async', 'await', 'Promise', 'setTimeout', 'setInterval',
        'addEventListener', 'querySelector', 'getElementById', 'console',
        'document', 'window', 'Math', 'Date', 'Array', 'Object', 'String'
    ];
}

// Global functions for HTML onclick handlers
function toggleDataViewer() {
    const content = document.getElementById('data-viewer-content');
    const icon = document.getElementById('data-toggle-icon');

    if (content && icon) {
        const isCollapsed = content.classList.contains('collapsed');
        if (isCollapsed) {
            content.classList.remove('collapsed');
            icon.textContent = '▼';
        } else {
            content.classList.add('collapsed');
            icon.textContent = '▶';
        }
    }
}

// Make app globally available for button onclick handlers
window.app = app;
