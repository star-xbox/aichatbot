class PDFViewer {
  constructor() {
    this.currentPDFUrl = null;
    this.currentPDFPage = 1;
    this.pdfViewerOpen = false;
    this.isPDFFullscreen = false;

    this.pdfLoadingElement = null;
    this.loadingStartTime = null;
    this.minLoadingTime = 800;

    this.isSwitchingPDF = false;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.createPDFLoadingElement();
  }

  createPDFLoadingElement() {
    const pdfViewer = document.getElementById('pdf-viewer');
    if (!pdfViewer) return;

    this.pdfLoadingElement = document.createElement('div');
    this.pdfLoadingElement.className = 'pdf-local-loading hidden';
    this.pdfLoadingElement.innerHTML = `
      <div class="pdf-local-spinner"></div>
      <div class="pdf-local-text">PDFを読み込み中...</div>
    `;

    const pdfContainer = pdfViewer.querySelector('.pdf-container');
    if (pdfContainer) {
      pdfContainer.appendChild(this.pdfLoadingElement);
    }
  }

  showPDFLoading() {
    this.loadingStartTime = Date.now();

    if (this.pdfLoadingElement) {
      this.pdfLoadingElement.classList.remove('hidden');
    }

    const pdfContainer = document.querySelector('.pdf-container');
    if (pdfContainer) {
      pdfContainer.style.pointerEvents = 'none';
      pdfContainer.style.opacity = '0.7';
    }

    const globalLoading = document.getElementById('pdf-loading-overlay');
    if (globalLoading) {
      globalLoading.classList.add('hidden');
    }
  }

  hidePDFLoading() {
    const elapsed = Date.now() - (this.loadingStartTime || 0);
    const remaining = Math.max(0, this.minLoadingTime - elapsed);

    setTimeout(() => {
      if (this.pdfLoadingElement) {
        this.pdfLoadingElement.classList.add('hidden');
      }

      const pdfContainer = document.querySelector('.pdf-container');
      if (pdfContainer) {
        pdfContainer.style.pointerEvents = 'auto';
        pdfContainer.style.opacity = '1';
      }

      const globalLoading = document.getElementById('pdf-loading-overlay');
      if (globalLoading) {
        globalLoading.classList.add('hidden');
      }

      this.loadingStartTime = null;
      this.isSwitchingPDF = false; 
    }, remaining);
  }

  setupEventListeners() {
    document.getElementById('pdf-open-tab-btn')?.addEventListener('click', () => {
      this.openPDFInNewTab();
    });

    document.getElementById('pdf-fullscreen-btn')?.addEventListener('click', () => {
      this.togglePDFFullscreen();
    });

    document.getElementById('pdf-close-btn')?.addEventListener('click', () => {
      this.closePDF();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isPDFFullscreen) {
        this.togglePDFFullscreen();
      }
    });
  }

  waitForPDFRendered(pdfIframe) {
    try {
      const iframeWindow = pdfIframe.contentWindow;
      const targetPage = this.currentPDFPage;

      let hasRendered = false;
      let fallbackTimer = null;

      const cleanup = () => {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        this.hidePDFLoading();
      };

      const timer = setInterval(() => {
        const app = iframeWindow?.PDFViewerApplication;

        if (app && app.eventBus) {
          clearInterval(timer);

          if (app.pdfDocument) {
            if (!hasRendered) {
              hasRendered = true;
              cleanup();
            }
          }

          app.eventBus.on('loaded', (e) => {
            if (!hasRendered) {
              hasRendered = true;
              cleanup();
            }
          });

          app.eventBus.on('pagerendered', (e) => {
            if (e.pageNumber === targetPage && !hasRendered) {
              hasRendered = true;
              cleanup();
            }
          });

          app.eventBus.on('documentloaded', (e) => {
            if (!hasRendered) {
              hasRendered = true;
              cleanup();
            }
          });

          setTimeout(() => {
            if (!hasRendered) {
              hasRendered = true;
              cleanup();
            }
          }, 3000);

          app.eventBus.on('loaderror', (err) => {
            console.error('PDF load error:', err);
            if (!hasRendered) {
              hasRendered = true;
              cleanup();
            }
            this.showNotification('PDFの読み込みに失敗しました');
          });
        }
      }, 100);

      fallbackTimer = setTimeout(() => {
        console.warn('PDF load timeout (10s)');
        if (!hasRendered) {
          hasRendered = true;
          cleanup();
        }
      }, 10000);
    } catch (e) {
      console.error('PDF viewer access error', e);
      this.hidePDFLoading();
    }
  }

  openPDF(url, page = 1, filename = '') {
    try {
      const chatArea = document.querySelector('.chat-area');
      const pdfViewer = document.getElementById('pdf-viewer');
      const pdfIframe = document.getElementById('pdf-iframe');

      if (!chatArea || !pdfViewer || !pdfIframe) {
        console.error('PDF viewer elements not found');
        return;
      }

      let fullPath = '';
      if (url.startsWith('http')) {
        fullPath = url;
      } else if (url.startsWith('/')) {
        fullPath = window.location.origin + url;
      } else {
        fullPath = BASE_PATH + '/' + url;
      }

      if (this.pdfViewerOpen && this.currentPDFUrl === fullPath && this.currentPDFPage === page) {
        return;
      }

      if (!this.pdfViewerOpen) {
        this.openNewPDF(url, page, fullPath);
        return;
      }
      this.switchPDF(url, page, fullPath);
    } catch (error) {
      console.error('Error opening PDF:', error);
      this.hidePDFLoading();
      this.showNotification('PDFを開けませんでした');
    }
  }

  openNewPDF(url, page, fullPath) {
    const chatArea = document.querySelector('.chat-area');
    const pdfViewer = document.getElementById('pdf-viewer');
    const pdfIframe = document.getElementById('pdf-iframe');

    pdfIframe.src = 'about:blank';

    setTimeout(() => {
      this.showPDFLoading();

      chatArea.classList.add('pdf-open');
      this.pdfViewerOpen = true;
      this.currentPDFUrl = fullPath;
      this.currentPDFPage = page;

      this.loadPDFIntoIframe(pdfIframe, fullPath, page);
    }, 50);
  }

  switchPDF(url, page, fullPath) {
    const pdfIframe = document.getElementById('pdf-iframe');

    this.isSwitchingPDF = true;
    this.showPDFLoading();

    this.currentPDFUrl = fullPath;
    this.currentPDFPage = page;

    this.loadPDFIntoIframe(pdfIframe, fullPath, page);
  }

  loadPDFIntoIframe(pdfIframe, fullPath, page) {
    const viewerPath = `${BASE_PATH}/static/pdfjs/web/viewer.html`;
    const fileParam = encodeURIComponent(fullPath);
    const timestamp = Date.now();
    const viewerUrl = `${viewerPath}?file=${fileParam}&t=${timestamp}#page=${page}`;

    pdfIframe.onload = null;
    pdfIframe.onerror = null;

    pdfIframe.onload = () => {
      this.waitForPDFRendered(pdfIframe);
    };

    pdfIframe.onerror = (error) => {
      console.error('Failed to load PDF iframe:', error);
      this.hidePDFLoading();
      this.showNotification('PDFの読み込みに失敗しました');
    };

    pdfIframe.src = viewerUrl;
  }

  openPDFAfterClose(url, page, fullPath) {
    const chatArea = document.querySelector('.chat-area');
    const pdfIframe = document.getElementById('pdf-iframe');

    chatArea.classList.add('pdf-open');
    this.pdfViewerOpen = true;
    this.currentPDFUrl = fullPath;
    this.currentPDFPage = page;

    this.loadPDFIntoIframe(pdfIframe, fullPath, page);
  }

  hidePDFSidebar(pdfIframe) {
    try {
      if (!pdfIframe.contentWindow || !pdfIframe.contentWindow.document) {
        return;
      }

      pdfIframe.contentWindow.postMessage(
        {
          type: 'hideSidebar',
        },
        '*',
      );

      const script = `
        <script>
          // Đợi PDF viewer khởi tạo
          if (window.PDFViewerApplication) {
            PDFViewerApplication.initializedPromise.then(() => {
              // Ẩn sidebar
              const sidebarToggle = document.getElementById('sidebarToggle');
              if (sidebarToggle && !sidebarToggle.classList.contains('toggled')) {
                sidebarToggle.click();
              }
              
              // Ẩn toolbar (nếu muốn)
              const toolbar = document.getElementById('toolbarContainer');
              if (toolbar) {
                toolbar.style.display = 'none';
              }
            });
          }
        </script>
      `;

      const doc = pdfIframe.contentWindow.document;
      const scriptElement = doc.createElement('script');
      scriptElement.textContent = script;
      doc.head.appendChild(scriptElement);
    } catch (error) {
      console.error(error);
    }
  }

  openPDFInNewTab() {
    if (this.currentPDFUrl) {
      const viewerPath = `${BASE_PATH}/static/pdfjs/web/viewer.html`;
      const fileParam = encodeURIComponent(this.currentPDFUrl);
      const viewerUrl = `${viewerPath}?file=${fileParam}#page=${this.currentPDFPage}`;
      window.open(viewerUrl, '_blank');
    } else {
      this.showNotification('表示中のPDFがありません');
    }
  }

  togglePDFFullscreen() {
    const pdfViewer = document.getElementById('pdf-viewer');
    const fullscreenBtn = document.getElementById('pdf-fullscreen-btn');

    if (!this.isPDFFullscreen) {
      pdfViewer.classList.add('fullscreen');
      this.isPDFFullscreen = true;
      fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
      fullscreenBtn.title = '全画面を終了';
    } else {
      pdfViewer.classList.remove('fullscreen');
      this.isPDFFullscreen = false;
      fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
      fullscreenBtn.title = '全画面表示';
    }
  }

  closePDF() {
    const chatArea = document.querySelector('.chat-area');
    const pdfViewer = document.getElementById('pdf-viewer');
    const pdfIframe = document.getElementById('pdf-iframe');

    if (!chatArea || !pdfViewer || !pdfIframe) return;

    if (this.isPDFFullscreen) {
      this.togglePDFFullscreen();
    }

    // Chỉ đóng khi không đang chuyển PDF
    if (!this.isSwitchingPDF) {
      chatArea.classList.remove('pdf-open');
      pdfIframe.src = '';
      this.pdfViewerOpen = false;
      this.currentPDFUrl = null;
      this.currentPDFPage = 1;
    }

    const fullscreenBtn = document.getElementById('pdf-fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
      fullscreenBtn.title = '全画面表示';
    }

    if (window.pdfResizer) {
      window.pdfResizer.reset();
    }

    this.hidePDFLoading();
    this.isSwitchingPDF = false; // Reset flag
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
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  window.pdfViewer = new PDFViewer();
});
