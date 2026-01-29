class SidebarManager {
  constructor() {
    this.sidebar = document.getElementById('sidebar');
    this.sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    this.sidebarCollapseBtn = document.getElementById('sidebar-collapse-button');
    this.userInfoBtn = document.getElementById('user-info-btn');
    this.userMenu = document.getElementById('user-menu-dropdown');
    this.isExpanded = false;
    this.tippyInstances = [];
    this.init();
  }

  init() {
    // Restore sidebar state from localStorage
    const savedState = localStorage.getItem('sidebarExpanded');
    if (localStorage.getItem('sidebarExpanded') === null) {
      localStorage.setItem('sidebarExpanded', 'true');
    }

    if (savedState === 'true') {
      this.expand();
    } else {
      this.collapse();
    }

    this.setupEventListeners();
    this.loadUserInfo();
    this.initTooltips();
  }

  setupEventListeners() {
    // Sidebar toggle button in header (chỉ hiện khi sidebar đóng)
    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.expand();
      });
    }

    // Collapse button in sidebar (chỉ hiện khi sidebar mở)
    if (this.sidebarCollapseBtn) {
      this.sidebarCollapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.collapse();
      });
    }

    // User info button - toggle dropdown menu
    if (this.userInfoBtn) {
      this.userInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleUserMenu();
      });
    }

    // Close user menu when clicking outside
    document.addEventListener('click', (e) => {
      if (this.userMenu && this.userMenu.classList.contains('show') && !this.userMenu.contains(e.target) && !this.userInfoBtn.contains(e.target)) {
        this.closeUserMenu();
      }
    });

    // Settings and Logout buttons
    const settingsBtn = document.getElementById('settings-menu-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.closeUserMenu();
        this.showNotification('設定機能は開発中です');
      });
    }

    const logoutBtn = document.getElementById('logout-menu-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.closeUserMenu();
        this.showLogoutModal();
      });
    }

    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => {
        this.hideLogoutModal();
      });
    }

    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    if (modalCancelBtn) {
      modalCancelBtn.addEventListener('click', () => {
        this.hideLogoutModal();
      });
    }

    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    if (modalConfirmBtn) {
      modalConfirmBtn.addEventListener('click', () => {
        this.performLogout();
      });
    }

    // Close modal when clicking outside
    const logoutModal = document.getElementById('logout-modal');
    if (logoutModal) {
      logoutModal.addEventListener('click', (e) => {
        if (e.target.id === 'logout-modal') {
          this.hideLogoutModal();
        }
      });
    }

    // Close modal with ESC key
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('logout-modal');
      if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
        this.hideLogoutModal();
      }
    });

    // Navigation items
    this.setupNavigationListeners();
  }

  expand() {
    this.sidebar.classList.remove('sidebar-collapsed');
    this.sidebar.classList.add('sidebar-expanded');
    this.isExpanded = true;
    localStorage.setItem('sidebarExpanded', 'true');

    // Ẩn nút mở sidebar trong header
    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.style.display = 'none';
    }

    // Hiện nút đóng trong sidebar
    if (this.sidebarCollapseBtn) {
      this.sidebarCollapseBtn.style.display = 'flex';
    }
  }

  collapse() {
    this.sidebar.classList.remove('sidebar-expanded');
    this.sidebar.classList.add('sidebar-collapsed');
    this.isExpanded = false;
    localStorage.setItem('sidebarExpanded', 'false');

    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.style.display = 'flex';
    }

    if (this.sidebarCollapseBtn) {
      this.sidebarCollapseBtn.style.display = 'none';
    }

    this.closeUserMenu();
  }

  showLogoutModal() {
    this.logoutModal = document.getElementById('logout-modal');
    this.logoutModal.classList.remove('hidden');

    // Focus on cancel button for accessibility
    setTimeout(() => {
      document.getElementById('modal-cancel-btn').focus();
    }, 100);
  }

  hideLogoutModal() {
    if (this.logoutModal) {
      this.logoutModal.classList.add('hidden');
    }
  }

  performLogout() {
    this.hideLogoutModal();

    const confirmBtn = document.getElementById('modal-confirm-btn');
    const originalText = confirmBtn.textContent;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 処理中...';
    confirmBtn.disabled = true;

    // Simulate API call
    setTimeout(() => {
      window.location.href = window.BASE_PATH + '/logout';
    }, 500);
  }

  setupNavigationListeners() {
    const navButtons = {
      'new-conversation-btn': () => this.handleNewConversation(),
      // 'sidebar-logo': () => this.handleNewConversation(),
      // 'sidebar-title': () => this.handleNewConversation(),
    };

    Object.entries(navButtons).forEach(([id, handler]) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', (e) => {
          e.preventDefault();
          handler();
        });
      }
    });
  }

  initTooltips() {
    if (this.sidebarToggleBtn) {
      const instance = tippy(this.sidebarToggleBtn, {
        content: 'メニュー',
        placement: 'right',
        theme: 'sidebar',
        arrow: true,
        offset: [0, 10],
        delay: [200, 0],
      });
      this.tippyInstances.push(instance);
    }

    if (this.sidebarCollapseBtn) {
      const collapseInstance = tippy(this.sidebarCollapseBtn, {
        content: '閉じる',
        placement: 'right',
        theme: 'sidebar',
        arrow: true,
        offset: [0, 10],
        delay: [200, 0],
      });
      this.tippyInstances.push(collapseInstance);
    }

    const collapsedTooltipElements = [...document.querySelectorAll('.nav-item'), document.querySelector('.user-info-item')];

    collapsedTooltipElements.forEach((el) => {
      if (el && el.dataset.tippyContent) {
        const instance = tippy(el, {
          content: el.dataset.tippyContent,
          placement: 'right',
          theme: 'sidebar',
          arrow: true,
          offset: [0, 10],
          delay: [200, 0],
          onShow: (instance) => {
            return !this.isExpanded;
          },
        });
        this.tippyInstances.push(instance);
      }
    });
  }

  destroyTooltips() {
    this.tippyInstances.forEach((instance) => instance.destroy());
    this.tippyInstances = [];
  }

  toggleUserMenu() {
    if (this.userMenu.classList.contains('show')) {
      this.closeUserMenu();
    } else {
      this.userMenu.classList.add('show');
    }
  }

  closeUserMenu() {
    this.userMenu.classList.remove('show');
  }

  loadUserInfo() {
    const userInfo = window.userInfo || {
      name: 'ユーザー',
      email: 'user@example.com',
    };
    window.currentUser = userInfo;
  }

  handleNewConversation() {
    // This will be overridden by chat manager if exists
    if (window.chatManager && window.chatManager.startNewConversation) {
      window.chatManager.startNewConversation();
    } else {
      this.showNotification('新しいチャットを開始しました');
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
}

class DebugSettings {
  constructor() {
    this.loadSettings();

    this.setupListeners();
  }

  loadSettings() {
    // Load từ localStorage
    const model = localStorage.getItem('llm_model') || 'gpt-3.5-turbo';
    const vectorThreshold = localStorage.getItem('vector_threshold') || 0.75;
    const textThreshold = localStorage.getItem('text_threshold') || 0.65;

    // Apply to UI
    const modelSelect = document.getElementById('llm-model-select');
    const vectorSlider = document.getElementById('vector-threshold-slider');
    const vectorValue = document.getElementById('vector-threshold-value');
    const textSlider = document.getElementById('text-threshold-slider');
    const textValue = document.getElementById('text-threshold-value');

    if (modelSelect) modelSelect.value = model;
    if (vectorSlider) {
      vectorSlider.value = vectorThreshold * 100;
      if (vectorValue) vectorValue.textContent = vectorThreshold;
    }
    if (textSlider) {
      textSlider.value = textThreshold * 100;
      if (textValue) textValue.textContent = textThreshold;
    }
  }

  setupListeners() {
    // LLM Model change
    const modelSelect = document.getElementById('llm-model-select');
    if (modelSelect) {
      modelSelect.addEventListener('change', (e) => {
        localStorage.setItem('llm_model', e.target.value);
      });
    }

    // Vector threshold slider
    const vectorSlider = document.getElementById('vector-threshold-slider');
    const vectorValue = document.getElementById('vector-threshold-value');
    if (vectorSlider && vectorValue) {
      vectorSlider.addEventListener('input', (e) => {
        const value = (e.target.value / 100).toFixed(2);
        vectorValue.textContent = value;
      });

      vectorSlider.addEventListener('change', (e) => {
        const value = (e.target.value / 100).toFixed(2);
        localStorage.setItem('vector_threshold', value);
      });
    }

    // Text threshold slider
    const textSlider = document.getElementById('text-threshold-slider');
    const textValue = document.getElementById('text-threshold-value');
    if (textSlider && textValue) {
      textSlider.addEventListener('input', (e) => {
        const value = (e.target.value / 100).toFixed(2);
        textValue.textContent = value;
      });

      textSlider.addEventListener('change', (e) => {
        const value = (e.target.value / 100).toFixed(2);
        localStorage.setItem('text_threshold', value);
      });
    }
  }

  getSettings() {
    return {
      llmModel: localStorage.getItem('llm_model') || 'gpt-3.5-turbo',
      vectorThreshold: parseFloat(localStorage.getItem('vector_threshold')) || 0.75,
      textThreshold: parseFloat(localStorage.getItem('text_threshold')) || 0.65,
    };
  }
}
// Initialize sidebar on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.sidebarManager = new SidebarManager();
  window.debugSettings = new DebugSettings();
  // Add animations CSS if not already present
  if (!document.getElementById('sidebar-animations')) {
    const style = document.createElement('style');
    style.id = 'sidebar-animations';
    style.textContent = `
      @keyframes slideInRight {
        from { opacity: 0; transform: translateX(100px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes slideOutRight {
        from { opacity: 1; transform: translateX(0); }
        to { opacity: 0; transform: translateX(100px); }
      }
    `;
    document.head.appendChild(style);
  }
});
