class PDFResizer {
  constructor() {
    this.MIN_CHAT_WIDTH = 400; // Minimum width for chat area
    this.MIN_PDF_WIDTH = 300; // Minimum width for PDF viewer
    this.SIDEBAR_COLLAPSE_THRESHOLD = 500; // Auto-collapse sidebar threshold

    this.chatArea = document.querySelector('.chat-area');
    this.chatContainer = document.getElementById('chat-container');
    this.pdfViewer = document.getElementById('pdf-viewer');
    this.resizeHandle = document.getElementById('pdf-resize-handle');
    this.resizeOverlay = document.getElementById('pdf-resize-overlay');
    this.sidebar = document.getElementById('sidebar');

    this.isDragging = false;
    this.startX = 0;
    this.startChatWidth = 0;
    this.startPdfWidth = 0;
    this.containerWidth = 0;

    this.init();
  }

  init() {
    if (!this.resizeHandle) return;

    this.resizeHandle.addEventListener('mousedown', (e) => this.startResize(e));

    if (this.resizeOverlay) {
      this.resizeOverlay.addEventListener('mousedown', (e) => this.startResize(e));
    }
    document.addEventListener('mousemove', (e) => this.resize(e));
    document.addEventListener('mouseup', () => this.stopResize());

    // Prevent text selection during resize
    this.resizeHandle.addEventListener('selectstart', (e) => e.preventDefault());
  }

  startResize(e) {
    e.preventDefault();

    if (!this.chatArea.classList.contains('pdf-open')) return;

    this.isDragging = true;
    this.startX = e.clientX;
    this.chatArea.classList.add('resizing');
    this.resizeHandle.classList.add('dragging');

    // Get current widths
    const chatRect = this.chatContainer.getBoundingClientRect();
    const pdfRect = this.pdfViewer.getBoundingClientRect();
    this.startChatWidth = chatRect.width;
    this.startPdfWidth = pdfRect.width;
    this.containerWidth = chatRect.width + pdfRect.width;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  resize(e) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.startX;
    let newChatWidth = this.startChatWidth + deltaX;
    let newPdfWidth = this.startPdfWidth - deltaX;

    // Check minimum widths
    const sidebarWidth = this.sidebar ? this.sidebar.offsetWidth : 0;
    const availableWidth = this.containerWidth;

    // Enforce minimum chat width
    if (newChatWidth < this.MIN_CHAT_WIDTH) {
      newChatWidth = this.MIN_CHAT_WIDTH;
      newPdfWidth = availableWidth - this.MIN_CHAT_WIDTH;
    }

    // Enforce minimum PDF width
    if (newPdfWidth < this.MIN_PDF_WIDTH) {
      newPdfWidth = this.MIN_PDF_WIDTH;
      newChatWidth = availableWidth - this.MIN_PDF_WIDTH;
    }

    // Calculate percentages
    const chatPercent = (newChatWidth / availableWidth) * 100;
    const pdfPercent = (newPdfWidth / availableWidth) * 100;

    // Apply widths
    this.chatContainer.style.width = `${chatPercent}%`;
    this.pdfViewer.style.width = `${pdfPercent}%`;

    // Auto-collapse sidebar if chat gets too narrow
    if (window.sidebarManager && newChatWidth < this.SIDEBAR_COLLAPSE_THRESHOLD) {
      if (window.sidebarManager.isExpanded) {
        window.sidebarManager.collapse();
      }
    }
  }

  stopResize() {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.chatArea.classList.remove('resizing');
    this.resizeHandle.classList.remove('dragging');

    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // Reset to default widths
  reset() {
    if (this.chatContainer && this.pdfViewer) {
      this.chatContainer.style.width = '';
      this.pdfViewer.style.width = '';
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.pdfResizer = new PDFResizer();
});
