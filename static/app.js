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

        if (blockId && this.activeBlocks.has(blockId)) {
            // Load existing block data
            const block = this.activeBlocks.get(blockId);
            document.getElementById('html-editor').value = block.code.html || '';
            document.getElementById('css-editor').value = block.code.css || '';
            document.getElementById('js-editor').value = block.code.javascript || '';
            document.getElementById('data-editor').value = block.code.data ? JSON.stringify(block.code.data, null, 2) : '';
            console.log(`Now editing block: ${blockId}`);
        } else {
            // Clear editors for new block
            document.getElementById('html-editor').value = '';
            document.getElementById('css-editor').value = '';
            this.currentlyEditingBlockId = null; // Not editing existing block
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
        const dataText = document.getElementById('data-editor').value;

        const blockId = this.currentBlockId || crypto.randomUUID();

        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        // Parse data if provided
        let data = null;
        if (dataText.trim()) {
            try {
                data = JSON.parse(dataText);
            } catch (error) {
                this.showError('Invalid JSON in Data/Variables field');
                return;
            }
        }

        // Send to server for execution
        this.ws.send(JSON.stringify({
            type: 'execute_content',
            blockId,
            code: { html, css, javascript, data }
        }));

        this.closeCodeEditor();
    }

    updateContentBlock() {
        if (!this.currentBlockId) return;

        const html = document.getElementById('html-editor').value;
        const css = document.getElementById('css-editor').value;
        const javascript = document.getElementById('js-editor').value;
        const dataText = document.getElementById('data-editor').value;

        if (!this.isConnected) {
            this.showError('Not connected to server');
            return;
        }

        // Parse data if provided
        let data = null;
        if (dataText.trim()) {
            try {
                data = JSON.parse(dataText);
            } catch (error) {
                this.showError('Invalid JSON in Data/Variables field');
                return;
            }
        }

        // Send update to server
        this.ws.send(JSON.stringify({
            type: 'update_content',
            blockId: this.currentBlockId,
            updates: { html, css, javascript, data }
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
                iframe.setAttribute('srcdoc', this.generateHTMLContent(result));
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
    }

    handleContentUpdated(message) {
        const { blockId, result } = message;

        if (this.activeBlocks.has(blockId)) {
            const block = this.activeBlocks.get(blockId);
            block.result = result;

            // Update the iframe content
            const iframe = document.getElementById(`block-${blockId}`);
            if (iframe) {
                iframe.setAttribute('srcdoc', this.generateHTMLContent(result));
            }
        }
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
            iframe.setAttribute('srcdoc', this.generateHTMLContent(result));
        }

        container.appendChild(blockDiv);

        // Auto-select the newly created block
        this.selectBlock(blockId);
    }

    generateHTMLContent(result) {
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
                    ${result.javascript || ''}
                </script>
            </body>
            </html>
        `;
    }

    editBlock(blockId) {
        if (this.activeBlocks.has(blockId)) {
            this.openCodeEditor(blockId);
        }
    }

    deleteBlock(blockId) {
        if (this.activeBlocks.has(blockId)) {
            this.activeBlocks.delete(blockId);
            const element = document.getElementById(`content-block-${blockId}`);
            if (element) {
                element.remove();
            }

            // Clear selection if the deleted block was selected
            if (this.selectedBlockId === blockId) {
                this.selectedBlockId = null;
            }
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

// Make app globally available for button onclick handlers
window.app = app;
