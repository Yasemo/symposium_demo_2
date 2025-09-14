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
        this.versionHistory = new Map(); // Store version history for each block
        this.messageVisibility = new Map(); // Track which messages are hidden
        this.messageCounter = 0; // Counter for unique message IDs

        this.init();
    }

    init() {
        this.setupWebSocket();
        this.setupEventListeners();
        this.updateConnectionStatus();
        this.restoreMessageVisibility(); // Restore message visibility state
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

                // Load available models once connected
                this.loadAvailableModels();
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
            case 'content_versions':
                this.handleContentVersions(message);
                break;
            case 'content_undone':
                this.handleContentUndone(message);
                break;
            case 'content_redone':
                this.handleContentRedone(message);
                break;
            case 'available_models':
                this.handleAvailableModels(message.models);
                break;
            case 'model_changed':
                this.handleModelChanged(message);
                break;
            case 'chat_history':
                this.handleChatHistory(message);
                break;
            case 'chat_history_cleared':
                this.handleChatHistoryCleared(message);
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

        // Clear history button
        const clearHistoryBtn = document.getElementById('clear-history-btn');
        clearHistoryBtn.addEventListener('click', () => {
            this.clearChatHistory();
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

        // Close modal when clicking outside (but not on textareas or their containers)
        const modal = document.getElementById('editor-modal');
        modal.addEventListener('click', (event) => {
            // Don't close modal if clicking on textareas, buttons, or form elements
            const target = event.target;
            const isTextarea = target.tagName === 'TEXTAREA';
            const isButton = target.tagName === 'BUTTON' || target.closest('button');
            const isFormElement = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'OPTION';
            const isModalContent = target.closest('.modal-content');

            // Only close if clicking directly on the modal backdrop
            if (event.target === modal && !isModalContent) {
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

        // Model selector functionality
        this.setupModelSelector();
    }

    // Model selector functionality
    setupModelSelector() {
        this.availableModels = [];
        // Load saved model from localStorage or use default
        this.currentModel = localStorage.getItem('symposium_selected_model') || 'openai/gpt-4o-mini';
        this.isModelDropdownOpen = false;

        const modelSelectorBtn = document.getElementById('model-selector-btn');
        const modelDropdown = document.getElementById('model-dropdown');
        const modelSearch = document.getElementById('model-search');
        const currentModelDisplay = document.getElementById('current-model');

        if (!modelSelectorBtn || !modelDropdown) return;

        // Toggle dropdown
        modelSelectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleModelDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!modelSelectorBtn.contains(e.target) && !modelDropdown.contains(e.target)) {
                this.closeModelDropdown();
            }
        });

        // Search functionality
        if (modelSearch) {
            modelSearch.addEventListener('input', (e) => {
                this.filterModels(e.target.value);
            });

            modelSearch.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeModelDropdown();
                }
            });
        }

        // Load models when connected
        if (this.ws && this.isConnected) {
            this.loadAvailableModels();
        }
    }

    toggleModelDropdown() {
        const modelDropdown = document.getElementById('model-dropdown');
        const modelSelectorBtn = document.getElementById('model-selector-btn');

        if (!modelDropdown || !modelSelectorBtn) return;

        this.isModelDropdownOpen = !this.isModelDropdownOpen;

        if (this.isModelDropdownOpen) {
            modelDropdown.classList.add('show');
            modelSelectorBtn.classList.add('active');

            // Focus search input
            const modelSearch = document.getElementById('model-search');
            if (modelSearch) {
                setTimeout(() => modelSearch.focus(), 100);
            }
        } else {
            this.closeModelDropdown();
        }
    }

    closeModelDropdown() {
        const modelDropdown = document.getElementById('model-dropdown');
        const modelSelectorBtn = document.getElementById('model-selector-btn');

        if (modelDropdown) {
            modelDropdown.classList.remove('show');
        }
        if (modelSelectorBtn) {
            modelSelectorBtn.classList.remove('active');
        }

        this.isModelDropdownOpen = false;
    }

    async loadAvailableModels() {
        if (!this.isConnected) return;

        try {
            // Request models from server
            this.ws.send(JSON.stringify({
                type: 'get_available_models'
            }));
        } catch (error) {
            console.error('Failed to request models:', error);
            this.showModelError('Failed to load models');
        }
    }

    handleAvailableModels(models) {
        this.availableModels = models || [];
        this.renderModelList(this.availableModels);

        // Check if we have a saved model preference
        const savedModelId = localStorage.getItem('symposium_selected_model');

        if (this.availableModels.length > 0) {
            let modelToSelect = null;

            // First priority: Use saved model if it exists in available models
            if (savedModelId) {
                modelToSelect = this.availableModels.find(m => m.id === savedModelId);
                if (modelToSelect) {
                    console.log(`Using saved model: ${savedModelId}`);
                } else {
                    console.log(`Saved model ${savedModelId} not available, falling back to default`);
                }
            }

            // Second priority: Use default model if no saved model or saved model not available
            if (!modelToSelect) {
                modelToSelect = this.availableModels.find(m => m.id === 'openai/gpt-4o-mini') ||
                               this.availableModels.find(m => m.id.includes('gpt-4')) ||
                               this.availableModels[0];
            }

            if (modelToSelect) {
                this.selectModel(modelToSelect);
            }
        }
    }

    renderModelList(models) {
        const modelList = document.getElementById('model-list');
        if (!modelList) return;

        if (!models || models.length === 0) {
            modelList.innerHTML = '<div class="model-error">No models available</div>';
            return;
        }

        modelList.innerHTML = '';

        models.forEach(model => {
            const modelItem = document.createElement('div');
            modelItem.className = 'model-item';
            modelItem.dataset.modelId = model.id;

            // Extract provider from model ID
            const provider = model.id.split('/')[0] || 'unknown';
            const modelName = model.name || model.id.split('/').pop() || model.id;

            // Parse pricing data - OpenRouter returns pricing per million tokens
            let pricing = '';
            if (model.pricing && model.pricing.prompt) {
                const promptPrice = typeof model.pricing.prompt === 'string'
                    ? parseFloat(model.pricing.prompt)
                    : model.pricing.prompt;

                if (!isNaN(promptPrice) && promptPrice > 0) {
                    // Convert to dollars per million tokens and format nicely
                    const pricePerMillion = promptPrice * 1000000;
                    if (pricePerMillion >= 1) {
                        pricing = `$${pricePerMillion.toFixed(2)}/M`;
                    } else if (pricePerMillion >= 0.1) {
                        pricing = `$${pricePerMillion.toFixed(3)}/M`;
                    } else {
                        pricing = `$${pricePerMillion.toFixed(4)}/M`;
                    }
                }
            }

            // Fallback for models with per_request pricing
            if (!pricing && model.per_request) {
                const perRequestPrice = typeof model.per_request === 'string'
                    ? parseFloat(model.per_request)
                    : model.per_request;

                if (!isNaN(perRequestPrice) && perRequestPrice > 0) {
                    pricing = `$${perRequestPrice.toFixed(4)}/req`;
                }
            }

            modelItem.innerHTML = `
                <div class="model-info">
                    <div class="model-name">${this.escapeHtml(modelName)}</div>
                    <div class="model-provider">${this.escapeHtml(provider)}</div>
                </div>
                ${pricing ? `<div class="model-pricing">${pricing}</div>` : ''}
            `;

            modelItem.addEventListener('click', () => {
                this.selectModel(model);
                this.closeModelDropdown();
            });

            modelList.appendChild(modelItem);
        });
    }

    filterModels(searchTerm) {
        if (!searchTerm.trim()) {
            this.renderModelList(this.availableModels);
            return;
        }

        const filtered = this.availableModels.filter(model => {
            const modelName = (model.name || model.id).toLowerCase();
            const provider = model.id.split('/')[0].toLowerCase();
            const search = searchTerm.toLowerCase();

            return modelName.includes(search) || provider.includes(search) || model.id.toLowerCase().includes(search);
        });

        this.renderModelList(filtered);
    }

    selectModel(model) {
        this.currentModel = model.id;
        const currentModelDisplay = document.getElementById('current-model');

        if (currentModelDisplay) {
            const modelName = model.name || model.id.split('/').pop() || model.id;
            currentModelDisplay.textContent = modelName;
        }

        // Update selected state in dropdown
        const modelItems = document.querySelectorAll('.model-item');
        modelItems.forEach(item => {
            item.classList.toggle('selected', item.dataset.modelId === model.id);
        });

        // Save model selection to localStorage for persistence
        try {
            localStorage.setItem('symposium_selected_model', model.id);
            console.log(`Saved model selection to localStorage: ${model.id}`);
        } catch (error) {
            console.warn('Failed to save model selection to localStorage:', error);
        }

        // Send model change to server
        if (this.isConnected) {
            this.ws.send(JSON.stringify({
                type: 'change_model',
                model: model.id
            }));
        }

        console.log(`Selected model: ${model.id}`);
    }

    showModelError(message) {
        const modelList = document.getElementById('model-list');
        if (modelList) {
            modelList.innerHTML = `<div class="model-error">${this.escapeHtml(message)}</div>`;
        }
    }

    showModelLoading() {
        const modelList = document.getElementById('model-list');
        if (modelList) {
            modelList.innerHTML = '<div class="model-loading">Loading models...</div>';
        }
    }

    handleModelChanged(message) {
        const { model, success } = message;
        if (success) {
            console.log(`Model changed to: ${model}`);
            this.currentModel = model;
        } else {
            console.error('Failed to change model:', message.error);
        }
    }

    handleChatHistory(message) {
        const { sessionId, history } = message;
        console.log(`Received chat history for session ${sessionId}: ${history.length} messages`);

        // Clear existing messages
        const messagesContainer = document.getElementById('chat-messages');
        messagesContainer.innerHTML = '';

        // Reset message counter
        this.messageCounter = 0;

        // Add each message from history
        history.forEach(chatMessage => {
            // Create message element
            const messageId = this.messageCounter++;
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${chatMessage.type}-message`;
            messageDiv.id = `message-${messageId}`;

            // Store message data for filtering
            messageDiv.dataset.messageId = messageId;
            messageDiv.dataset.sender = chatMessage.type;
            messageDiv.dataset.content = chatMessage.content;

            // Add hide/show button for both user and bot messages
            const hideButton = `
                <button class="message-hide-btn" onclick="app.toggleMessageVisibility(${messageId})" title="Hide from chat history">
                    👁️‍🗨️
                </button>
            `;

            messageDiv.innerHTML = `
                <div class="message-content">
                    ${this.escapeHtml(chatMessage.content)}
                </div>
                ${hideButton}
            `;

            messagesContainer.appendChild(messageDiv);

            // Default visibility state (all messages start as visible)
            this.messageVisibility.set(messageId, true);
        });

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        console.log(`Restored ${history.length} messages from chat history`);
    }

    handleChatHistoryCleared(message) {
        const { sessionId, success } = message;
        console.log(`Chat history cleared for session ${sessionId}: ${success ? 'success' : 'failed'}`);

        if (success) {
            // Clear messages from UI
            const messagesContainer = document.getElementById('chat-messages');
            messagesContainer.innerHTML = '';

            // Reset message counter and visibility
            this.messageCounter = 0;
            this.messageVisibility.clear();

            // Add welcome message back
            this.addChatMessage('Welcome to Symposium Demo! I can help you create interactive content blocks. Try asking me to "create a button" or "make a calculator".', 'system');

            console.log('Chat history cleared successfully');
        } else {
            this.showError('Failed to clear chat history');
        }
    }

    clearChatHistory() {
        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        if (confirm('Are you sure you want to clear all chat history? This action cannot be undone.')) {
            console.log('Clearing chat history...');

            // Send clear request to server
            this.ws.send(JSON.stringify({
                type: 'clear_chat_history',
                sessionId: 'default'
            }));
        }
    }

    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message || !this.isConnected) return;

        // Add user message to chat
        this.addChatMessage(message, 'user');
        input.value = '';

        // Get visible messages for context
        const visibleMessages = this.getVisibleMessages();

        // Prepare message data
        const messageData = {
            type: 'chat',
            text: message,
            mode: this.chatMode,
            timestamp: Date.now(),
            visibleMessages: visibleMessages // Include filtered message history
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

        console.log(`Sending message with ${visibleMessages.length} visible messages in context`);
        // Send to server
        this.ws.send(JSON.stringify(messageData));
    }

    addChatMessage(text, sender) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageId = this.messageCounter++;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.id = `message-${messageId}`;

        // Store message data for filtering
        messageDiv.dataset.messageId = messageId;
        messageDiv.dataset.sender = sender;
        messageDiv.dataset.content = text;

        // Add hide/show button for both user and bot messages
        const hideButton = `
            <button class="message-hide-btn" onclick="app.toggleMessageVisibility(${messageId})" title="Hide from chat history">
                👁️‍🗨️
            </button>
        `;

        messageDiv.innerHTML = `
            <div class="message-content">
                ${this.escapeHtml(text)}
            </div>
            ${hideButton}
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Default visibility state (all messages start as visible)
        this.messageVisibility.set(messageId, true);
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
            // For unified HTML documents, use the stored HTML directly
            document.getElementById('html-editor').value = block.code.html || '';
            console.log(`Now editing block: ${blockId}`);

            // Load stored data for this block
            this.loadBlockData(blockId);
        } else {
            // New block - provide a basic HTML template
            this.currentlyEditingBlockId = null; // Not editing existing block
            this.clearDataViewer(); // Clear data viewer for new blocks
            console.log('Creating new content block');

            // Provide a basic HTML template for new blocks
            const template = `<!DOCTYPE html>
<html>
<head>
    <title>My Content Block</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            padding: 20px;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            text-align: center;
        }

        h1 {
            margin-bottom: 20px;
            font-size: 2.5em;
        }

        button {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid white;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1.1em;
            transition: all 0.3s ease;
        }

        button:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>My Content Block</h1>
        <p>This is a basic template. Edit the HTML above to create your content!</p>
        <button onclick="alert('Hello from Symposium Demo!')">Click Me</button>
    </div>

    <script>
        // Your JavaScript code goes here
        console.log('Content block loaded!');

        // Example: Using demoAPI for persistent data
        // await demoAPI.saveData('counter', 0);
        // const count = await demoAPI.getData('counter');
    </script>
</body>
</html>`;
            document.getElementById('html-editor').value = template;
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

        const blockId = this.currentBlockId || crypto.randomUUID();

        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        // For unified HTML documents, send the complete HTML
        this.ws.send(JSON.stringify({
            type: 'execute_content',
            blockId,
            code: { html, css: '', javascript: '' } // Keep empty css/js for backward compatibility
        }));

        this.closeCodeEditor();
    }

    updateContentBlock() {
        if (!this.currentBlockId) return;

        const html = document.getElementById('html-editor').value;

        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        console.log(`📤 Sending update for block ${this.currentBlockId} - HTML: ${html.length} chars`);

        // For unified HTML documents, send the complete HTML
        this.ws.send(JSON.stringify({
            type: 'update_content',
            blockId: this.currentBlockId,
            updates: { html, css: '', javascript: '' } // Keep empty css/js for backward compatibility
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

            // Update the main content block iframe with robust method
            const mainIframe = document.getElementById(`block-${blockId}`);
            if (mainIframe) {
                this.updateIframeContent(mainIframe, result, blockId);
            }

            // Update the expand modal iframe if it's currently showing this block
            const expandModal = document.getElementById('expand-modal');
            if (expandModal && expandModal.classList.contains('show')) {
                const currentBlockId = this.getCurrentExpandBlockId();
                if (currentBlockId === blockId) {
                    // Find iframe by its original ID even when in modal
                    const expandIframe = document.getElementById(`block-${blockId}`);
                    if (expandIframe) {
                        this.updateIframeContent(expandIframe, result, blockId);
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
                    <button onclick="app.showVersionHistory('${blockId}')" title="Version History">📚</button>
                    <button onclick="app.undoBlock('${blockId}')" title="Undo">↶</button>
                    <button onclick="app.redoBlock('${blockId}')" title="Redo" id="redo-btn-${blockId}" style="display: none;">↷</button>
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
        // For unified HTML documents, use the HTML directly if it's a complete document
        if (result.html && result.html.trim().startsWith('<!DOCTYPE html>')) {
            // It's a complete HTML document, inject the demoAPI script
            const htmlContent = result.html;

            // Insert the demoAPI script before the closing </body> tag
            const demoAPIScript = `
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
                </script>
            `;

            // Replace </body> with demoAPI script + </body>
            return htmlContent.replace('</body>', demoAPIScript + '</body>');
        } else {
            // Fallback for legacy format - construct HTML from separate parts
            // Add cache-busting to force iframe re-rendering
            const cacheBust = `<!-- Cache bust: ${Date.now()} ${Math.random()} -->`;

            return `
                <!DOCTYPE html>${cacheBust}
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
                `.trim();
        }
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

        // Get the existing iframe from the main content block
        const mainIframe = document.getElementById(`block-${blockId}`);
        if (!mainIframe) {
            console.error(`❌ MODAL: Main iframe for block ${blockId} not found`);
            return;
        }

        console.log(`📦 MODAL: Moving existing iframe to modal (preserves data)`);

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
                            <!-- Existing iframe will be moved here -->
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
        }

        // Store reference to original parent for restoration
        const originalParent = mainIframe.parentNode;
        mainIframe._originalParent = originalParent;
        mainIframe._originalNextSibling = mainIframe.nextSibling;

        // Move the existing iframe to the modal
        const iframeContainer = modal.querySelector('.expand-iframe-container');
        if (iframeContainer) {
            console.log(`🔄 MODAL: Moving iframe from main view to modal`);
            iframeContainer.appendChild(mainIframe);

            // Keep original ID but add modal class for styling
            mainIframe.classList.add('in-modal');
            mainIframe.style.cssText = 'width: 100%; height: 100%; border: none; border-radius: 0;';

            console.log(`✅ MODAL: Iframe successfully moved to modal (data preserved)`);
        } else {
            console.error(`❌ MODAL: Could not find iframe container in modal`);
            return;
        }

        // Close modal when clicking outside (but not on textareas or their containers)
        modal.addEventListener('click', (e) => {
            // Don't close modal if clicking on textareas, buttons, or form elements
            const target = e.target;
            const isTextarea = target.tagName === 'TEXTAREA';
            const isButton = target.tagName === 'BUTTON' || target.closest('button');
            const isFormElement = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'OPTION';
            const isModalContent = target.closest('.modal-content');

            // Only close if clicking directly on the modal backdrop
            if (event.target === modal && !isModalContent) {
                this.closeExpandModal();
            }
        });

        console.log(`�️ MODAL: Showing modal with existing iframe`);
        modal.classList.add('show');
        console.log(`✅ MODAL: Modal show class added`);

        // Force a reflow to ensure modal is visible
        modal.offsetHeight;
        console.log(`🔄 MODAL: Forced reflow completed`);
    }

    closeExpandModal() {
        const modal = document.getElementById('expand-modal');
        if (modal) {
            // Find the iframe in the modal by class since we keep the original ID
            const iframe = modal.querySelector('.in-modal');
            if (iframe && iframe._originalParent) {
                console.log(`🔄 MODAL: Moving iframe back to original position`);

                // Remove modal class
                iframe.classList.remove('in-modal');

                // Restore original styling
                iframe.style.cssText = '';

                // Move back to original parent
                if (iframe._originalNextSibling) {
                    iframe._originalParent.insertBefore(iframe, iframe._originalNextSibling);
                } else {
                    iframe._originalParent.appendChild(iframe);
                }

                // Clean up temporary references
                delete iframe._originalParent;
                delete iframe._originalNextSibling;

                console.log(`✅ MODAL: Iframe successfully restored to main view`);
            }

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

        // If clicking the same block, deselect it
        if (this.selectedBlockId === blockId) {
            this.deselectBlock();
            return;
        }

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

    // Deselect the currently selected block
    deselectBlock() {
        if (this.selectedBlockId) {
            const element = document.getElementById(`content-block-${this.selectedBlockId}`);
            if (element) {
                element.classList.remove('selected');
            }
            console.log(`Deselected block: ${this.selectedBlockId}`);
            this.selectedBlockId = null;
        }
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

    // Handle content versions response
    handleContentVersions(message) {
        const { blockId, versions } = message;
        console.log(`Received ${versions.length} versions for block ${blockId}`);

        // Store versions in memory
        this.versionHistory.set(blockId, versions);

        // Show version history modal
        this.showVersionHistoryModal(blockId, versions);
    }

    // Handle content undone response
    handleContentUndone(message) {
        const { blockId, result, targetVersionId } = message;
        console.log(`Content block ${blockId} undone${targetVersionId ? ` to version ${targetVersionId}` : ' to previous version'}`);

        // Update the block with the undone result
        if (this.activeBlocks.has(blockId)) {
            const block = this.activeBlocks.get(blockId);
            block.result = result;
            block.code = result;

            // Update the iframe content
            const iframe = document.getElementById(`block-${blockId}`);
            if (iframe) {
                iframe.setAttribute('srcdoc', this.generateHTMLContent(result, blockId));
            }

            // Show the redo button since we can now redo this action
            const redoBtn = document.getElementById(`redo-btn-${blockId}`);
            if (redoBtn) {
                redoBtn.style.display = 'inline-block';
            }

            // Show success message
            this.showSuccess(`Block ${blockId.slice(0, 8)} has been undone`);
        }
    }

    // Handle content redone response
    handleContentRedone(message) {
        const { blockId, result } = message;
        console.log(`Content block ${blockId} redone`);

        // Update the block with the redone result
        if (this.activeBlocks.has(blockId)) {
            const block = this.activeBlocks.get(blockId);
            block.result = result;
            block.code = result;

            // Update the iframe content
            const iframe = document.getElementById(`block-${blockId}`);
            if (iframe) {
                iframe.setAttribute('srcdoc', this.generateHTMLContent(result, blockId));
            }

            // Hide the redo button since we've redone the action
            const redoBtn = document.getElementById(`redo-btn-${blockId}`);
            if (redoBtn) {
                redoBtn.style.display = 'none';
            }

            // Show success message
            this.showSuccess(`Block ${blockId.slice(0, 8)} has been redone`);
        }
    }

    // Show version history modal
    showVersionHistoryModal(blockId, versions) {
        // Create or update version history modal
        let modal = document.getElementById('version-history-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'version-history-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content version-history-modal-content">
                    <div class="modal-header">
                        <h3>Version History - Block ${blockId.slice(0, 8)}</h3>
                        <button class="close-button" onclick="app.closeVersionHistoryModal()">&times;</button>
                    </div>
                    <div class="version-history-content">
                        <div id="version-list" class="version-list">
                            <!-- Version items will be populated here -->
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeVersionHistoryModal();
                }
            });
        }

        // Populate version list
        const versionList = modal.querySelector('#version-list');
        versionList.innerHTML = '';

        versions.forEach((version, index) => {
            const versionItem = document.createElement('div');
            versionItem.className = `version-item ${index === 0 ? 'current' : ''}`;

            const date = new Date(version.timestamp).toLocaleString();
            const changeTypeLabel = this.getChangeTypeLabel(version.changeType);
            const authorLabel = version.metadata.author === 'ai' ? '🤖 AI' : '👤 User';

            versionItem.innerHTML = `
                <div class="version-header">
                    <div class="version-info">
                        <span class="version-number">v${version.versionId}</span>
                        <span class="version-date">${date}</span>
                        <span class="version-type">${changeTypeLabel}</span>
                        <span class="version-author">${authorLabel}</span>
                    </div>
                    <div class="version-actions">
                        ${index === 0 ? '<span class="current-badge">Current</span>' :
                          `<button class="restore-btn" onclick="app.restoreVersion('${blockId}', ${version.versionId})">Restore</button>`}
                    </div>
                </div>
                <div class="version-description">
                    ${version.metadata.description || 'No description'}
                </div>
            `;

            versionList.appendChild(versionItem);
        });

        modal.classList.add('show');
    }

    // Close version history modal
    closeVersionHistoryModal() {
        const modal = document.getElementById('version-history-modal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    // Get human-readable label for change type
    getChangeTypeLabel(changeType) {
        const labels = {
            'user_edit': 'User Edit',
            'ai_generated': 'AI Generated',
            'ai_modified': 'AI Modified',
            'execution': 'Executed',
            'undo': 'Undone',
            'redo': 'Redone'
        };
        return labels[changeType] || changeType;
    }

    // Restore to a specific version
    restoreVersion(blockId, versionId) {
        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        if (confirm(`Are you sure you want to restore this block to version ${versionId}?`)) {
            this.ws.send(JSON.stringify({
                type: 'undo_content_block',
                blockId: blockId,
                targetVersionId: versionId
            }));

            this.closeVersionHistoryModal();
        }
    }

    // Show success message
    showSuccess(message) {
        console.log('Success:', message);
        // You could implement a toast notification system here
        alert(`Success: ${message}`);
    }

    // Show version history for a block
    showVersionHistory(blockId) {
        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        console.log(`Requesting version history for block ${blockId}`);

        // Send request to get version history
        this.ws.send(JSON.stringify({
            type: 'get_content_versions',
            blockId: blockId
        }));
    }

    // Undo the last change for a block
    undoBlock(blockId) {
        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        if (confirm('Are you sure you want to undo the last change to this block?')) {
            console.log(`Undoing last change for block ${blockId}`);

            // Send undo request (without targetVersionId to undo to previous)
            this.ws.send(JSON.stringify({
                type: 'undo_content_block',
                blockId: blockId
            }));
        }
    }

    // Redo the last undone change for a block
    redoBlock(blockId) {
        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        console.log(`Redoing last undone change for block ${blockId}`);

        // Send redo request
        this.ws.send(JSON.stringify({
            type: 'redo_content_block',
            blockId: blockId
        }));
    }

    // Robust iframe content update method
    updateIframeContent(iframe, result, blockId) {
        if (!iframe) return;

        console.log(`🔄 Updating iframe content for block ${blockId}`);

        // Generate content with built-in cache-busting
        const htmlContent = this.generateHTMLContent(result, blockId);

        // Method 1: Try srcdoc with delay
        const setContentWithDelay = () => {
            try {
                iframe.setAttribute('srcdoc', htmlContent);
                console.log(`✅ Iframe srcdoc updated successfully for block ${blockId}`);

                // Verify content was set
                const currentSrcdoc = iframe.getAttribute('srcdoc');
                console.log(`🔍 Verification - srcdoc length:`, currentSrcdoc?.length || 0);

                if (!currentSrcdoc || currentSrcdoc.length === 0) {
                    console.warn(`⚠️ srcdoc appears to be empty, trying alternative method`);
                    // Method 2: Try data URL approach
                    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
                    iframe.src = dataUrl;
                    console.log(`🔄 Using data URL method for block ${blockId}`);
                }
            } catch (error) {
                console.error(`❌ Failed to set iframe content:`, error);
                // Method 3: Try blob URL as fallback
                try {
                    const blob = new Blob([htmlContent], { type: 'text/html' });
                    const blobUrl = URL.createObjectURL(blob);
                    iframe.src = blobUrl;
                    console.log(`🔄 Using blob URL method for block ${blockId}`);
                } catch (blobError) {
                    console.error(`❌ All content setting methods failed:`, blobError);
                }
            }
        };

        // Wait a bit for iframe to be ready, then set content
        if (iframe.contentDocument || iframe.contentWindow) {
            console.log(`⚡ Iframe ready, setting content immediately`);
            setContentWithDelay();
        } else {
            console.log(`⏳ Iframe not ready, waiting 50ms`);
            setTimeout(setContentWithDelay, 50);
        }

        // Add event listeners for success/error feedback
        const loadHandler = () => {
            console.log(`🎯 Iframe content loaded successfully for block ${blockId}`);
            // Clean up blob URL if used
            if (iframe.src && iframe.src.startsWith('blob:')) {
                URL.revokeObjectURL(iframe.src);
            }
        };

        const errorHandler = (e) => {
            console.error(`❌ Iframe content failed to load for block ${blockId}:`, e);
        };

        // Remove existing listeners and add new ones
        iframe.removeEventListener('load', loadHandler);
        iframe.removeEventListener('error', errorHandler);
        iframe.addEventListener('load', loadHandler);
        iframe.addEventListener('error', errorHandler);
    }

    // Message visibility management
    toggleMessageVisibility(messageId) {
        const currentVisibility = this.messageVisibility.get(messageId);
        const newVisibility = !currentVisibility;

        // Update visibility state
        this.messageVisibility.set(messageId, newVisibility);

        // Update UI
        const messageElement = document.getElementById(`message-${messageId}`);
        const hideButton = messageElement.querySelector('.message-hide-btn');

        if (messageElement) {
            if (newVisibility) {
                // Message is visible
                messageElement.classList.remove('message-hidden');
                hideButton.textContent = '👁️‍🗨️';
                hideButton.title = 'Hide from chat history';
            } else {
                // Message is hidden
                messageElement.classList.add('message-hidden');
                hideButton.textContent = '👁️';
                hideButton.title = 'Show in chat history';
            }
        }

        // Save visibility state to localStorage
        this.saveMessageVisibility();

        console.log(`Message ${messageId} visibility toggled to: ${newVisibility}`);
    }

    // Save message visibility state to localStorage
    saveMessageVisibility() {
        try {
            const visibilityData = {};
            for (const [messageId, isVisible] of this.messageVisibility.entries()) {
                visibilityData[messageId] = isVisible;
            }
            localStorage.setItem('symposiumMessageVisibility', JSON.stringify(visibilityData));
            console.log('Message visibility saved to localStorage');
        } catch (error) {
            console.error('Failed to save message visibility:', error);
        }
    }

    // Restore message visibility state from localStorage
    restoreMessageVisibility() {
        try {
            const savedData = localStorage.getItem('symposiumMessageVisibility');
            if (savedData) {
                const visibilityData = JSON.parse(savedData);
                for (const [messageId, isVisible] of Object.entries(visibilityData)) {
                    this.messageVisibility.set(parseInt(messageId), isVisible);
                }
                console.log('Message visibility restored from localStorage');
            }
        } catch (error) {
            console.error('Failed to restore message visibility:', error);
        }
    }

    // Get visible messages for context
    getVisibleMessages() {
        const messages = [];
        const messageElements = document.querySelectorAll('.message');

        messageElements.forEach(element => {
            const messageId = parseInt(element.dataset.messageId);
            const isVisible = this.messageVisibility.get(messageId);

            if (isVisible !== false) { // Default to visible if not set
                const sender = element.dataset.sender;
                const content = element.dataset.content;
                messages.push({
                    id: messageId,
                    sender: sender,
                    content: content
                });
            }
        });

        return messages;
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
