// chat.js - Chat functionality only (no PDF)
import { StatusAnimator } from './status-animator.js';

class ChatManager {
  constructor() {
    this.currentConversationId = null;
    this.userId = 'demo_user';
    this.resetChatState();
    this.isLoading = false;
    this.hasMessages = false;
    this.questionCounter = 1;
    this.answerCounter = 1;
    this.statusAnimator = new StatusAnimator();
    this.chatHistory = [];
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  async init() {
    this.setupEventListeners();
    this.loadUserInfo();
    this.initTooltips();
    this.loadMarkdownLibrary();

    // Load or create session
    await this.initializeSession();

    const chatContainer = document.getElementById('chat-container');
    if (chatContainer && !this.hasMessages) {
      chatContainer.classList.add('no-messages');
    }
  }

  async initializeSession() {
    await this.createNewSession();
  }

  async createNewSession() {
    try {
      const response = await fetch(BASE_PATH + '/api/conversation/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        this.currentConversationId = data.conversation_id;

        // Save to sessionStorage (tab-specific)
        sessionStorage.setItem('chat_session_id', this.currentConversationId);

        this.clearMessages();
        this.showWelcomeMessage();
        this.hasMessages = false;
        this.chatHistory = [];
        this.resetChatState();
      } else {
        throw new Error(data.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      this.showNotification('セッション作成エラー');
      // Fallback to temporary ID
      this.currentConversationId = 'temp-' + Date.now();
      sessionStorage.setItem('chat_session_id', this.currentConversationId);
    }
  }

  async loadSessionHistory(sessionId) {
    try {
      const response = await fetch(BASE_PATH + `/api/conversation/${sessionId}/history`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success && data.messages && data.messages.length > 0) {
        // Clear welcome message
        this.clearMessages();

        // Restore messages from history
        data.messages.forEach((msg) => {
          // Add question
          this.addUserMessage(msg.question, null, true);

          // Parse answer (may contain PDF metadata)
          let answerText = msg.answer;
          let pdfDetails = [];

          try {
            const parsed = JSON.parse(msg.answer);
            if (parsed.text) {
              answerText = parsed.text;
              pdfDetails = parsed.pdf_details || [];
            }
          } catch (e) {
            // answer is plain text
          }

          // Add answer with PDF info
          const metadata = {
            has_pdf: pdfDetails.length > 0,
            pdf_infos: pdfDetails.map((pdf) => ({
              name: pdf.filename,
              url: pdf.url,
              page: pdf.page,
            })),
          };

          this.addAIMessage(answerText, metadata, true);

          this.chatHistory.push({
            question: msg.question,
            answer: answerText,
          });
        });

        this.hasMessages = true;
        this.questionCounter = data.messages.length + 1;
        this.answerCounter = data.messages.length + 1;

        this.showInputContainer();
      } else {
        this.showWelcomeMessage();
      }
    } catch (error) {
      console.error('Failed to load session history:', error);
      this.showWelcomeMessage();
    }
  }

  loadMarkdownLibrary() {
    // Load marked.js for markdown parsing
    if (!window.marked) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
      script.onload = () => {
        // Configure marked for safe HTML
        marked.setOptions({
          breaks: true,
          gfm: true,
          headerIds: false,
          mangle: false,
        });
      };
      document.head.appendChild(script);
    }
  }

  setupEventListeners() {
    // Share button
    document.getElementById('share-btn').addEventListener('click', () => {
      this.shareChat();
    });

    // Send message
    document.getElementById('send-btn').addEventListener('click', () => {
      this.sendMessage();
    });

    // Chat input
    const chatInput = document.getElementById('chat-input');
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = chatInput.scrollHeight + 'px';
    });

    // Attach and Report buttons
    document.getElementById('attach-btn').addEventListener('click', () => {
      this.showNotification('ファイル添付機能は開発中です');
    });

    document.getElementById('report-btn').addEventListener('click', () => {
      this.showNotification('レポート機能は開発中です');
    });

    document.addEventListener('click', (e) => {
      // Control buttons
      if (e.target.closest('.continue-btn')) {
        this.handleContinueQuestion(e.target.closest('.continue-btn'));
      }
      if (e.target.closest('.new-btn')) {
        this.handleNewQuestion(e.target.closest('.new-btn'));
      }
      if (e.target.closest('.resolve-btn')) {
        this.handleResolveQuestion(e.target.closest('.resolve-btn'));
      }
    });
  }

  initTooltips() {
    // Only chat-related tooltips
    const chatTooltipElements = [
      // Add chat tooltip elements here if needed
    ];

    chatTooltipElements.forEach((el) => {
      if (el && el.dataset.tippyContent) {
        const instance = tippy(el, {
          content: el.dataset.tippyContent,
          placement: 'bottom',
          theme: 'sidebar',
          arrow: true,
          offset: [0, 10],
          delay: [200, 0],
        });
        this.tippyInstances.push(instance);
      }
    });
  }

  destroyTooltips() {
    this.tippyInstances.forEach((instance) => instance.destroy());
    this.tippyInstances = [];
  }

  handleContinueQuestion(button) {
    this.showInputContainer();
    this.hideCurrentButtons(button);
    const input = document.getElementById('chat-input');
    input.focus();
    this.showNotification('続けて質問する準備ができました');
  }

  async handleNewQuestion(button) {
    this.showInputContainer();
    this.hideCurrentButtons(button);

    // Close PDF if open
    if (window.pdfViewer && window.pdfViewer.pdfViewerOpen) {
      window.pdfViewer.closePDF();
    }

    await this.createNewSession();
    this.showNotification('新しいチャットを開始しました');
  }

  async handleResolveQuestion(button) {
    const messageDiv = button.closest('.message-content-wrapper');
    const resolveBtn = messageDiv.querySelector('.resolve-btn');
    const qaLogCd = messageDiv.dataset.qaLogCd;
    try {
      resolveBtn.disabled = true;
      resolveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>処理中...</span>';

      if (qaLogCd) {
        const response = await fetch(`${BASE_PATH}/api/conversation/${qaLogCd}/resolve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        const data = await response.json();

        if (!data.success) {
          console.error('Mark resolved failed:', data.error);
        }
      }

      this.hideCurrentButtons(button);
      this.showNotification('問題が解決済みとしてマークされました。');

      // Create new session after resolving
      await this.createNewSession();
      this.showInput();
    } catch (error) {
      console.error('Failed to mark as resolved:', error);
      resolveBtn.innerHTML = '<span>🟢 解決した</span>';
      resolveBtn.disabled = false;
      this.showNotification('エラーが発生しました');
    }
  }

  loadUserInfo() {
    const userInfo = window.userInfo || {
      name: 'ユーザー',
      email: 'user@example.com',
      avatar: 'U',
    };
    this.userId = userInfo.oid || userInfo.id || 'demo_user';
  }

  resetChatState() {
    this.isLoading = false;
    this.answerCounter = 1;
    this.questionCounter = 1;
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.value = QUESTION_DEFAULT || '';
      chatInput.style.height = 'auto';
    }

    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
      sendBtn.disabled = false;
    }
  }

  shareChat() {
    if (this.currentConversationId) {
      const shareUrl = window.location.origin + '/share/' + this.currentConversationId;
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => this.showNotification('チャットリンクをコピーしました'))
        .catch(() => this.showNotification('コピーに失敗しました'));
    } else {
      this.showNotification('共有するチャットがありません');
    }
  }

  removeBtnControls() {
    const btnControls = document.querySelector('.button-controls');
    if (btnControls) btnControls.remove();
  }

  updateStatus(state) {
    if (!this.statusAnimator) return;

    if (state === 'processing' || state === 'streaming') {
      this.statusAnimator.start();
    } else {
      this.statusAnimator.stop();
    }
  }

  getRecentChatHistory(limit = 5) {
    // Get last N Q&A pairs from chatHistory
    const recent = this.chatHistory.slice(-limit);
    return recent.map((item) => ({
      question: item.question,
      answer: item.answer,
    }));
  }

  async sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const question = chatInput.value.trim();

    if (!question || this.isLoading) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';

    this.addUserMessage(question);
    this.hasMessages = true;
    this.hideInputContainer();

    this.showTypingIndicator();
    this.updateStatus('processing');

    this.isLoading = true;
    document.getElementById('send-btn').disabled = true;

    try {
      // Get recent chat history (last 5 Q&A pairs)
      const chatHistory = this.getRecentChatHistory(5);
      // console.log('Chat History for context:', chatHistory);

      const response = await fetch(BASE_PATH + '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          conversation_id: this.currentConversationId,
          question: question,
          chat_history: chatHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.updateStatus('streaming');

      // Create AI message bubble for streaming
      const { messageDiv, contentDiv } = this.createAIMessageBubble();
      const wrapper = messageDiv.querySelector('.message-content-wrapper');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let fullText = '';
      let pdfMetadata = null;
      let qaLogCd = null;
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let lines = buffer.split('\n');
        buffer = lines.pop(); // giữ lại phần chưa đủ line

        for (const line of lines) {
          // console.log('Processing line:', line);
          if (!line.trim()) continue;

          // console.log('Received chunk:', chunk);
          if (line.trim() === '') continue;
          let jsonChunk = '';
          try {
            jsonChunk = JSON.parse(line);
          } catch (e) {}

          // Handle error
          if (line.startsWith('[ERROR]')) {
            fullText += '\n❌ ' + line.replace('[ERROR]', '');
            this.renderMarkdown(contentDiv, fullText);
            break;
          }

          // Handle PDF metadata
          if (line.includes('[[META]]')) {
            try {
              // console.log('Parsing metadata jsonChunk:', jsonChunk);
              var chunks = jsonChunk.data.split('[[META]]');
              // fullText += chunks[0];
              pdfMetadata = JSON.parse(chunks[1]);
            } catch (e) {
              console.error('Failed to parse metadata:', e);
            }
            continue;
          }
          if (line.includes('[[QA_LOG_CD]]')) {
            qaLogCd = line.replace('[[QA_LOG_CD]]', '');
            if (wrapper) {
              wrapper.dataset.qaLogCd = qaLogCd;
            }
            continue;
          }
          // console.log('Appending data chunk:', jsonChunk.data);
          fullText += jsonChunk.data || '';
          this.renderMarkdown(contentDiv, fullText);
        }
      }

      this.removeTypingIndicator();

      if (pdfMetadata && pdfMetadata.pdf_sources) {
        this.addPDFAttachments(contentDiv, pdfMetadata.pdf_sources);
      }

      if (qaLogCd && wrapper) {
        wrapper.dataset.qaLogCd = qaLogCd;
      }

      this.addMessageFooterAndControls(messageDiv);

      // Update chat history cache
      this.chatHistory.push({
        question: question,
        answer: fullText,
      });

      this.updateStatus('ready');
      this.scrollToBottom();
    } catch (error) {
      console.error('Failed to send message:', error);
      this.removeTypingIndicator();
      this.addAIMessage('申し訳ございません。エラーが発生しました。');
      this.updateStatus('ready');
    } finally {
      this.isLoading = false;
      document.getElementById('send-btn').disabled = false;
    }
  }

  renderMarkdown(element, text) {
    if (window.marked) {
      element.innerHTML = marked.parse(text);
    } else {
      element.innerHTML = this.simpleMarkdownParse(text);
    }
    this.scrollToBottom();
  }

  simpleMarkdownParse(text) {
    return text
      .replace(/####\s+(.*)/g, '<h4>$1</h4>')
      .replace(/###\s+(.*)/g, '<h3>$1</h3>')
      .replace(/##\s+(.*)/g, '<h2>$1</h2>')
      .replace(/#\s+(.*)/g, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^-\s+(.*)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n/g, '<br>');
  }

  addPDFAttachments(contentDiv, pdfSources) {
    if (!pdfSources || pdfSources.length === 0) return;

    const container = document.createElement('div');
    container.className = 'pdf-attachments-container';

    container.innerHTML = pdfSources
      .map(
        (pdf, index) => `
          <div class="pdf-attachment-msg"
               onclick="window.pdfViewer.openPDF('${BASE_PATH}/download/view/${pdf.filepath.replace('https://ragdimasjstorage.blob.core.windows.net/' + AZURE_BLOB_CONTAINER + '/', '')}', ${pdf.page_number || 1}, '${this.escapeHtml(pdf.filename)}')">
            <div class="pdf-icon">
              <i class="fas fa-file-pdf"></i>
              <span class="pdf-badge">${index + 1}</span>
            </div>
            <div class="pdf-details">
              <div class="pdf-filename">${this.escapeHtml(pdf.filename)}</div>
              <div class="pdf-page-info">ページ ${pdf.page_number || 1}</div>
            </div>
          </div>
        `,
      )
      .join('');

    contentDiv.appendChild(container);
  }

  addMessageFooterAndControls(messageDiv) {
    const wrapper = messageDiv.querySelector('.message-content-wrapper');
    const qaLogCd = wrapper?.dataset?.qaLogCd;
    const footer = document.createElement('div');
    footer.className = 'message-footer';
    footer.innerHTML = `
      <div class="message-actions">
        <button class="action-btn copy-btn" title="コピー" onclick="window.chatManager.copyMessage(this)">
          <i class="far fa-copy"></i>
        </button>
        <button class="action-btn like-btn" title="いいね" onclick="window.chatManager.likeMessage(this)">
          <i class="far fa-thumbs-up"></i>
        </button>
        <button class="action-btn dislike-btn" title="よくない" onclick="window.chatManager.dislikeMessage(this)">
          <i class="far fa-thumbs-down"></i>
        </button>
      </div>
      <div class="model-badge">
        <i class="fas fa-robot"></i>
        <span>Claude Sonnet 4</span>
      </div>
    `;

    const controls = document.createElement('div');
    controls.className = 'button-controls';
    controls.innerHTML = `
      <div class="button-group">
        <button class="control-btn resolve-btn">
          <span>🟢 解決した</span>
        </button>
        <button class="control-btn continue-btn">
          <span>🟠 質問を続ける</span>
        </button>
        <button class="control-btn new-btn">
          <span>🔵 新しい質問をする</span>
        </button>
      </div>
    `;

    wrapper.appendChild(footer);
    wrapper.appendChild(controls);
  }

  addUserMessage(message, qaLogCd = null, isFromHistory = false) {
    const messagesWrapper = document.getElementById('messages-wrapper');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user my-3';
    if (!isFromHistory) {
      messageDiv.style.animation = 'slideIn 0.3s ease';
    }

    if (qaLogCd) {
      messageDiv.dataset.qaLogCd = qaLogCd;
    }

    if (!isFromHistory) {
      this.removeBtnControls();
    }

    messageDiv.innerHTML = `
      <div class="message-content-wrapper" data-qa-log-cd="${qaLogCd || ''}">
        <div class="message-content">
          <div class="message-header">
            <div class="message-icon">
              <i class="fas fa-user"></i>
            </div>
            <div class="message-label">Question ${isFromHistory ? this.questionCounter - 1 : this.questionCounter}</div>
          </div>
          <div style="margin-top: 0; margin-bottom: -50px; padding-left: 38px;">${this.escapeHtml(message)}</div>
        </div>
      </div>
    `;

    messagesWrapper.appendChild(messageDiv);

    if (!isFromHistory) {
      this.questionCounter++;
      this.scrollToBottom();
    }
  }

  hideInputContainer() {
    const inputWrapper = document.querySelector('.input-container-wrapper');
    if (inputWrapper) {
      inputWrapper.classList.add('hidden');
    }
  }

  showInputContainer() {
    const inputWrapper = document.querySelector('.input-container-wrapper');
    if (inputWrapper) {
      inputWrapper.classList.remove('hidden', 'compact');
    }
  }

  hideCurrentButtons(button) {
    const messageDiv = button.closest('.message-content-wrapper');
    const controls = messageDiv.querySelector('.button-controls');
    if (controls) {
      controls.classList.add('hidden');
    }
    this.scrollToBottom();
  }

  showInput() {
    const inputWrapper = document.querySelector('.input-container-wrapper');
    if (!inputWrapper) return;

    inputWrapper.classList.remove('hidden', 'compact');

    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.focus();
    }
  }

  setLoadingToStreaming() {
    const loadingIndicator = document.getElementById('typing-indicator');
    if (loadingIndicator) {
      const processingDiv = loadingIndicator.querySelector('.processing-indicator');
      if (processingDiv) {
        processingDiv.classList.add('streaming');
      }

      const processingText = loadingIndicator.querySelector('.processing-text');
      if (processingText) {
        processingText.textContent = 'Processing your question... ⚙️';
      }
    }
  }

  showTypingIndicator() {
    const messagesWrapper = document.getElementById('messages-wrapper');
    const existingIndicator = document.getElementById('typing-indicator');

    if (existingIndicator) return;

    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';

    typingDiv.innerHTML = `
    <div class="processing-indicator">
      <div class="processing-icon">
        <i class="fas fa-robot"></i>
      </div>
      <div class="processing-spinner"></div>
      <div class="processing-text">Processing your question... ⚙️</div>
    </div>
  `;

    messagesWrapper.appendChild(typingDiv);
    this.scrollToBottom();
  }

  addAIMessage(message, metadata = {}, isFromHistory = false) {
    const messagesWrapper = document.getElementById('messages-wrapper');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';

    if (!isFromHistory) {
      messageDiv.style.animation = 'slideIn 0.3s ease';
      this.removeBtnControls();
    }

    let pdfHtml = '';
    if (metadata.has_pdf && metadata.pdf_infos && metadata.pdf_infos.length > 0) {
      const pdfs = metadata.pdf_infos;
      pdfHtml = `
        <div class="pdf-attachments-container">
          ${pdfs
            .map(
              (pdf, index) => `
              <div class="pdf-attachment-msg" 
                   onclick="window.pdfViewer.openPDF('${pdf.url}', ${pdf.page || 1}, '${this.escapeHtml(pdf.name)}')" 
                   data-pdf-index="${index}">
                <div class="pdf-icon">
                  <i class="fas fa-file-pdf"></i>
                  <span class="pdf-badge">${index + 1}</span>
                </div>
                <div class="pdf-details">
                  <div class="pdf-filename">${this.escapeHtml(pdf.name)}</div>
                  <div class="pdf-page-info">
                    <span>ページ ${pdf.page || 1}</span>
                  </div>
                </div>
              </div>
            `,
            )
            .join('')}
        </div>
      `;
    }

    const footerHtml = `
      <div class="message-footer">
        <div class="message-actions">
          <button class="action-btn copy-btn" title="コピー" onclick="window.chatManager.copyMessage(this)">
            <i class="far fa-copy"></i>
          </button>
          <button class="action-btn like-btn" title="いいね" onclick="window.chatManager.likeMessage(this)">
            <i class="far fa-thumbs-up"></i>
          </button>
          <button class="action-btn dislike-btn" title="よくない" onclick="window.chatManager.dislikeMessage(this)">
            <i class="far fa-thumbs-down"></i>
          </button>
        </div>
        <div class="model-badge">
          <i class="fas fa-robot"></i>
          <span>Claude Sonnet 4</span>
        </div>
      </div>
    `;

    const controlsHtml = isFromHistory
      ? ''
      : `
      <div class="button-controls">
        <div class="button-group">
          <button class="control-btn resolve-btn">
            <span>🟢 解決した</span>
          </button>
          <button class="control-btn continue-btn">
            <span>🟠 質問を続ける</span>
          </button>
          <button class="control-btn new-btn">
            <span>🔵 新しい質問をする</span>
          </button>
        </div>
      </div>
    `;

    messageDiv.innerHTML = `
       <div class="message-content-wrapper">
        <div class="message-content">
          <div class="message-header">
            <div class="message-icon">
              <i class="fas fa-robot"></i>
            </div>
            <div class="message-label">Answer ${isFromHistory ? this.answerCounter - 1 : this.answerCounter}</div>
          </div>
          <div style="margin-top: 0;">
            ${this.escapeHtml(message)}
            ${pdfHtml}
          </div>
        </div>
        ${footerHtml}
        ${controlsHtml}
      </div>
    `;

    messagesWrapper.appendChild(messageDiv);

    if (!isFromHistory) {
      this.answerCounter++;
      this.scrollToBottom();
    }
  }

  createAIMessageBubble() {
    const messagesWrapper = document.getElementById('messages-wrapper');

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai';
    messageDiv.style.animation = 'slideIn 0.3s ease';

    messageDiv.innerHTML = `
      <div class="message-content-wrapper">
        <div class="message-content markdown-content">
          <div class="message-header">
            <div class="message-icon">
              <i class="fas fa-robot"></i>
            </div>
            <div class="message-label">Answer ${this.answerCounter}</div>
          </div>
          <div class="answer-content"></div>
        </div>
      </div>
    `;

    this.removeBtnControls();
    messagesWrapper.appendChild(messageDiv);
    this.answerCounter++;
    this.scrollToBottom();

    return {
      messageDiv: messageDiv,
      contentDiv: messageDiv.querySelector('.answer-content'),
    };
  }

  removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  copyMessage(button) {
    const messageContent = button.closest('.message-content-wrapper').querySelector('.message-content');
    const text = messageContent.textContent.trim();

    navigator.clipboard
      .writeText(text)
      .then(() => {
        button.classList.add('active');
        this.showNotification('メッセージをコピーしました');
        setTimeout(() => button.classList.remove('active'), 2000);
      })
      .catch(() => this.showNotification('コピーに失敗しました'));
  }

  likeMessage(button) {
    button.classList.toggle('active');
    if (button.classList.contains('active')) {
      button.querySelector('i').className = 'fas fa-thumbs-up';
    } else {
      button.querySelector('i').className = 'far fa-thumbs-up';
    }
  }

  dislikeMessage(button) {
    button.classList.toggle('active');
    if (button.classList.contains('active')) {
      button.querySelector('i').className = 'fas fa-thumbs-down';
    } else {
      button.querySelector('i').className = 'far fa-thumbs-down';
    }
  }

  clearMessages() {
    const messagesWrapper = document.getElementById('messages-wrapper');
    messagesWrapper.innerHTML = '';

    // Close PDF if open
    if (window.pdfViewer && window.pdfViewer.pdfViewerOpen) {
      window.pdfViewer.closePDF();
    }
  }

  showWelcomeMessage() {
    const messagesWrapper = document.getElementById('messages-wrapper');
    const welcomeDiv = document.createElement('div');
    welcomeDiv.id = 'welcome-message';
    welcomeDiv.className = 'flex flex-col py-8';

    welcomeDiv.innerHTML = `
    <h1 class="text-3xl font-bold mb-3 text-gray-800">${WELCOME_MESSAGE}</h1>
  `;

    messagesWrapper.appendChild(welcomeDiv);
  }

  scrollToBottom() {
    const messagesContainer = document.getElementById('messages-container');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = 'fixed top-5 right-5 bg-blue-500 text-white px-5 py-3 rounded-lg shadow-lg z-50';
    notification.style.animation = 'slideInRight 0.3s ease';

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.chatManager = new ChatManager();
});
