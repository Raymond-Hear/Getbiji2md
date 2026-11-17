const API_BASE = 'https://openapi.biji.com/open/api/v1/resource';
const IS_LOCAL_ENV = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
const ENABLE_KNOWLEDGE_BASE_FILTER = true;
const STORAGE_KEYS = {
  apiKey: 'get-notes-api-key',
  clientId: 'get-notes-client-id',
  viewState: 'get-notes-view-state',
  syncGuideSeen: 'get-notes-sync-guide-seen'
};
const VIEWSTATE_DB_NAME = 'get-notes-cache';
const VIEWSTATE_DB_VERSION = 1;
const VIEWSTATE_STORE_NAME = 'kv';
const VIEWSTATE_RECORD_KEY = 'view-state';

const RATE_LIMIT_STATUS = 429;
const PAGE_SIZE = 20;
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 1500;
const REQUEST_INTERVAL_MS = 1100;
const NOTE_TYPES = {
  text: '文本笔记', audio: '录音笔记', web: '链接笔记',
  image: '图文笔记', video: '视频笔记', other: '其他笔记'
};
const DATE_PRESETS = {
  month: { label: '近一个月', months: 1 },
  quarter: { label: '近三个月', months: 3 },
  year: { label: '近一年', years: 1 }
};

const detailView = document.getElementById('detailView');
const detailStatus = document.getElementById('detailStatus');
const loadedCount = document.getElementById('loadedCount');
const visibleCount = document.getElementById('visibleCount');
const selectedCountHero = document.getElementById('selectedCountHero');
const notesContainer = document.getElementById('notesContainer');
const loadMoreContainer = document.getElementById('loadMoreContainer');
const batchActions = document.getElementById('batchActions');
const selectedCount = document.getElementById('selectedCount');
const selectFilteredNotes = document.getElementById('selectFilteredNotes');
const selectFilteredNotesLabel = document.getElementById('selectFilteredNotesLabel');
const batchDownloadBtn = document.getElementById('batchDownloadBtn');
const batchDownloadAiBtn = document.getElementById('batchDownloadAiBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const clientIdInput = document.getElementById('clientIdInput');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const clearConfigBtn = document.getElementById('clearConfigBtn');
const settingsBackBtn = document.getElementById('settingsBackBtn');
const settingsStepError = document.getElementById('settingsStepError');
const refreshBtn = document.getElementById('refreshBtn');
const statusBar = document.getElementById('statusBar');
const backBtn = document.getElementById('backBtn');
const downloadOriginalBtn = document.getElementById('downloadOriginalBtn');
const downloadAiBtn = document.getElementById('downloadAiBtn');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const resultsMeta = document.getElementById('resultsMeta');
const detailTitle = document.getElementById('detailTitle');
const detailMeta = document.getElementById('detailMeta');
const detailEmptyHint = document.getElementById('detailEmptyHint');
const originalContent = document.getElementById('originalContent');
const aiContent = document.getElementById('aiContent');
const detailContentLabels = Array.from(detailView?.querySelectorAll('.content-label') || []);
const originalContentLabel = detailContentLabels[0] || null;
const aiContentLabel = detailContentLabels[1] || null;

let filterElements = {};
let allNotes = [];
let filteredNotes = [];
let ownedKnowledgeBases = [];
let currentNoteId = null;
let keyword = '';
let hasSavedConfig = false;
let isLoadingNotes = false;
let isLoadingKnowledgeBases = false;
let knowledgeSearchKeyword = '';
let tagSearchKeyword = '';
let activeDatePreset = '';
let customDateStart = '';
let customDateEnd = '';
let activeKnowledgeBaseId = '';
let activeNoteType = '';
let syncSession = null;
let syncRunning = false;
let syncPauseRequested = false;
let syncGeneration = 0;
let syncWaitMessage = '';
let syncWaitController = null;
let requestQueue = Promise.resolve();
let nextRequestAt = 0;
let requestIntervalMs = REQUEST_INTERVAL_MS;
let viewStateSaveTimer = null;
let allScopeSnapshot = null;
let knowledgeBaseSyncState = 'idle';
let settingsStep = 0;
let syncGuideVisible = false;
let viewStateDbPromise = null;
let pendingViewStateWrite = Promise.resolve();

const activeTagFilters = new Set();
const selectedNotes = new Set();
const detailCache = new Map();

const loadState = {
  mode: 'all',
  cursor: '0',
  page: 1,
  hasMore: false,
  scopeName: '全部笔记',
  totalHint: 0
};

setupFilterLayout();

function setupFilterLayout() {
  const filtersGrid = document.querySelector('.filters-grid');
  if (!filtersGrid) return;

  filtersGrid.innerHTML = `
    <div id="ownedKnowledgeDropdown" class="filter-dropdown">
      <button id="ownedKnowledgeDropdownBtn" class="btn dropdown-trigger" type="button" aria-expanded="false">
        <span class="dropdown-label">
          <strong>我的知识库</strong>
          <span id="ownedKnowledgeDropdownLabel">配置后自动加载</span>
        </span>
        <span class="dropdown-arrow">⌄</span>
      </button>
      <div class="dropdown-panel">
        <input id="ownedKnowledgeFilterSearch" class="filter-search" type="text" aria-label="筛选知识库" placeholder="筛选知识库">
        <div id="ownedKnowledgeFilters" class="filter-options"></div>
      </div>
    </div>
    <div id="tagDropdown" class="filter-dropdown">
      <button id="tagDropdownBtn" class="btn dropdown-trigger" type="button" aria-expanded="false">
        <span class="dropdown-label">
          <strong>标签筛选</strong>
          <span id="tagDropdownLabel">加载结果后可选</span>
        </span>
        <span class="dropdown-arrow">⌄</span>
      </button>
      <div class="dropdown-panel">
        <input id="tagFilterSearch" class="filter-search" type="text" aria-label="筛选标签" placeholder="筛选标签">
        <div id="tagFilters" class="filter-options"></div>
      </div>
    </div>
    <div id="dateDropdown" class="filter-dropdown">
      <button id="dateDropdownBtn" class="btn dropdown-trigger" type="button" aria-expanded="false">
        <span class="dropdown-label">
          <strong>时间筛选</strong>
          <span id="dateDropdownLabel">全部时间</span>
        </span>
        <span class="dropdown-arrow">⌄</span>
      </button>
      <div class="dropdown-panel date-filter-panel">
        <div class="date-preset-grid" aria-label="快捷时间段">
          <button class="date-preset-btn" type="button" data-date-preset="month">近一个月</button>
          <button class="date-preset-btn" type="button" data-date-preset="quarter">近三个月</button>
          <button class="date-preset-btn" type="button" data-date-preset="year">近一年</button>
        </div>
        <p class="date-custom-title">自定义区间</p>
        <div class="date-range-fields">
          <div class="date-field">
            <label for="dateStartInput">开始日期</label>
            <input id="dateStartInput" type="date">
          </div>
          <span class="date-range-separator" aria-hidden="true">至</span>
          <div class="date-field">
            <label for="dateEndInput">结束日期</label>
            <input id="dateEndInput" type="date">
          </div>
        </div>
        <p class="date-filter-help">可以只填一边；查看某一天时，把起止日期设为同一天。</p>
        <p id="dateFilterError" class="date-filter-error" role="alert">开始日期不能晚于结束日期。</p>
      </div>
    </div>
    <div id="typeDropdown" class="filter-dropdown">
      <button id="typeDropdownBtn" class="btn dropdown-trigger" type="button" aria-expanded="false">
        <span class="dropdown-label">
          <strong>笔记类型</strong>
          <span id="typeDropdownLabel">全部类型</span>
        </span>
        <span class="dropdown-arrow">⌄</span>
      </button>
      <div class="dropdown-panel">
        <div id="typeFilters" class="filter-options"></div>
      </div>
    </div>
  `;

  statusBar?.insertAdjacentHTML('afterend', `
    <div id="syncToolbar" class="sync-toolbar" hidden aria-label="同步进度">
      <div>
        <p id="syncProgress" role="status" aria-live="polite"></p>
        <small id="syncHint"></small>
      </div>
      <div class="sync-toolbar-actions">
        <button id="syncPauseBtn" class="btn btn-secondary" type="button">暂停同步</button>
        <button id="syncResumeBtn" class="btn btn-primary" type="button" hidden>继续同步</button>
        <button id="syncFullBtn" class="btn btn-ghost" type="button" hidden>完整重新同步</button>
      </div>
    </div>
  `);

  const floatingLoader = document.createElement('div');
  floatingLoader.id = 'floatingLoader';
  floatingLoader.className = 'floating-loader';
  floatingLoader.innerHTML = `
    <span class="floating-loader-ring" aria-hidden="true"></span>
    <div id="floatingLoaderCopy" class="floating-loader-copy" role="status">正在加载…</div>
  `;
  document.body.appendChild(floatingLoader);

  filterElements = {
    ownedKnowledgeDropdown: document.getElementById('ownedKnowledgeDropdown'),
    ownedKnowledgeDropdownBtn: document.getElementById('ownedKnowledgeDropdownBtn'),
    ownedKnowledgeDropdownLabel: document.getElementById('ownedKnowledgeDropdownLabel'),
    ownedKnowledgeFilterSearch: document.getElementById('ownedKnowledgeFilterSearch'),
    ownedKnowledgeFilters: document.getElementById('ownedKnowledgeFilters'),
    tagDropdown: document.getElementById('tagDropdown'),
    tagDropdownBtn: document.getElementById('tagDropdownBtn'),
    tagDropdownLabel: document.getElementById('tagDropdownLabel'),
    tagFilterSearch: document.getElementById('tagFilterSearch'),
    tagFilters: document.getElementById('tagFilters'),
    dateDropdown: document.getElementById('dateDropdown'),
    dateDropdownBtn: document.getElementById('dateDropdownBtn'),
    dateDropdownLabel: document.getElementById('dateDropdownLabel'),
    dateStartInput: document.getElementById('dateStartInput'),
    dateEndInput: document.getElementById('dateEndInput'),
    dateFilterError: document.getElementById('dateFilterError'),
    typeDropdown: document.getElementById('typeDropdown'),
    typeDropdownBtn: document.getElementById('typeDropdownBtn'),
    typeDropdownLabel: document.getElementById('typeDropdownLabel'),
    typeFilters: document.getElementById('typeFilters'),
    syncToolbar: document.getElementById('syncToolbar'),
    syncProgress: document.getElementById('syncProgress'),
    syncHint: document.getElementById('syncHint'),
    syncPauseBtn: document.getElementById('syncPauseBtn'),
    syncResumeBtn: document.getElementById('syncResumeBtn'),
    syncFullBtn: document.getElementById('syncFullBtn'),
    activeFilters: document.getElementById('activeFilters'),
    floatingLoader: document.getElementById('floatingLoader'),
    floatingLoaderCopy: document.getElementById('floatingLoaderCopy')
  };

  if (!ENABLE_KNOWLEDGE_BASE_FILTER) {
    filterElements.ownedKnowledgeDropdown?.remove();
    filterElements.ownedKnowledgeDropdown = null;
    filterElements.ownedKnowledgeDropdownBtn = null;
    filterElements.ownedKnowledgeDropdownLabel = null;
    filterElements.ownedKnowledgeFilterSearch = null;
    filterElements.ownedKnowledgeFilters = null;
  }

  hideBottomLoadMore();
}

function hideBottomLoadMore() {
  if (!loadMoreContainer) return;
  loadMoreContainer.style.display = 'none';
  loadMoreContainer.innerHTML = '';
}

function openSettings() {
  setSettingsStep(0);
  if (settingsOverlay && !settingsOverlay.open) settingsOverlay.showModal();
}

function closeSettings() {
  settingsOverlay?.close();
  hideSettingsStepError();
}

function setSettingsStep(nextStep) {
  settingsStep = Math.max(0, Math.min(3, nextStep));
  hideSettingsStepError();
  updateSettingsWizard();
}

function updateSettingsWizard() {
  document.querySelectorAll('[data-settings-step]').forEach(element => {
    const step = Number(element.dataset.settingsStep || 0);
    const active = step === settingsStep;
    element.classList.toggle('is-active', active);
    element.setAttribute('aria-hidden', active ? 'false' : 'true');
  });

  document.querySelectorAll('[data-settings-dot]').forEach(dot => {
    const step = Number(dot.dataset.settingsDot || 0);
    dot.classList.toggle('is-active', step === settingsStep);
    dot.classList.toggle('is-done', step < settingsStep);
  });

  const settingsTitle = document.querySelector('.settings-copy h2');
  const settingsIntro = document.querySelector('.settings-copy p');
  const copyByStep = [
    ['连接得到大脑', '准备好 API Key 和 Client ID。'],
    ['填写 API Key', '从得到大脑开放平台复制。'],
    ['填写 Client ID', '在获取 API Key 的页面复制。'],
    ['确认连接信息', '连接凭证会保存在当前浏览器。']
  ];

  if (settingsTitle) settingsTitle.textContent = copyByStep[settingsStep][0];
  if (settingsIntro) settingsIntro.textContent = copyByStep[settingsStep][1];

  if (settingsBackBtn) settingsBackBtn.classList.toggle('is-hidden', settingsStep === 0);
  if (saveConfigBtn) saveConfigBtn.textContent = settingsStep === 3 ? '保存连接' : '下一步';

  if (settingsStep === 1) {
    setTimeout(() => apiKeyInput?.focus(), 0);
  } else if (settingsStep === 2) {
    setTimeout(() => clientIdInput?.focus(), 0);
  }
}

function showSettingsStepError(message) {
  if (!settingsStepError) {
    showStatus(message);
    return;
  }

  settingsStepError.textContent = message;
  settingsStepError.classList.add('visible');
}

function hideSettingsStepError() {
  settingsStepError?.classList.remove('visible');
}

function canMoveToNextSettingsStep() {
  if (settingsStep === 1 && !apiKeyInput.value.trim()) {
    showSettingsStepError('先填入 API Key，再进入下一步。');
    apiKeyInput?.focus();
    return false;
  }

  if (settingsStep === 2 && !clientIdInput.value.trim()) {
    showSettingsStepError('先填入 Client ID，再进入下一步。');
    clientIdInput?.focus();
    return false;
  }

  return true;
}

function handleSettingsPrimaryAction() {
  if (settingsStep < 3) {
    if (!canMoveToNextSettingsStep()) return;
    setSettingsStep(settingsStep + 1);
    return;
  }

  saveConfig();
}

function showStatus(message, type = 'error') {
  if (!statusBar) return;
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
}

function showFloatingLoader(message, mode = 'loading') {
  const loader = filterElements.floatingLoader;
  if (!loader) return;

  filterElements.floatingLoaderCopy.textContent = message;
  loader.classList.add('visible');
  loader.classList.toggle('success', mode === 'success');
}

function hideFloatingLoader(delay = 0) {
  const loader = filterElements.floatingLoader;
  if (!loader) return;
  window.clearTimeout(hideFloatingLoader.timerId);
  hideFloatingLoader.timerId = window.setTimeout(() => {
    loader.classList.remove('visible', 'success');
  }, delay);
}

function pulseFloatingSuccess(message) {
  showFloatingLoader(message, 'success');
  hideFloatingLoader(1200);
}


function showEmpty(title, hint, actions = []) {
  const effectiveActions = actions.length > 0
    ? actions
    : (!hasSavedConfig ? [{
      id: 'settings',
      label: '开始设置',
      variant: 'primary',
      handler: openSettings
    }] : []);

  notesContainer.innerHTML = `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(hint)}</p>
      ${effectiveActions.length ? `
        <div class="empty-actions">
          ${effectiveActions.map(action => `
            <button
              id="emptyAction_${escapeHtml(action.id)}"
              class="btn btn-${escapeHtml(action.variant || 'secondary')}"
              type="button"
            >${escapeHtml(action.label)}</button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

  effectiveActions.forEach(action => {
    document.getElementById(`emptyAction_${action.id}`)?.addEventListener('click', action.handler);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function getApiKey() {
  return localStorage.getItem(STORAGE_KEYS.apiKey) || '';
}

function getClientId() {
  return localStorage.getItem(STORAGE_KEYS.clientId) || '';
}

function saveConfigLocal(apiKey, clientId) {
  localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
  localStorage.setItem(STORAGE_KEYS.clientId, clientId);
  hasSavedConfig = true;
}

function clearConfigLocal() {
  localStorage.removeItem(STORAGE_KEYS.apiKey);
  localStorage.removeItem(STORAGE_KEYS.clientId);
  hasSavedConfig = false;
}

function hasSeenSyncGuide() {
  return localStorage.getItem(STORAGE_KEYS.syncGuideSeen) === '1';
}

function markSyncGuideSeen() {
  localStorage.setItem(STORAGE_KEYS.syncGuideSeen, '1');
}

function clearSyncGuideSeen() {
  localStorage.removeItem(STORAGE_KEYS.syncGuideSeen);
}

function hasSyncedNotes() {
  return getAllScopeNotesSource().length > 0;
}

function getSyncButtonLabel() {
  if (syncSession) return '继续同步';
  if (allScopeSnapshot?.loadState.hasMore) return '继续同步历史笔记';
  return hasSyncedNotes() ? '检查最近更新' : getFirstSyncButtonLabel();
}

function getFirstSyncButtonLabel() {
  return '同步笔记';
}

function ensureSyncGuide() {
  if (document.getElementById('syncGuidePopover')) return;

  const guide = document.createElement('div');
  guide.id = 'syncGuidePopover';
  guide.className = 'sync-guide-popover';
  guide.innerHTML = `
    <div class="sync-guide-title">同步你的笔记</div>
    <div class="sync-guide-copy">首批笔记出现后，就可以开始筛选和预览。</div>
    <div class="sync-guide-actions">
      <button id="syncGuideGoBtn" class="btn btn-primary" type="button">开始同步</button>
      <button id="syncGuideDismissBtn" class="btn btn-secondary" type="button">稍后</button>
    </div>
  `;
  document.body.appendChild(guide);

  document.getElementById('syncGuideGoBtn')?.addEventListener('click', async () => {
    hideSyncGuide({ markSeen: true });
    await refreshNotes();
  });
  document.getElementById('syncGuideDismissBtn')?.addEventListener('click', () => {
    hideSyncGuide({ markSeen: true });
  });
}

function positionSyncGuide() {
  const guide = document.getElementById('syncGuidePopover');
  if (!guide || !refreshBtn || !syncGuideVisible) return;

  const rect = refreshBtn.getBoundingClientRect();
  const guideWidth = Math.min(320, window.innerWidth - 32);
  const left = Math.max(16, Math.min(rect.right - guideWidth, window.innerWidth - guideWidth - 16));
  guide.style.top = `${rect.bottom + 12}px`;
  guide.style.left = `${left}px`;
}

function showSyncGuide() {
  if (!hasSavedConfig || hasSeenSyncGuide() || !refreshBtn) return;

  ensureSyncGuide();
  syncGuideVisible = true;
  document.getElementById('syncGuidePopover')?.classList.add('visible');
  positionSyncGuide();
}

function hideSyncGuide(options = {}) {
  const { markSeen = false } = options;
  syncGuideVisible = false;
  document.getElementById('syncGuidePopover')?.classList.remove('visible');
  if (markSeen) {
    markSyncGuideSeen();
  }
}

function cacheAllScopeSnapshot() {
  if (activeKnowledgeBaseId) return;

  allScopeSnapshot = {
    notes: Array.isArray(allNotes) ? [...allNotes] : [],
    loadState: {
      mode: loadState.mode,
      cursor: loadState.cursor,
      page: loadState.page,
      hasMore: loadState.hasMore,
      scopeName: loadState.scopeName,
      totalHint: loadState.totalHint
    }
  };
}

function restoreAllScopeSnapshot() {
  if (!allScopeSnapshot || !Array.isArray(allScopeSnapshot.notes)) {
    return false;
  }

  activeKnowledgeBaseId = '';
  replaceNotesForNewScope(allScopeSnapshot.notes);
  applyContextToLoadState(allScopeSnapshot.loadState || {
    mode: 'all',
    scopeName: '全部笔记',
    cursor: '0',
    page: 1,
    hasMore: false,
    totalHint: 0
  });
  return true;
}

function saveViewState({ immediate = false } = {}) {
  if (!hasSavedConfig) return;

  clearTimeout(viewStateSaveTimer);
  if (!immediate) {
    viewStateSaveTimer = setTimeout(() => saveViewState({ immediate: true }), 200);
    return;
  }
  viewStateSaveTimer = null;

  try {
    const payload = {
      keyword,
      activeKnowledgeBaseId,
      activeNoteType,
      syncSession,
      activeTagFilters: Array.from(activeTagFilters),
      activeDatePreset,
      customDateStart,
      customDateEnd,
      selectedNotes: Array.from(selectedNotes),
      ownedKnowledgeBases,
      allNotes,
      currentNoteId,
      loadState: {
        mode: loadState.mode,
        cursor: loadState.cursor,
        page: loadState.page,
        hasMore: loadState.hasMore,
        scopeName: loadState.scopeName,
        totalHint: loadState.totalHint
      },
      allScopeSnapshot,
      savedAt: new Date().toISOString()
    };

    queueViewStateWrite(JSON.stringify(payload));
  } catch (error) {
    console.warn('save view state failed', error);
  }
}

function clearViewState() {
  clearTimeout(viewStateSaveTimer);
  viewStateSaveTimer = null;
  localStorage.removeItem(STORAGE_KEYS.viewState);
  deleteViewStateFromIndexedDb().catch(error => {
    console.warn('clear indexedDB view state failed', error);
  });
}

async function restoreViewState() {
  let raw = '';

  try {
    raw = supportsIndexedDb() ? await readViewStateFromIndexedDb() : '';
  } catch (error) {
    console.warn('restore indexedDB view state failed', error);
  }

  if (!raw) {
    raw = localStorage.getItem(STORAGE_KEYS.viewState) || '';
    if (raw) {
      queueViewStateWrite(raw);
    }
  }

  if (!raw) {
    return false;
  }

  try {
    const payload = JSON.parse(raw);
    ownedKnowledgeBases = ENABLE_KNOWLEDGE_BASE_FILTER && Array.isArray(payload.ownedKnowledgeBases)
      ? payload.ownedKnowledgeBases
      : [];
    allNotes = Array.isArray(payload.allNotes) ? payload.allNotes : [];
    allScopeSnapshot = payload.allScopeSnapshot || null;
    keyword = typeof payload.keyword === 'string' ? payload.keyword : '';
    activeKnowledgeBaseId = ENABLE_KNOWLEDGE_BASE_FILTER && typeof payload.activeKnowledgeBaseId === 'string'
      ? payload.activeKnowledgeBaseId
      : '';
    activeNoteType = Object.prototype.hasOwnProperty.call(NOTE_TYPES, payload.activeNoteType)
      ? payload.activeNoteType : '';
    syncSession = payload.syncSession && Array.isArray(payload.syncSession.notes)
      && typeof payload.syncSession.cursor === 'string'
      ? { ...payload.syncSession, status: 'paused' } : null;
    currentNoteId = typeof payload.currentNoteId === 'string' ? payload.currentNoteId : null;

    activeTagFilters.clear();
    (Array.isArray(payload.activeTagFilters) ? payload.activeTagFilters : []).forEach(tag => activeTagFilters.add(tag));

    activeDatePreset = Object.prototype.hasOwnProperty.call(DATE_PRESETS, payload.activeDatePreset)
      ? payload.activeDatePreset
      : '';
    customDateStart = isDateInputValue(payload.customDateStart) ? payload.customDateStart : '';
    customDateEnd = isDateInputValue(payload.customDateEnd) ? payload.customDateEnd : '';
    if (activeDatePreset) {
      customDateStart = '';
      customDateEnd = '';
    } else if (customDateStart && customDateEnd && customDateStart > customDateEnd) {
      customDateStart = '';
      customDateEnd = '';
    }

    selectedNotes.clear();
    (Array.isArray(payload.selectedNotes) ? payload.selectedNotes : []).forEach(noteId => selectedNotes.add(noteId));

    applyContextToLoadState(payload.loadState || {
      mode: 'all',
      scopeName: '全部笔记',
      cursor: '0',
      page: 1,
      hasMore: false,
      totalHint: 0
    });

    if (searchInput) {
      searchInput.value = keyword;
    }

    if (!activeKnowledgeBaseId) {
      cacheAllScopeSnapshot();
    }

    const noteToRestore = currentNoteId
      ? allNotes.find(note => getNoteId(note) === currentNoteId)
      : null;

    if (noteToRestore) {
      renderNoteDetail(noteToRestore);
    } else {
      currentNoteId = null;
      fillDetailPlaceholder();
    }

    applyFilters();
    return allNotes.length > 0 || ownedKnowledgeBases.length > 0 || Boolean(syncSession);
  } catch (error) {
    console.warn('restore view state failed', error);
    clearViewState();
    return false;
  }
}

function getNoteId(note) {
  return String(note.note_id || note.id || '');
}

function getTopicEntries(note) {
  return (note.topics || [])
    .map(topic => normalizeKnowledgeBaseEntry(topic) || {
      id: String(topic?.topic_id || topic?.id || topic?.value || '').trim(),
      name: String(topic?.name || topic?.topic_name || topic?.label || '').trim()
    })
    .filter(topic => topic.name);
}

function getTopics(note) {
  return getTopicEntries(note).map(topic => topic.name);
}

function getTags(note) {
  const typeNames = new Set(Object.values(NOTE_TYPES));
  return (note.tags || []).filter(tag => !(
    tag?.type === 'system' && typeNames.has(tag.name)
  )).map(tag => typeof tag === 'string' ? tag : tag.name).filter(Boolean);
}

function getNoteType(note) {
  const raw = String(note?.note_type || '').toLowerCase();
  const systemTypes = (note?.tags || []).filter(tag => tag?.type === 'system').map(tag => tag.name);
  const shape = inferNoteShape(note);
  if (shape !== 'text') return shape;
  if (systemTypes.includes('录音笔记')) return 'audio';
  if (systemTypes.includes('链接笔记')) return 'web';
  if (systemTypes.includes('视频笔记')) return 'video';
  if (systemTypes.includes('图文笔记')) return 'image';
  return !raw || ['text', 'plain_text', 'note', '文本', '文本笔记'].includes(raw) ? 'text' : 'other';
}

function getNoteTypeLabel(note) {
  return NOTE_TYPES[getNoteType(note)];
}

function isDateInputValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day;
}

function formatDateInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeNoteDateValue(value) {
  if (typeof value === 'string') {
    const matched = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (matched && isDateInputValue(matched[1])) return matched[1];
  }

  const timestampValue = typeof value === 'string' && /^\d{10,13}$/.test(value)
    ? Number(value)
    : value;
  const numericValue = typeof timestampValue === 'number' && timestampValue < 1e12
    ? timestampValue * 1000
    : timestampValue;
  const parsed = new Date(numericValue);
  return Number.isNaN(parsed.getTime()) ? '' : formatDateInputValue(parsed);
}

function getNoteDate(note) {
  return normalizeNoteDateValue(
    note?.created_at
    || note?.createdAt
    || note?.create_time
    || note?.createTime
    || note?.published_at
    || ''
  );
}

function shiftCalendarDate(date, { months = 0, years = 0 } = {}) {
  const shifted = new Date(date.getFullYear(), date.getMonth(), 1);
  shifted.setFullYear(shifted.getFullYear() - years);
  shifted.setMonth(shifted.getMonth() - months);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(date.getDate(), lastDay));
  return shifted;
}

function getActiveDateRange() {
  if (activeDatePreset && DATE_PRESETS[activeDatePreset]) {
    const today = new Date();
    return {
      start: formatDateInputValue(shiftCalendarDate(today, DATE_PRESETS[activeDatePreset])),
      end: formatDateInputValue(today)
    };
  }

  return {
    start: customDateStart,
    end: customDateEnd
  };
}

function hasActiveDateFilter() {
  return Boolean(activeDatePreset || customDateStart || customDateEnd);
}

function formatChineseDate(value) {
  if (!isDateInputValue(value)) return value || '';
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

function getDateFilterLabel() {
  if (activeDatePreset && DATE_PRESETS[activeDatePreset]) {
    return DATE_PRESETS[activeDatePreset].label;
  }

  if (customDateStart && customDateEnd) {
    if (customDateStart === customDateEnd) return formatChineseDate(customDateStart);
    return `${formatChineseDate(customDateStart)} 至 ${formatChineseDate(customDateEnd)}`;
  }
  if (customDateStart) return `${formatChineseDate(customDateStart)}起`;
  if (customDateEnd) return `截至${formatChineseDate(customDateEnd)}`;
  return '';
}

function normalizeTextCandidate(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pickFirstTextCandidate(candidates) {
  return candidates.map(normalizeTextCandidate).find(Boolean) || '';
}

function getAttachmentTypeList(note) {
  if (!Array.isArray(note?.attachments)) return [];
  return note.attachments
    .map(item => normalizeTextCandidate(item?.type || item?.file_type || item?.mime_type))
    .filter(Boolean)
    .map(type => type.toLowerCase());
}

function inferNoteShape(note) {
  const noteType = normalizeTextCandidate(note?.note_type).toLowerCase();
  const attachmentTypes = getAttachmentTypeList(note);
  const hasAttachmentType = keyword => attachmentTypes.some(type => type.includes(keyword));
  const hasWebPayload = note?.web_page && typeof note.web_page === 'object' && Object.keys(note.web_page).length > 0;
  const hasAudioPayload = note?.audio && typeof note.audio === 'object' && Object.keys(note.audio).length > 0;
  const hasVideoPayload = note?.video && typeof note.video === 'object' && Object.keys(note.video).length > 0;

  if (hasWebPayload || ['link', 'web', 'web_page', '链接笔记'].includes(noteType) || hasAttachmentType('link')) {
    return 'web';
  }

  if (hasAudioPayload || noteType.includes('audio') || noteType.includes('voice') || noteType.includes('record') || noteType === '录音笔记' || hasAttachmentType('audio')) {
    return 'audio';
  }

  if (hasVideoPayload || noteType.includes('video') || hasAttachmentType('video')) {
    return 'video';
  }

  if (noteType === 'img_text' || noteType.includes('image') || hasAttachmentType('image')) {
    return 'image';
  }

  return 'text';
}

function getExplicitOriginalContent(note) {
  return pickFirstTextCandidate([
    note?.audio?.original,
    note?.audio?.transcript,
    note?.audio?.transcription,
    note?.audio?.text,
    note?.video?.original,
    note?.video?.transcript,
    note?.video?.transcription,
    note?.video?.text,
    note?.transcript,
    note?.transcription,
    note?.original_content,
    note?.original_text,
    note?.source_content,
    note?.source_text,
    note?.web_page?.content
  ]);
}

function getExplicitAiContent(note) {
  return pickFirstTextCandidate([
    note?.web_page?.excerpt,
    note?.ai_summary,
    note?.aiSummary,
    note?.summary,
    note?.digest,
    note?.abstract,
    note?.excerpt
  ]);
}

function getOriginalContent(note) {
  const explicitOriginal = getExplicitOriginalContent(note);
  if (explicitOriginal) return explicitOriginal;

  const shape = inferNoteShape(note);
  if (shape === 'web' || shape === 'audio' || shape === 'video') {
    return '';
  }

  return normalizeTextCandidate(note?.content);
}

function getAiContent(note) {
  const original = getOriginalContent(note);
  const shape = inferNoteShape(note);
  const candidates = [
    getExplicitAiContent(note),
    (shape === 'web' || shape === 'audio' || shape === 'video') ? note?.content : ''
  ];
  return candidates
    .map(normalizeTextCandidate)
    .find(candidate => candidate && candidate !== original) || '';
}

function getPreviewContent(note) {
  return getOriginalContent(note) || getAiContent(note) || normalizeTextCandidate(note?.content);
}

function getOriginalContentLabel(note) {
  const shape = inferNoteShape(note);
  if (shape === 'web') return '网页原文';
  if (shape === 'audio' || shape === 'video') return '文字记录';
  return '原文内容';
}

function getAiContentLabel(note) {
  return inferNoteShape(note) === 'web' ? 'AI 摘要' : 'AI 总结';
}

function syncDetailContentLabels(note) {
  if (originalContentLabel) {
    originalContentLabel.textContent = note ? getOriginalContentLabel(note) : '原文内容';
  }
  if (aiContentLabel) {
    aiContentLabel.textContent = note ? getAiContentLabel(note) : 'AI 总结';
  }
}

function getNoteImages(note) {
  const buckets = [];

  if (Array.isArray(note?.images)) {
    buckets.push(...note.images);
  }

  if (Array.isArray(note?.image_urls)) {
    buckets.push(...note.image_urls);
  }

  if (Array.isArray(note?.attachments)) {
    buckets.push(...note.attachments);
  }

  const seen = new Set();
  return buckets.map(item => {
    if (typeof item === 'string') {
      return { url: item, alt: note?.title || '图片' };
    }

    if (!item || typeof item !== 'object') {
      return null;
    }

    const type = String(item.type || item.file_type || item.mime_type || '').toLowerCase();
    const url = item.original_url
      || item.access_url
      || item.url
      || item.image_url
      || item.src
      || item.download_url
      || item.file_url
      || '';

    if (!url) return null;
    if (type && !type.includes('image') && !type.includes('jpg') && !type.includes('png') && !type.includes('webp')) {
      return null;
    }

    return {
      url,
      alt: item.name || note?.title || '图片'
    };
  }).filter(Boolean).filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function getSearchText(note) {
  return [
    note.title || '',
    note.content || '',
    note.web_page?.content || '',
    note.audio?.original || '',
    note.web_page?.excerpt || '',
    note.note_type || '',
    getTopics(note).join(' '),
    getTags(note).join(' ')
  ].join('\n').toLowerCase();
}

function buildUniqueValues(notes, getter) {
  const values = new Set();
  notes.forEach(note => getter(note).forEach(value => values.add(value)));
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function normalizeKnowledgeBaseEntry(topic) {
  if (!topic || typeof topic !== 'object') return null;

  const id = String(
    topic.topic_id
    || topic.topicId
    || topic.knowledge_id
    || topic.knowledgeId
    || topic.id
    || topic.value
    || ''
  );
  const name = String(
    topic.name
    || topic.topic_name
    || topic.topicName
    || topic.knowledge_name
    || topic.knowledgeName
    || topic.label
    || ''
  ).trim();

  if (!id || !name) {
    return null;
  }

  return { id, name };
}

function dedupeKnowledgeBases(items) {
  const byId = new Map();
  items
    .map(normalizeKnowledgeBaseEntry)
    .filter(Boolean)
    .forEach(item => {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    });

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function extractKnowledgeBaseList(resp) {
  const candidates = [
    resp?.data?.topics,
    resp?.data?.knowledges,
    resp?.data?.knowledge_bases,
    resp?.data?.knowledgeBases,
    resp?.data?.topic_list,
    resp?.data?.topicList,
    resp?.data?.knowledge_list,
    resp?.data?.knowledgeList,
    resp?.data?.list,
    resp?.data?.items,
    resp?.data,
    resp?.topics,
    resp?.list,
    resp?.items
  ];

  const list = candidates.find(Array.isArray);
  return Array.isArray(list) ? dedupeKnowledgeBases(list) : [];
}

function extractNotesList(resp) {
  const candidates = [
    resp?.data?.notes,
    resp?.data?.list,
    resp?.data?.items,
    resp?.data,
    resp?.notes,
    resp?.list,
    resp?.items
  ];
  const list = candidates.find(Array.isArray);
  return Array.isArray(list) ? list : [];
}

function extractPagedHasMore(resp, currentPage, pageCount) {
  if (typeof resp?.data?.has_more === 'boolean') return resp.data.has_more;
  if (typeof resp?.has_more === 'boolean') return resp.has_more;

  const total = Number(resp?.data?.total || resp?.total || 0);
  if (Number.isFinite(total) && total > 0) {
    return currentPage * pageCount < total;
  }

  return pageCount >= PAGE_SIZE;
}

function updateBatchActions() {
  const count = selectedNotes.size;
  if (selectedCountHero) selectedCountHero.textContent = String(count);
  selectedCount.textContent = String(count);
  batchActions.style.display = count > 0 ? 'flex' : 'none';
  updateSelectFilteredControl();
}

function updateSelectFilteredControl() {
  if (!selectFilteredNotes) return;

  const selectableIds = filteredNotes.map(getNoteId).filter(Boolean);
  const selectedInCurrentResults = selectableIds.filter(noteId => selectedNotes.has(noteId)).length;
  const hasResults = selectableIds.length > 0;

  selectFilteredNotes.disabled = !hasResults;
  selectFilteredNotes.checked = hasResults && selectedInCurrentResults === selectableIds.length;
  selectFilteredNotes.indeterminate = hasResults && selectedInCurrentResults > 0 && selectedInCurrentResults < selectableIds.length;

  if (selectFilteredNotesLabel) {
    selectFilteredNotesLabel.textContent = selectedInCurrentResults > 0
      ? `已选 ${selectedInCurrentResults}/${selectableIds.length}`
      : '选择当前结果';
  }
}

function updateSettingsButtonLabel() {
  if (!openSettingsBtn) return;
  openSettingsBtn.textContent = hasSavedConfig ? '连接设置' : '开始设置';
}

function updateClearConfigVisibility() {
  clearConfigBtn?.classList.toggle('is-hidden', !hasSavedConfig);
}

function updateDropdownLabels() {
  if (filterElements.ownedKnowledgeDropdownLabel) {
    const selected = ownedKnowledgeBases.find(item => item.id === activeKnowledgeBaseId);
    filterElements.ownedKnowledgeDropdownLabel.textContent = selected
      ? selected.name
      : (ownedKnowledgeBases.length > 0 ? '选择我的知识库' : '同步后可选择');
  }

  if (filterElements.tagDropdownLabel) {
    filterElements.tagDropdownLabel.textContent = activeTagFilters.size > 0
      ? `已选 ${activeTagFilters.size} 个标签`
      : (allNotes.length > 0 ? '从当前结果中选择标签' : '加载结果后可选');
  }

  if (filterElements.dateDropdownLabel) {
    filterElements.dateDropdownLabel.textContent = getDateFilterLabel() || '全部时间';
  }
  if (filterElements.typeDropdownLabel) {
    filterElements.typeDropdownLabel.textContent = NOTE_TYPES[activeNoteType] || '全部类型';
  }
}

function updateLoadButtons() {
  if (refreshBtn) {
    const busy = isLoadingNotes || isLoadingKnowledgeBases || syncRunning;
    refreshBtn.hidden = !hasSavedConfig;
    refreshBtn.disabled = busy;
    refreshBtn.textContent = busy ? '同步中…' : getSyncButtonLabel();
  }
  updateSyncToolbar();
}

function renderKnowledgeBaseOptions() {
  const container = filterElements.ownedKnowledgeFilters;
  if (!container) return;

  const visibleItems = ownedKnowledgeBases.filter(item => (
    !knowledgeSearchKeyword || item.name.toLowerCase().includes(knowledgeSearchKeyword.toLowerCase())
  ));

  if (!hasSavedConfig) {
    container.innerHTML = '<div class="filter-empty">先完成设置，再同步你的知识库</div>';
    return;
  }

  if (isLoadingKnowledgeBases) {
    container.innerHTML = '<div class="filter-empty">正在同步你的知识库…</div>';
    return;
  }

  if (ownedKnowledgeBases.length === 0) {
    if (knowledgeBaseSyncState === 'error') {
      container.innerHTML = `
        <div class="filter-empty">
          <div>这次没有同步到你的知识库</div>
          <button id="retryKnowledgeBasesBtn" class="btn btn-secondary" type="button" style="margin-top: 10px;">重试同步</button>
        </div>
      `;
      document.getElementById('retryKnowledgeBasesBtn')?.addEventListener('click', () => {
        loadOwnedKnowledgeBases({ preserveExisting: false, surfaceErrorInStatus: false });
      });
      return;
    }

    container.innerHTML = `
      <div class="filter-empty">
        <div>你的知识库还没有出现在这里</div>
        <button id="syncKnowledgeBasesBtn" class="btn btn-secondary" type="button" style="margin-top: 10px;">同步知识库</button>
      </div>
    `;
    document.getElementById('syncKnowledgeBasesBtn')?.addEventListener('click', () => {
      loadOwnedKnowledgeBases({ preserveExisting: false, surfaceErrorInStatus: false });
    });
    return;
  }

  if (visibleItems.length === 0) {
    container.innerHTML = '<div class="filter-empty">没有匹配的知识库</div>';
    return;
  }

  container.innerHTML = [
    `
      <button type="button" class="filter-option ${activeKnowledgeBaseId ? '' : 'is-active'}" data-knowledge-id="">
        <span class="filter-option-text">全部笔记</span>
      </button>
    `,
    ...visibleItems.map(item => `
      <button type="button" class="filter-option ${item.id === activeKnowledgeBaseId ? 'is-active' : ''}" data-knowledge-id="${escapeHtml(item.id)}">
        <span class="filter-option-text">${escapeHtml(item.name)}</span>
      </button>
    `)
  ].join('');

  container.querySelectorAll('[data-knowledge-id]').forEach(button => {
    button.addEventListener('click', async () => {
      const nextId = button.dataset.knowledgeId || '';
      if (nextId === activeKnowledgeBaseId) {
        filterElements.ownedKnowledgeDropdown?.classList.remove('open');
        return;
      }

      activeKnowledgeBaseId = nextId;
      selectedNotes.clear();
      await refreshNotesForCurrentFilters();
      filterElements.ownedKnowledgeDropdown?.classList.remove('open');
    });
  });
}

function renderTagOptions() {
  const container = filterElements.tagFilters;
  if (!container) return;

  const tags = buildUniqueValues(allNotes, getTags);
  const visibleTags = tags.filter(tag => (
    !tagSearchKeyword || tag.toLowerCase().includes(tagSearchKeyword.toLowerCase())
  ));

  if (tags.length === 0) {
    container.innerHTML = '<div class="filter-empty">加载结果后自动提取标签</div>';
    return;
  }

  if (visibleTags.length === 0) {
    container.innerHTML = '<div class="filter-empty">没有匹配的标签</div>';
    return;
  }

  container.innerHTML = visibleTags.map(tag => `
    <label class="filter-option">
      <input
        type="checkbox"
        class="filter-option-check"
        data-tag-value="${escapeHtml(tag)}"
        ${activeTagFilters.has(tag) ? 'checked' : ''}
      >
      <span class="filter-option-text">${escapeHtml(tag)}</span>
    </label>
  `).join('');

  container.querySelectorAll('[data-tag-value]').forEach(input => {
    input.addEventListener('change', () => {
      const tag = input.dataset.tagValue;
      if (activeTagFilters.has(tag)) {
        activeTagFilters.delete(tag);
      } else {
        activeTagFilters.add(tag);
      }
      applyFilters();
    });
  });
}

function renderDateOptions() {
  filterElements.dateDropdown?.querySelectorAll('[data-date-preset]').forEach(button => {
    const isActive = button.dataset.datePreset === activeDatePreset;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  if (filterElements.dateStartInput) {
    filterElements.dateStartInput.value = customDateStart;
    filterElements.dateStartInput.max = customDateEnd || '';
  }
  if (filterElements.dateEndInput) {
    filterElements.dateEndInput.value = customDateEnd;
    filterElements.dateEndInput.min = customDateStart || '';
  }
  filterElements.dateFilterError?.classList.remove('visible');
}

function renderTypeOptions() {
  const counts = new Map();
  allNotes.forEach(note => {
    const type = getNoteType(note);
    counts.set(type, (counts.get(type) || 0) + 1);
  });
  filterElements.typeFilters.innerHTML = [
    ['', '全部类型', allNotes.length],
    ...Object.entries(NOTE_TYPES).map(([type, label]) => [type, label, counts.get(type) || 0])
  ].map(([type, label, count]) => `
    <button type="button" class="filter-option type-filter-option ${activeNoteType === type ? 'is-active' : ''}"
      data-note-type="${type}" aria-pressed="${activeNoteType === type}">
      <span class="filter-option-text">${label}</span><span class="type-filter-count">${count}</span>
    </button>
  `).join('');
}

function renderActiveFilters() {
  const parts = [];
  const selectedKnowledgeBase = ownedKnowledgeBases.find(item => item.id === activeKnowledgeBaseId);

  if (keyword) {
    parts.push(renderActiveFilterChip('keyword', `搜索：${keyword}`, '', 'tag'));
  }

  if (selectedKnowledgeBase) {
    parts.push(renderActiveFilterChip('knowledge', `我的知识库：${selectedKnowledgeBase.name}`, activeKnowledgeBaseId, 'topic'));
  }

  activeTagFilters.forEach(tag => {
    parts.push(renderActiveFilterChip('tag', `标签：${tag}`, tag, 'tag'));
  });

  if (hasActiveDateFilter()) {
    parts.push(renderActiveFilterChip('date', `时间：${getDateFilterLabel()}`, '', 'topic'));
  }
  if (activeNoteType) {
    parts.push(renderActiveFilterChip('type', `类型：${NOTE_TYPES[activeNoteType]}`, '', 'topic'));
  }

  if (!parts.length) {
    filterElements.activeFilters.className = 'active-filters empty';
    filterElements.activeFilters.textContent = '还没有启用任何筛选条件';
    return;
  }

  filterElements.activeFilters.className = 'active-filters';
  filterElements.activeFilters.innerHTML = parts.join('');
  filterElements.activeFilters.querySelectorAll('[data-filter-action]').forEach(button => {
    button.addEventListener('click', () => {
      removeActiveFilter(button.dataset.filterAction, button.dataset.filterValue || '');
    });
  });
}

function renderActiveFilterChip(action, label, value, variant) {
  return `
    <button
      type="button"
      class="mini-chip ${variant} active-filter-chip"
      data-filter-action="${escapeHtml(action)}"
      data-filter-value="${escapeHtml(value)}"
      title="点击移除这个筛选"
    >
      <span>${escapeHtml(label)}</span>
      <span class="chip-remove" aria-hidden="true">×</span>
    </button>
  `;
}

async function removeActiveFilter(action, value) {
  selectedNotes.clear();

  if (action === 'keyword') {
    keyword = '';
    if (searchInput) searchInput.value = '';
    applyFilters();
    return;
  }

  if (action === 'tag') {
    activeTagFilters.delete(value);
    applyFilters();
    return;
  }


  if (action === 'date') {
    clearDateFilter();
    applyFilters();
    return;
  }
  if (action === 'type') {
    activeNoteType = '';
    applyFilters();
    return;
  }

  if (action === 'knowledge') {
    activeKnowledgeBaseId = '';

    if (restoreAllScopeSnapshot()) {
      applyFilters();
      saveViewState();
      return;
    }

    await refreshNotesForCurrentFilters();
  }
}

function renderFilters() {
  renderKnowledgeBaseOptions();
  renderTagOptions();
  renderDateOptions();
  renderTypeOptions();
  renderActiveFilters();
  updateDropdownLabels();
  updateLoadButtons();
}

function noteMatchesFilters(note) {
  const searchable = getSearchText(note);
  const tags = getTags(note);
  const matchKeyword = !keyword || searchable.includes(keyword.toLowerCase());
  const matchTags = activeTagFilters.size === 0 || Array.from(activeTagFilters).every(tag => tags.includes(tag));
  const noteDate = getNoteDate(note);
  const dateRange = getActiveDateRange();
  const matchDate = !hasActiveDateFilter() || Boolean(
    noteDate
    && (!dateRange.start || noteDate >= dateRange.start)
    && (!dateRange.end || noteDate <= dateRange.end)
  );
  const matchType = !activeNoteType || getNoteType(note) === activeNoteType;
  return matchKeyword && matchTags && matchDate && matchType;
}

function updateResultsMeta() {
  if (loadedCount) loadedCount.textContent = String(allNotes.length);
  if (visibleCount) visibleCount.textContent = String(filteredNotes.length);
  if (!hasSavedConfig) {
    resultsMeta.textContent = '';
    return;
  }

  if (allNotes.length === 0) {
    resultsMeta.textContent = isLoadingNotes ? '正在准备首批结果…' : '当前还没有加载到结果';
    return;
  }

  const scope = activeKnowledgeBaseId
    ? (ownedKnowledgeBases.find(item => item.id === activeKnowledgeBaseId)?.name || '当前知识库')
    : '全部笔记';
  const filterHint = keyword || activeTagFilters.size > 0 || hasActiveDateFilter() || activeNoteType
    ? `，当前命中 ${filteredNotes.length} 条`
    : '';

  resultsMeta.textContent = `${scope} · 已读取 ${allNotes.length} 条${filterHint}`;
}

function renderNotes() {
  if (filteredNotes.length === 0) {
    if (allNotes.length === 0) {
      showEmpty(
        hasSavedConfig ? '还没有结果' : '先完成连接设置',
        hasSavedConfig ? '当前范围还没有加载到笔记，或者知识库里暂时没有内容。' : '第一次使用时先保存 API Key 和 Client ID。',
        hasSavedConfig ? [
          {
            id: 'sync',
            label: '重新同步',
            variant: 'primary',
            handler: refreshNotes
          },
          ...(activeKnowledgeBaseId ? [{
            id: 'allNotes',
            label: '查看全部笔记',
            variant: 'secondary',
            handler: () => removeActiveFilter('knowledge', activeKnowledgeBaseId)
          }] : [])
        ] : []
      );
    } else {
      showEmpty('没有匹配结果', '换一个关键词，或者清空当前筛选条件。', [
        {
          id: 'clearFilters',
          label: '清空筛选',
          variant: 'primary',
          handler: resetFilters
        }
      ]);
    }
    updateBatchActions();
    updateResultsMeta();
    return;
  }

  const existingItems = new Map(Array.from(notesContainer.querySelectorAll('.note-item'))
    .map(item => [item.dataset.noteId, item]));
  if (existingItems.size === 0) notesContainer.replaceChildren();
  const keptIds = new Set();
  let insertionPoint = notesContainer.firstElementChild;
  filteredNotes.forEach(note => {
    const noteId = getNoteId(note);
    const tags = getTags(note);
    const topicEntries = getTopicEntries(note);
    const summary = getPreviewContent(note) || '暂无摘要内容';
    const isSelected = selectedNotes.has(noteId);

    const markup = `
      <article class="note-item ${isSelected ? 'selected' : ''}" data-note-id="${escapeHtml(noteId)}">
        <div class="note-checkbox">
          <input type="checkbox" class="note-check" aria-label="选择笔记" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="note-main">
          <div class="note-heading">
            <button class="note-title" type="button">${escapeHtml(note.title || '未标题笔记')}</button>
            <div class="note-date">${escapeHtml(getNoteDate(note))}</div>
          </div>
          <div class="note-meta">
            <button type="button" class="note-type note-type-trigger" data-note-type="${getNoteType(note)}" aria-label="只查看${getNoteTypeLabel(note)}">${getNoteTypeLabel(note)}</button>
          </div>
          ${topicEntries.length ? `<div class="note-scope-row">${topicEntries.map(topic => `<button type="button" class="topic-badge note-topic-trigger" data-topic-id="${escapeHtml(topic.id || '')}" data-topic-name="${escapeHtml(topic.name)}" aria-label="筛选 ${escapeHtml(topic.name)}">${escapeHtml(topic.name)}</button>`).join('')}</div>` : ''}
          <div class="note-summary">${escapeHtml(summary)}</div>
          <div class="tag-row">
            ${tags.map(tag => `<button type="button" class="mini-chip tag note-tag-trigger ${activeTagFilters.has(tag) ? 'is-active' : ''}" data-tag-value="${escapeHtml(tag)}" aria-label="只查看 ${escapeHtml(tag)} 标签下的笔记">${escapeHtml(tag)}</button>`).join('')}
          </div>
        </div>
        <div class="note-open" aria-hidden="true">&gt;</div>
      </article>
    `;
    let item = existingItems.get(noteId);
    if (!item || item.__noteMarkup !== markup) {
      const template = document.createElement('template');
      template.innerHTML = markup.trim();
      const nextItem = template.content.firstElementChild;
      nextItem.__noteMarkup = markup;
      if (item) {
        const wasInsertionPoint = insertionPoint === item;
        item.replaceWith(nextItem);
        if (wasInsertionPoint) insertionPoint = nextItem;
      }
      item = nextItem;
    }
    if (item !== insertionPoint) notesContainer.insertBefore(item, insertionPoint);
    insertionPoint = item.nextElementSibling;
    keptIds.add(noteId);
  });
  existingItems.forEach((item, id) => { if (!keptIds.has(id)) item.remove(); });

  updateBatchActions();
  updateResultsMeta();
}

async function filterByTopic(topicId, topicName) {
  const normalizedName = String(topicName || '').trim().toLowerCase();
  let matchedKnowledgeBase = ownedKnowledgeBases.find(item => (
    (topicId && item.id === topicId)
    || (normalizedName && item.name.toLowerCase() === normalizedName)
  ));

  if (!matchedKnowledgeBase && hasSavedConfig && knowledgeBaseSyncState !== 'loading') {
    await loadOwnedKnowledgeBases({ silent: true, preserveExisting: true, surfaceErrorInStatus: false });
    matchedKnowledgeBase = ownedKnowledgeBases.find(item => (
      (topicId && item.id === topicId)
      || (normalizedName && item.name.toLowerCase() === normalizedName)
    ));
  }

  const nextId = matchedKnowledgeBase?.id || topicId;
  if (!nextId) {
    showStatus('这个知识库暂时没有可用的筛选信息，请先同步一次我的知识库。', 'info');
    return;
  }

  if (!matchedKnowledgeBase && topicName) {
    ownedKnowledgeBases = dedupeKnowledgeBases([
      ...ownedKnowledgeBases,
      { id: nextId, name: topicName }
    ]);
  }

  if (nextId === activeKnowledgeBaseId) {
    showStatus(`已在查看：${matchedKnowledgeBase?.name || topicName || '当前知识库'}`, 'info');
    return;
  }

  activeKnowledgeBaseId = nextId;
  selectedNotes.clear();
  await refreshNotesForCurrentFilters();
  showStatus(`已筛选：${matchedKnowledgeBase?.name || topicName || '当前知识库'}`, 'success');
}

function applyFilters() {
  filteredNotes = allNotes.filter(noteMatchesFilters);
  renderFilters();
  renderNotes();
  saveViewState();
}

function toggleSelection(noteId, checked) {
  if (!noteId) return;
  if (checked) {
    selectedNotes.add(noteId);
  } else {
    selectedNotes.delete(noteId);
  }
  updateBatchActions();
  renderNotes();
  saveViewState();
}

function fillDetailPlaceholder() {
  currentNoteId = null;
  detailView?.classList.remove('has-note', 'mobile-detail-open');
  detailTitle.textContent = '';
  detailMeta.textContent = '';
  detailStatus.textContent = '';
  if (detailEmptyHint) detailEmptyHint.style.display = 'block';
  setDetailActionsEnabled(false);
  ensureDetailMediaContainer().innerHTML = '';
  syncDetailContentLabels(null);
  originalContent.textContent = '打开一条内容后，这里会显示原文。';
  originalContent.classList.add('empty');
  aiContent.textContent = '如果这条内容有 AI 总结，这里会显示对应内容。';
  aiContent.classList.add('empty');
}

function setDetailActionsEnabled(enabled) {
  [downloadOriginalBtn, downloadAiBtn].forEach(button => {
    if (!button) return;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  });
}

function renderDetailMetaChips(items) {
  return items
    .filter(Boolean)
    .map(item => `<span class="detail-meta-chip">${escapeHtml(item)}</span>`)
    .join('');
}

function ensureDetailMediaContainer() {
  let container = document.getElementById('detailMediaGrid');
  if (container) return container;

  container = document.createElement('div');
  container.id = 'detailMediaGrid';
  container.className = 'note-media-grid';
  originalContent.parentElement?.insertBefore(container, originalContent);
  return container;
}

function renderNoteDetail(note) {
  const topics = getTopics(note);
  const tags = getTags(note);
  const images = getNoteImages(note);
  const currentKnowledgeBase = activeKnowledgeBaseId
    ? ownedKnowledgeBases.find(item => item.id === activeKnowledgeBaseId)?.name || '当前知识库'
    : '全部笔记';

  detailView?.classList.add('has-note');
  detailTitle.textContent = note.title || '未标题笔记';
  detailMeta.innerHTML = renderDetailMetaChips([
    `类型：${getNoteTypeLabel(note)}`,
    getNoteDate(note) ? `日期：${getNoteDate(note)}` : '',
    `范围：${currentKnowledgeBase}`,
    topics.length ? `归属：${topics.join(' / ')}` : '',
    tags.length ? `标签：${tags.join(' / ')}` : '',
    images.length ? `${images.length} 张图片` : ''
  ]);
  if (detailEmptyHint) detailEmptyHint.style.display = 'none';
  setDetailActionsEnabled(true);

  const original = getOriginalContent(note) || '暂无原文';
  const ai = getAiContent(note) || '暂无 AI 总结';
  const mediaGrid = ensureDetailMediaContainer();
  syncDetailContentLabels(note);

  mediaGrid.innerHTML = images.map(image => `
    <a class="note-media-card" href="${escapeHtml(image.url)}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" loading="lazy">
    </a>
  `).join('');
  mediaGrid.style.display = images.length > 0 ? 'grid' : 'none';

  originalContent.textContent = original;
  originalContent.classList.toggle('empty', !getOriginalContent(note));
  aiContent.textContent = ai;
  aiContent.classList.toggle('empty', !getAiContent(note));
}

function getCurrentNote() {
  if (!currentNoteId) return null;
  return detailCache.get(currentNoteId) || allNotes.find(note => getNoteId(note) === currentNoteId) || null;
}

async function openNoteDetail(noteId) {
  if (!noteId) return;
  currentNoteId = noteId;
  saveViewState();

  const noteFromList = allNotes.find(note => getNoteId(note) === noteId);
  if (noteFromList) {
    renderNoteDetail(noteFromList);
  }

  detailStatus.textContent = '正在读取笔记详情…';

  try {
    const detail = await getCachedOrFetchDetail(noteId);
    detailCache.set(noteId, detail.note);
    const noteIndex = allNotes.findIndex(note => getNoteId(note) === noteId);
    if (noteIndex >= 0) {
      allNotes.splice(noteIndex, 1, { ...allNotes[noteIndex], ...detail.note });
      if (!activeKnowledgeBaseId) {
        cacheAllScopeSnapshot();
      }
    }
    if (currentNoteId === noteId) {
      renderNoteDetail(detail.note);
      detailStatus.textContent = '';
    }
    saveViewState();
  } catch (error) {
    if (currentNoteId === noteId) detailStatus.textContent = `读取详情失败：${error.message}`;
  }
}

async function checkConfig() {
  const apiKey = getApiKey();
  const clientId = getClientId();

  hasSavedConfig = Boolean(apiKey && clientId);

  if (apiKeyInput) {
    apiKeyInput.placeholder = hasSavedConfig ? 'API Key 已保存' : 'gk_live_xxx';
    apiKeyInput.value = '';
  }
  if (clientIdInput) {
    clientIdInput.placeholder = hasSavedConfig ? 'Client ID 已保存' : 'cli_xxx';
    clientIdInput.value = '';
  }

  updateSettingsButtonLabel();
  updateClearConfigVisibility();
  return hasSavedConfig;
}

function apiGet(path, params = {}, options = {}) {
  const request = requestQueue.catch(() => {}).then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await wait(delay, options.signal);
    if (options.shouldStop?.()) throw Object.assign(new Error('同步已暂停'), { code: 'SYNC_PAUSED' });
    try {
      return await performApiGet(path, params);
    } finally {
      nextRequestAt = Math.max(nextRequestAt, Date.now() + requestIntervalMs);
    }
  });
  requestQueue = request.catch(() => {});
  return request;
}

async function performApiGet(path, params = {}) {
  const apiKey = getApiKey();
  const clientId = getClientId();
  if (!apiKey || !clientId) {
    throw new Error('请先完成连接设置');
  }

  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
  let payload;
  try {
    response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': apiKey,
      'X-Client-ID': clientId,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    signal: controller.signal
    });
    payload = await response.json().catch(() => null);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('这次请求等待超时，进度已保留，请继续同步。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok || payload?.success === false) {
    const details = payload?.error || {};
    const reason = details.reason || '';
    const code = Number(details.code || payload?.code || 0);
    const error = new Error(details.message || `请求失败 (${response.status})`);
    error.status = response.status;
    error.reason = reason;
    error.isQuota = ['quota_day', 'quota_month'].includes(reason);
    error.isRateLimited = !error.isQuota && reason !== 'not_member'
      && (response.status === RATE_LIMIT_STATUS || code === 10202 || ['qps_global', 'qps_bucket'].includes(reason));
    const retryAfter = response.headers.get('Retry-After');
    error.retryAfterMs = retryAfter
      ? (Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()))
      : 0;
    if (error.isQuota) error.message = `${reason === 'quota_day' ? '今日' : '本月'}接口额度已用完，进度已保留，额度恢复后可以继续同步。`;
    if (reason === 'not_member') error.message = '请检查得到大脑会员权限和连接设置。';
    throw error;
  }

  if (!payload) throw new Error('接口返回内容无法读取，请稍后继续同步。');
  requestIntervalMs = Math.max(REQUEST_INTERVAL_MS, requestIntervalMs * 0.95);
  return payload;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      reject(Object.assign(new Error('同步已暂停'), { code: 'SYNC_PAUSED' }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    if (signal?.aborted) { stop(); return; }
    signal?.addEventListener('abort', stop, { once: true });
  });
}

async function withRateLimitRetry(task, label, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    retryDelayMs = RETRY_DELAY_MS
  } = options;

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    if (options.shouldStop?.()) throw Object.assign(new Error('同步已暂停'), { code: 'SYNC_PAUSED' });
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const isRateLimited = error?.isRateLimited;

      if (!isRateLimited || attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
      requestIntervalMs = Math.min(10000, Math.max(REQUEST_INTERVAL_MS, requestIntervalMs * 1.5));
      const backoff = Math.max(error.retryAfterMs || 0, retryDelayMs * (2 ** (attempt - 1)));
      nextRequestAt = Math.max(nextRequestAt, Date.now() + backoff);
      syncWaitMessage = `接口繁忙，${Math.ceil(backoff / 1000)} 秒后自动继续`;
      updateSyncToolbar();
      if (!syncRunning) showStatus(`${label}：${syncWaitMessage}`, 'info');
      await wait(backoff, options.signal);
      syncWaitMessage = '';
      updateSyncToolbar();
    }
  }

  throw lastError || new Error(`${label} 请求失败`);
}

async function getKnowledgeListPage(page = 1) {
  const resp = await withRateLimitRetry(
    () => apiGet('/knowledge/list', { page, limit: 100, page_size: 100 }),
    '我的知识库列表'
  );

  if (!resp.success) {
    throw new Error(resp.error?.message || '获取我的知识库失败');
  }

  const list = extractKnowledgeBaseList(resp);
  return {
    items: list,
    hasMore: extractPagedHasMore(resp, page, list.length)
  };
}

async function getKnowledgeList() {
  let page = 1;
  let merged = [];

  while (true) {
    const result = await getKnowledgeListPage(page);
    merged = dedupeKnowledgeBases([...merged, ...result.items]);

    if (!result.hasMore || result.items.length === 0 || page >= 25) {
      break;
    }

    page += 1;
    await wait(300);
  }

  return merged;
}

async function getKnowledgeNotes(topicId, page = 1) {
  const resp = await withRateLimitRetry(
    () => apiGet('/knowledge/notes', { topic_id: topicId, page }),
    '我的知识库笔记'
  );

  if (!resp.success) {
    throw new Error(resp.error?.message || '获取我的知识库笔记失败');
  }

  const notes = extractNotesList(resp);
  return {
    notes,
    hasMore: extractPagedHasMore(resp, page, notes.length),
    total: Number(resp?.data?.total || resp?.total || 0),
    page
  };
}

async function getNoteList(cursor = '0', limit = PAGE_SIZE, options = {}) {
  const params = { limit };
  if (cursor && cursor !== '0') {
    params.cursor = cursor;
  } else {
    params.since_id = '0';
  }

  const resp = await withRateLimitRetry(
    () => apiGet('/note/list', params, options),
    '笔记列表', options
  );

  if (!resp.success) {
    throw new Error(resp.error?.message || '获取笔记列表失败');
  }

  const notes = resp.data?.notes || [];
  const lastNote = notes[notes.length - 1] || null;
  const fallbackCursor = lastNote ? (lastNote.note_id || lastNote.id || '0') : '0';
  const nextCursor = resp.data?.cursor && resp.data.cursor !== cursor ? resp.data.cursor : fallbackCursor;

  return {
    notes,
    hasMore: Boolean(resp.data?.has_more),
    nextCursor: String(nextCursor),
    total: Number(resp?.data?.total || 0)
  };
}

async function getNoteDetail(noteId) {
  const resp = await withRateLimitRetry(
    () => apiGet('/note/detail', { id: noteId, image_quality: 'original' }),
    '笔记详情',
    { maxRetries: 2, retryDelayMs: 1200 }
  );

  if (!resp.success) {
    throw new Error(resp.error?.message || '获取笔记详情失败');
  }

  return resp.data?.note || resp.data;
}

async function getCachedOrFetchDetail(noteId) {
  const cached = detailCache.get(noteId);
  if (cached) {
    return { note: cached, fromCache: true };
  }

  const note = await getNoteDetail(noteId);
  detailCache.set(noteId, note);
  return { note, fromCache: false };
}

function mergeNotes(existingNotes, incomingNotes) {
  const merged = [...existingNotes];
  const seenIds = new Set(existingNotes.map(getNoteId).filter(Boolean));
  let addedCount = 0;

  for (const note of incomingNotes) {
    const noteId = getNoteId(note);
    if (noteId && seenIds.has(noteId)) {
      continue;
    }
    if (noteId) {
      seenIds.add(noteId);
    }
    merged.push(note);
    addedCount += 1;
  }

  return { merged, addedCount };
}



function supportsIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function getViewStateDb() {
  if (!supportsIndexedDb()) {
    return Promise.reject(new Error('indexedDB unavailable'));
  }

  if (!viewStateDbPromise) {
    viewStateDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(VIEWSTATE_DB_NAME, VIEWSTATE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(VIEWSTATE_STORE_NAME)) {
          db.createObjectStore(VIEWSTATE_STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('open indexedDB failed'));
    }).catch(error => {
      viewStateDbPromise = null;
      throw error;
    });
  }

  return viewStateDbPromise;
}

async function readViewStateFromIndexedDb() {
  const db = await getViewStateDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(VIEWSTATE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(VIEWSTATE_STORE_NAME);
    const request = store.get(VIEWSTATE_RECORD_KEY);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : '');
    request.onerror = () => reject(request.error || new Error('read indexedDB failed'));
  });
}

async function writeViewStateToIndexedDb(raw) {
  const db = await getViewStateDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(VIEWSTATE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(VIEWSTATE_STORE_NAME);
    store.put(raw, VIEWSTATE_RECORD_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('write indexedDB failed'));
    transaction.onabort = () => reject(transaction.error || new Error('write indexedDB aborted'));
  });
}

async function deleteViewStateFromIndexedDb() {
  if (!supportsIndexedDb()) return;
  const db = await getViewStateDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(VIEWSTATE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(VIEWSTATE_STORE_NAME);
    store.delete(VIEWSTATE_RECORD_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('delete indexedDB failed'));
    transaction.onabort = () => reject(transaction.error || new Error('delete indexedDB aborted'));
  });
}

function queueViewStateWrite(raw) {
  pendingViewStateWrite = pendingViewStateWrite
    .catch(() => {})
    .then(async () => {
      if (supportsIndexedDb()) {
        try {
          await writeViewStateToIndexedDb(raw);
          localStorage.removeItem(STORAGE_KEYS.viewState);
          return;
        } catch (error) {
          console.warn('indexedDB save view state failed, fallback to localStorage', error);
        }
      }

      localStorage.setItem(STORAGE_KEYS.viewState, raw);
    })
    .catch(error => {
      console.warn('save view state failed', error);
    });
}

function flushPendingViewStateWrites() {
  if (viewStateSaveTimer) saveViewState({ immediate: true });
  return pendingViewStateWrite.catch(() => {});
}

function resetLoadedNotesState() {
  allNotes = [];
  filteredNotes = [];
  selectedNotes.clear();
  detailCache.clear();
  currentNoteId = null;
  fillDetailPlaceholder();
}

function replaceNotesForNewScope(notes) {
  allNotes = Array.isArray(notes) ? notes : [];
  filteredNotes = [];
  selectedNotes.clear();
  detailCache.clear();
  currentNoteId = null;
  fillDetailPlaceholder();
}

function applyContextToLoadState(context) {
  loadState.mode = context.mode;
  loadState.scopeName = context.scopeName;
  loadState.cursor = context.cursor || '0';
  loadState.page = context.page || 1;
  loadState.hasMore = Boolean(context.hasMore);
  loadState.totalHint = context.totalHint || 0;
}

function getCurrentScopeName() {
  if (!ENABLE_KNOWLEDGE_BASE_FILTER || !activeKnowledgeBaseId) return '全部笔记';
  return ownedKnowledgeBases.find(item => item.id === activeKnowledgeBaseId)?.name || '我的知识库';
}

function getAllScopeNotesSource() {
  if (allScopeSnapshot && Array.isArray(allScopeSnapshot.notes) && allScopeSnapshot.notes.length > 0) {
    return allScopeSnapshot.notes;
  }
  return Array.isArray(allNotes) ? allNotes : [];
}

function getNotesForKnowledgeBase(notes, knowledgeBaseId) {
  if (!knowledgeBaseId) {
    return Array.isArray(notes) ? [...notes] : [];
  }

  const knowledgeBaseName = ownedKnowledgeBases.find(item => item.id === knowledgeBaseId)?.name || '';
  return (Array.isArray(notes) ? notes : []).filter(note => {
    const topics = getTopicEntries(note);
    return topics.some(topic => (
      topic.id === knowledgeBaseId
      || (knowledgeBaseName && String(topic.name || '').trim() === String(knowledgeBaseName).trim())
    ));
  });
}



async function loadOwnedKnowledgeBases(options = {}) {
  if (!ENABLE_KNOWLEDGE_BASE_FILTER) {
    ownedKnowledgeBases = [];
    activeKnowledgeBaseId = '';
    knowledgeBaseSyncState = 'idle';
    renderFilters();
    return;
  }

  const {
    silent = false,
    preserveExisting = true,
    surfaceErrorInStatus = true
  } = options;

  if (!hasSavedConfig) {
    ownedKnowledgeBases = [];
    renderFilters();
    return;
  }

  isLoadingKnowledgeBases = true;
  knowledgeBaseSyncState = 'loading';
  renderFilters();

  try {
    if (!silent) {
      showStatus('正在同步你的知识库…', 'info');
    }
    const nextKnowledgeBases = await getKnowledgeList();
    if (nextKnowledgeBases.length > 0 || !preserveExisting) {
      ownedKnowledgeBases = nextKnowledgeBases;
    }
    knowledgeBaseSyncState = ownedKnowledgeBases.length > 0 ? 'ready' : 'empty';
    if (!activeKnowledgeBaseId) {
      if (!silent) {
        showStatus(`已同步 ${ownedKnowledgeBases.length} 个知识库`, 'success');
      }
    }
    saveViewState();
  } catch (error) {
    knowledgeBaseSyncState = 'error';
    if (!silent && surfaceErrorInStatus) {
      showStatus('这次没有同步到你的知识库，请稍后再试');
    }
  } finally {
    isLoadingKnowledgeBases = false;
    renderFilters();
  }
}






async function refreshNotesForCurrentFilters() {
  if (allScopeSnapshot && Array.isArray(allScopeSnapshot.notes)) {
    allNotes = getNotesForKnowledgeBase(allScopeSnapshot.notes, activeKnowledgeBaseId);
    applyContextToLoadState({
      ...allScopeSnapshot.loadState,
      mode: activeKnowledgeBaseId ? 'owned-knowledge' : 'all',
      scopeName: getCurrentScopeName()
    });
    applyFilters();
    return true;
  }
  await runSyncSession();
  return Boolean(allScopeSnapshot);
}



async function refreshNotes() {
  await runSyncSession();
}

function updateSyncToolbar() {
  const elements = filterElements;
  if (!elements.syncToolbar) return;
  elements.syncToolbar.hidden = !syncSession && !hasSyncedNotes();
  elements.syncPauseBtn.hidden = !syncRunning;
  elements.syncPauseBtn.disabled = syncPauseRequested;
  elements.syncPauseBtn.textContent = syncPauseRequested ? '正在暂停…' : '暂停同步';
  elements.syncResumeBtn.hidden = syncRunning || !syncSession;
  elements.syncFullBtn.hidden = !hasSyncedNotes() || Boolean(syncSession) || syncRunning;
  const count = syncSession?.notes.length || getAllScopeNotesSource().length;
  elements.syncProgress.textContent = syncSession
    ? `${syncSession.mode === 'recent' ? '检查近期变化' : '同步笔记'} · 已读取 ${count} 条${syncRunning ? '' : ' · 已暂停'}`
    : `已整理 ${count} 条笔记${allScopeSnapshot?.loadState.hasMore ? ' · 历史笔记尚未同步完' : ''}`;
  elements.syncHint.textContent = syncWaitMessage || syncSession?.error
    || (syncSession && !syncRunning ? '进度已保存在当前浏览器，继续同步会接着读取。' : '');
}

function pauseSyncSession() {
  if (!syncRunning) return;
  syncPauseRequested = true;
  syncWaitController?.abort();
  updateSyncToolbar();
}

function syncNoteFingerprint(note) {
  return JSON.stringify([note.updated_at, note.title, note.content, note.note_type, note.tags, note.topics]);
}

function publishSyncNotes(notes, { complete = false } = {}) {
  const previous = getAllScopeNotesSource();
  const byId = new Map(previous.map(note => [getNoteId(note), note]));
  const merged = complete ? [...notes] : [...previous];
  const indexById = new Map(merged.map((note, index) => [getNoteId(note), index]));
  const newNotes = [];
  notes.forEach(note => {
    const id = getNoteId(note);
    const old = byId.get(id);
    if (old && syncNoteFingerprint(old) !== syncNoteFingerprint(note)) detailCache.delete(id);
    if (!complete) {
      if (indexById.has(id)) merged[indexById.get(id)] = note;
      else newNotes.push(note);
    }
  });
  let source = complete ? merged : [...newNotes, ...merged];
  if (!complete && syncSession) {
    const sourceById = new Map(source.map(note => [getNoteId(note), note]));
    const readIds = new Set(syncSession.notes.map(getNoteId));
    source = [
      ...syncSession.notes.map(note => sourceById.get(getNoteId(note)) || note),
      ...source.filter(note => !readIds.has(getNoteId(note)))
    ];
  }
  const knownIds = new Set(source.map(getNoteId));
  if (complete) {
    selectedNotes.forEach(id => { if (!knownIds.has(id)) selectedNotes.delete(id); });
    detailCache.forEach((_, id) => { if (!knownIds.has(id)) detailCache.delete(id); });
    if (currentNoteId && !knownIds.has(currentNoteId)) {
      currentNoteId = null;
      fillDetailPlaceholder();
    }
  }
  const previousState = allScopeSnapshot?.loadState || loadState;
  allScopeSnapshot = {
    notes: source,
    loadState: {
      mode: 'all', scopeName: '全部笔记', page: 1,
      cursor: syncSession?.mode === 'full' ? syncSession.cursor : previousState.cursor,
      hasMore: syncSession?.mode === 'full' ? !complete : Boolean(previousState.hasMore),
      totalHint: syncSession?.total || previousState.totalHint || 0
    }
  };
  allNotes = getNotesForKnowledgeBase(source, activeKnowledgeBaseId);
  applyContextToLoadState({ ...allScopeSnapshot.loadState, scopeName: getCurrentScopeName(), mode: activeKnowledgeBaseId ? 'owned-knowledge' : 'all' });
  filteredNotes = allNotes.filter(noteMatchesFilters);
  renderNotes();
  // Open filter controls and date drafts remain intact while pages arrive.
  if (!filterElements.tagDropdown?.classList.contains('open')) renderTagOptions();
  if (!filterElements.typeDropdown?.classList.contains('open')) renderTypeOptions();
  updateDropdownLabels();
}

async function runSyncSession({ full = false } = {}) {
  hideSyncGuide({ markSeen: true });
  if (!hasSavedConfig) { openSettings(); return; }
  if (syncRunning || isLoadingNotes) return;
  const generation = ++syncGeneration;
  if (!syncSession) {
    const previous = allScopeSnapshot;
    const resumeOldFeed = !full && previous?.loadState?.hasMore && previous.loadState.cursor !== '0';
    syncSession = {
      mode: full || !previous || previous.loadState.hasMore ? 'full' : 'recent',
      notes: resumeOldFeed ? [...previous.notes] : [],
      cursor: resumeOldFeed ? previous.loadState.cursor : '0',
      hasMore: true, total: 0, unchangedPages: 0, status: 'running', error: ''
    };
  }
  const session = syncSession;
  session.status = 'running';
  session.error = '';
  syncRunning = true;
  syncPauseRequested = false;
  syncWaitController = new AbortController();
  syncWaitMessage = '';
  updateLoadButtons();
  saveViewState({ immediate: true });
  const baseline = new Map(getAllScopeNotesSource().map(note => [getNoteId(note), syncNoteFingerprint(note)]));
  try {
    while (session.hasMore && !syncPauseRequested && generation === syncGeneration) {
      const cursor = session.cursor;
      const result = await getNoteList(cursor, PAGE_SIZE, {
        shouldStop: () => syncPauseRequested || generation !== syncGeneration,
        signal: syncWaitController.signal
      });
      if (generation !== syncGeneration) return;
      if (result.hasMore && (result.notes.length === 0 || result.nextCursor === cursor || result.nextCursor === '0')) {
        throw new Error('接口没有返回有效的下一页，已保留进度，请稍后继续。');
      }
      const pageMerge = mergeNotes(session.notes, result.notes);
      if (result.hasMore && pageMerge.addedCount === 0) {
        throw new Error('接口重复返回了同一批笔记，已保留进度，请稍后继续。');
      }
      session.notes = pageMerge.merged;
      session.cursor = result.nextCursor;
      session.hasMore = result.hasMore;
      session.total = result.total;
      if (session.mode === 'recent') {
        const unchanged = result.notes.length > 0 && result.notes.every(note => baseline.get(getNoteId(note)) === syncNoteFingerprint(note));
        session.unchangedPages = unchanged ? session.unchangedPages + 1 : 0;
        if (session.unchangedPages >= 2) session.hasMore = false;
      }
      publishSyncNotes(result.notes);
      updateSyncToolbar();
      saveViewState({ immediate: true });
      await flushPendingViewStateWrites();
    }
    if (generation !== syncGeneration) return;
    if (!session.hasMore) {
      if (session.mode === 'full') publishSyncNotes(session.notes, { complete: true });
      syncSession = null;
      showStatus(session.mode === 'full'
        ? `同步完成，共整理 ${getAllScopeNotesSource().length} 条笔记`
        : '近期变化已检查。如需核对全部历史笔记和删除，请使用“完整重新同步”。', 'success');
    } else {
      session.status = 'paused';
      showStatus('同步已暂停，进度已保存。', 'info');
    }
  } catch (error) {
    if (generation !== syncGeneration) return;
    session.status = 'paused';
    session.error = error.code === 'SYNC_PAUSED' ? '' : error.message || '同步暂时中断，进度已保留。';
    showStatus(session.error || '同步已暂停，进度已保存。', session.error ? 'error' : 'info');
  } finally {
    if (generation === syncGeneration) {
      syncRunning = false;
      syncWaitMessage = '';
      updateLoadButtons();
      saveViewState({ immediate: true });
      await flushPendingViewStateWrites();
      if (!syncSession && !syncPauseRequested && ownedKnowledgeBases.length === 0) {
        loadOwnedKnowledgeBases({ silent: true, preserveExisting: true });
      }
    }
  }
}

function runKeywordSearch() {
  keyword = searchInput.value.trim();
  applyFilters();
}

function clearDateFilter() {
  activeDatePreset = '';
  customDateStart = '';
  customDateEnd = '';
  if (filterElements.dateStartInput) filterElements.dateStartInput.value = '';
  if (filterElements.dateEndInput) filterElements.dateEndInput.value = '';
  filterElements.dateFilterError?.classList.remove('visible');
}

function selectDatePreset(preset) {
  if (!DATE_PRESETS[preset]) return;

  if (activeDatePreset === preset) {
    clearDateFilter();
  } else {
    activeDatePreset = preset;
    customDateStart = '';
    customDateEnd = '';
  }

  selectedNotes.clear();
  applyFilters();
  filterElements.dateDropdown?.classList.remove('open');
  filterElements.dateDropdownBtn?.setAttribute('aria-expanded', 'false');
}

function applyCustomDateRange() {
  const nextStart = filterElements.dateStartInput?.value || '';
  const nextEnd = filterElements.dateEndInput?.value || '';
  const invalidRange = nextStart && nextEnd && nextStart > nextEnd;

  filterElements.dateFilterError?.classList.toggle('visible', Boolean(invalidRange));
  if (invalidRange) return;

  activeDatePreset = '';
  customDateStart = nextStart;
  customDateEnd = nextEnd;
  selectedNotes.clear();
  applyFilters();
}

function resetFilters() {
  keyword = '';
  knowledgeSearchKeyword = '';
  tagSearchKeyword = '';
  activeTagFilters.clear();
  clearDateFilter();
  activeNoteType = '';
  selectedNotes.clear();

  if (searchInput) searchInput.value = '';
  if (filterElements.ownedKnowledgeFilterSearch) filterElements.ownedKnowledgeFilterSearch.value = '';
  if (filterElements.tagFilterSearch) filterElements.tagFilterSearch.value = '';

  if (activeKnowledgeBaseId) {
    if (restoreAllScopeSnapshot()) {
      applyFilters();
      saveViewState();
      return;
    }

    activeKnowledgeBaseId = '';
    refreshNotesForCurrentFilters();
    return;
  }

  applyFilters();
  saveViewState();
}

function sanitizeFilename(name, fallback = '笔记') {
  return (name || fallback).replace(/[\\/:*?"<>|]/g, '_').trim() || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildMarkdown(note, mode = 'original') {
  const title = note.title || '未标题笔记';
  const original = getOriginalContent(note);
  const ai = getAiContent(note);
  const images = getNoteImages(note);
  const originalLabel = getOriginalContentLabel(note);
  const aiLabel = getAiContentLabel(note);
  const lines = [
    `# ${title}`,
    '',
    `- 日期：${getNoteDate(note) || '未知'}`,
    `- 类型：${getNoteTypeLabel(note)}`,
    `- 标签：${getTags(note).join(' / ') || '无'}`,
    `- 归属：${getTopics(note).join(' / ') || '无'}`,
    ''
  ];

  if (mode === 'ai') {
    lines.push(`## ${aiLabel}`, '', ai || '暂无 AI 总结', '');
  } else {
    lines.push(`## ${originalLabel}`, '', original || '暂无原文', '');
  }

  if (images.length > 0) {
    lines.push('## 图片', '');
    images.forEach((image, index) => {
      lines.push(`![${image.alt || `图片 ${index + 1}`}](${image.url})`, '');
    });
  }

  return lines.join('\n');
}

function textToUint8Array(text) {
  return new TextEncoder().encode(text);
}

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value, true);
}

function getDosDateTime(date) {
  const safe = date instanceof Date ? date : new Date();
  const year = Math.max(1980, safe.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((safe.getMonth() + 1) << 5) | safe.getDate();
  const dosTime = (safe.getHours() << 11) | (safe.getMinutes() << 5) | Math.floor(safe.getSeconds() / 2);
  return { dosDate, dosTime };
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(file => {
    const nameBytes = textToUint8Array(file.name);
    const contentBytes = file.content;
    const crc = crc32(contentBytes);
    const { dosDate, dosTime } = getDosDateTime(file.date);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, dosTime);
    writeUint16(localView, 12, dosDate);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, contentBytes.length);
    writeUint32(localView, 22, contentBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, dosTime);
    writeUint16(centralView, 14, dosDate);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, contentBytes.length);
    writeUint32(centralView, 24, contentBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + contentBytes.length;
  });

  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectorySize);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
}

async function downloadSingle(mode = 'original') {
  const note = getCurrentNote();
  if (!note) {
    showStatus('请先打开一条笔记再下载');
    return;
  }

  const fileContent = buildMarkdown(note, mode);
  const blob = new Blob([fileContent], { type: 'text/markdown;charset=utf-8' });
  const suffix = mode === 'ai' ? 'AI总结' : '原文';
  downloadBlob(blob, `${sanitizeFilename(note.title)}_${suffix}.md`);
  showStatus(`已下载 ${suffix}`, 'success');
}

async function batchDownload(mode = 'original') {
  if (!selectedNotes.size) {
    showStatus('请先选择至少一条笔记');
    return;
  }

  try {
    showFloatingLoader('正在打包下载…');

    const files = [];
    for (const noteId of selectedNotes) {
      const detail = await getCachedOrFetchDetail(noteId);
      const content = buildMarkdown(detail.note, mode);
      const encoded = textToUint8Array(content);
      files.push({
        name: `${sanitizeFilename(detail.note.title)}.md`,
        content: encoded,
        date: new Date()
      });
    }

    const prefix = mode === 'ai' ? 'AI总结' : '原文';
    if (files.length === 1) {
      downloadBlob(new Blob([files[0].content], { type: 'text/markdown;charset=utf-8' }), `${sanitizeFilename(prefix)}_${files[0].name}`);
      pulseFloatingSuccess('下载完成');
      showStatus(`已下载 1 条${prefix}`, 'success');
      return;
    }

    const zipBlob = buildZip(files);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(zipBlob, `得到大脑_${prefix}_${timestamp}.zip`);
    pulseFloatingSuccess('打包完成');
    showStatus(`已打包下载 ${files.length} 条${prefix}`, 'success');
  } catch (error) {
    hideFloatingLoader();
    showStatus(`打包下载失败: ${error.message || '未知错误'}`);
  }
}

function toggleDropdown(dropdown) {
  if (!dropdown) return;
  const isOpen = dropdown.classList.contains('open');
  closeFilterDropdowns();
  if (!isOpen) {
    dropdown.classList.add('open');
    dropdown.querySelector('.dropdown-trigger')?.setAttribute('aria-expanded', 'true');
  }
}

function closeFilterDropdowns() {
  document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
    dropdown.classList.remove('open');
    dropdown.querySelector('.dropdown-trigger')?.setAttribute('aria-expanded', 'false');
  });
}

function selectNoteType(type) {
  if (type && !Object.prototype.hasOwnProperty.call(NOTE_TYPES, type)) return;
  activeNoteType = type;
  selectedNotes.clear();
  applyFilters();
  closeFilterDropdowns();
}

async function saveConfig() {
  const apiKey = apiKeyInput.value.trim();
  const clientId = clientIdInput.value.trim();

  if (!apiKey || !clientId) {
    showSettingsStepError('请先填完整 API Key 和 Client ID。');
    return;
  }

  saveConfigLocal(apiKey, clientId);
  clearSyncGuideSeen();
  apiKeyInput.value = '';
  clientIdInput.value = '';
  apiKeyInput.placeholder = 'API Key 已保存';
  clientIdInput.placeholder = 'Client ID 已保存';
  updateSettingsButtonLabel();
  updateClearConfigVisibility();

  closeSettings();
  updateLoadButtons();
  showEmpty('开始同步笔记', `点“${getFirstSyncButtonLabel()}”后，这里就会开始出现内容。`, [
    {
      id: 'syncAfterSave',
      label: getFirstSyncButtonLabel(),
      variant: 'primary',
      handler: refreshNotes
    }
  ]);
  showStatus(`配置已保存。下一步请点击“${getFirstSyncButtonLabel()}”。`, 'success');
  showSyncGuide();
  saveViewState();
}

function clearConfig() {
  syncWaitController?.abort();
  syncGeneration += 1;
  syncPauseRequested = true;
  syncRunning = false;
  syncSession = null;
  activeNoteType = '';
  clearConfigLocal();
  clearViewState();
  knowledgeBaseSyncState = 'idle';
  activeKnowledgeBaseId = '';
  keyword = '';
  activeTagFilters.clear();
  clearDateFilter();
  knowledgeSearchKeyword = '';
  tagSearchKeyword = '';
  ownedKnowledgeBases = [];
  allScopeSnapshot = null;
  resetLoadedNotesState();
  applyContextToLoadState({
    mode: 'all',
    scopeName: '全部笔记',
    cursor: '0',
    page: 1,
    hasMore: false,
    totalHint: 0
  });

  apiKeyInput.value = '';
  clientIdInput.value = '';
  apiKeyInput.placeholder = 'gk_live_xxx';
  clientIdInput.placeholder = 'cli_xxx';
  clearSyncGuideSeen();
  hideSyncGuide();

  updateSettingsButtonLabel();
  updateClearConfigVisibility();
  renderFilters();
  renderNotes();
  showStatus('本地配置已清除', 'success');
  openSettings();
}

function bindEvents() {
  const compactLayout = window.matchMedia('(max-width: 760px)');
  let previewTrigger = null;

  const closeCompactPreview = () => {
    detailView?.classList.remove('mobile-detail-open');
    (previewTrigger?.isConnected ? previewTrigger : searchInput)?.focus({ preventScroll: true });
  };

  compactLayout.addEventListener('change', () => {
    detailView?.classList.remove('mobile-detail-open');
  });

  filterElements.syncPauseBtn?.addEventListener('click', pauseSyncSession);
  filterElements.syncResumeBtn?.addEventListener('click', () => runSyncSession());
  filterElements.syncFullBtn?.addEventListener('click', () => runSyncSession({ full: true }));
  notesContainer.addEventListener('click', event => {
    const item = event.target.closest('.note-item');
    if (!item || event.target.closest('.note-checkbox')) return;
    const tag = event.target.closest('.note-tag-trigger');
    if (tag) {
      activeTagFilters.clear();
      activeTagFilters.add(tag.dataset.tagValue);
      selectedNotes.clear();
      applyFilters();
      return;
    }
    const topic = event.target.closest('.note-topic-trigger');
    if (topic) { filterByTopic(topic.dataset.topicId || '', topic.dataset.topicName || ''); return; }
    const type = event.target.closest('.note-type-trigger');
    if (type) { selectNoteType(type.dataset.noteType); return; }
    openNoteDetail(item.dataset.noteId);
    detailView?.scrollTo(0, 0);
    if (compactLayout.matches) {
      previewTrigger = item.querySelector('.note-title');
      detailView?.classList.add('mobile-detail-open');
      detailTitle.focus({ preventScroll: true });
    }
  });
  notesContainer.addEventListener('change', event => {
    if (event.target.matches('.note-check')) {
      toggleSelection(event.target.closest('.note-item').dataset.noteId, event.target.checked);
    }
  });
  saveConfigBtn?.addEventListener('click', event => {
    event.preventDefault();
    handleSettingsPrimaryAction();
  });
  settingsBackBtn?.addEventListener('click', event => {
    event.preventDefault();
    setSettingsStep(settingsStep - 1);
  });
  clearConfigBtn?.addEventListener('click', event => {
    event.preventDefault();
    clearConfig();
  });
  refreshBtn?.addEventListener('click', event => {
    event.preventDefault();
    refreshNotes();
  });
  backBtn?.addEventListener('click', closeCompactPreview);
  downloadOriginalBtn?.addEventListener('click', event => {
    event.preventDefault();
    downloadSingle('original');
  });
  downloadAiBtn?.addEventListener('click', event => {
    event.preventDefault();
    downloadSingle('ai');
  });
  batchDownloadBtn?.addEventListener('click', event => {
    event.preventDefault();
    batchDownload('original');
  });
  batchDownloadAiBtn?.addEventListener('click', event => {
    event.preventDefault();
    batchDownload('ai');
  });
  selectFilteredNotes?.addEventListener('change', () => {
    const shouldSelect = selectFilteredNotes.checked;
    filteredNotes.forEach(note => {
      const noteId = getNoteId(note);
      if (!noteId) return;
      if (shouldSelect) {
        selectedNotes.add(noteId);
      } else {
        selectedNotes.delete(noteId);
      }
    });
    updateBatchActions();
    renderNotes();
    saveViewState();
  });
  searchBtn?.addEventListener('click', runKeywordSearch);
  clearSearchBtn?.addEventListener('click', () => {
    searchInput.value = '';
    keyword = '';
    applyFilters();
    saveViewState();
  });
  clearFiltersBtn?.addEventListener('click', resetFilters);
  openSettingsBtn?.addEventListener('click', event => {
    event.preventDefault();
    openSettings();
  });
  closeSettingsBtn?.addEventListener('click', event => {
    event.preventDefault();
    closeSettings();
  });
  filterElements.ownedKnowledgeDropdownBtn?.addEventListener('click', event => {
    event.stopPropagation();
    toggleDropdown(filterElements.ownedKnowledgeDropdown);
  });
  filterElements.tagDropdownBtn?.addEventListener('click', event => {
    event.stopPropagation();
    toggleDropdown(filterElements.tagDropdown);
  });
  filterElements.dateDropdownBtn?.addEventListener('click', event => {
    event.stopPropagation();
    toggleDropdown(filterElements.dateDropdown);
  });
  filterElements.typeDropdownBtn?.addEventListener('click', event => {
    event.stopPropagation();
    toggleDropdown(filterElements.typeDropdown);
  });
  filterElements.typeFilters?.addEventListener('click', event => {
    const button = event.target.closest('[data-note-type]');
    if (button) selectNoteType(button.dataset.noteType);
  });
  filterElements.dateDropdown?.querySelectorAll('[data-date-preset]').forEach(button => {
    button.addEventListener('click', () => selectDatePreset(button.dataset.datePreset || ''));
  });
  filterElements.dateStartInput?.addEventListener('change', applyCustomDateRange);
  filterElements.dateEndInput?.addEventListener('change', applyCustomDateRange);
  filterElements.ownedKnowledgeFilterSearch?.addEventListener('input', () => {
    knowledgeSearchKeyword = filterElements.ownedKnowledgeFilterSearch.value.trim();
    renderKnowledgeBaseOptions();
  });
  filterElements.tagFilterSearch?.addEventListener('input', () => {
    tagSearchKeyword = filterElements.tagFilterSearch.value.trim();
    renderTagOptions();
  });
  searchInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      runKeywordSearch();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.filter-dropdown')) {
      closeFilterDropdowns();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    closeFilterDropdowns();
    if (!settingsOverlay?.open && detailView?.classList.contains('mobile-detail-open')) closeCompactPreview();
  });
  window.addEventListener('resize', positionSyncGuide);
  window.addEventListener('scroll', positionSyncGuide, true);
  settingsOverlay?.addEventListener('click', event => {
    if (event.target === settingsOverlay) {
      closeSettings();
    }
  });
}

window.__getNotesApp = {
  openSettings,
  closeSettings,
  saveConfig,
  clearConfig,
  refreshNotes,
  pauseSync: pauseSyncSession,
  fullSync: () => runSyncSession({ full: true }),
  batchDownloadOriginal: () => batchDownload('original'),
  batchDownloadAi: () => batchDownload('ai')
};

bindEvents();

(async () => {
  fillDetailPlaceholder();
  updateBatchActions();
  renderFilters();
  updateResultsMeta();

  const configured = await checkConfig();
  updateLoadButtons();
  if (configured) {
    const restored = await restoreViewState();
    if (restored) {
      renderFilters();
      updateResultsMeta();
      if (ENABLE_KNOWLEDGE_BASE_FILTER && ownedKnowledgeBases.length === 0) {
        knowledgeBaseSyncState = 'loading';
        loadOwnedKnowledgeBases({ silent: true, preserveExisting: true });
      } else if (ENABLE_KNOWLEDGE_BASE_FILTER) {
        knowledgeBaseSyncState = 'ready';
      }
    } else {
      showEmpty('先同步一次过去的笔记', `完成设置后，点击“${getFirstSyncButtonLabel()}”，就能开始筛选、预览和导出。`, [
        {
          id: 'firstSync',
          label: getFirstSyncButtonLabel(),
          variant: 'primary',
          handler: refreshNotes
        }
      ]);
      showStatus(`点击“${getFirstSyncButtonLabel()}”开始首次同步。`, 'info');
      showSyncGuide();
    }
  } else {
    showEmpty('连接得到大脑', '保存 API Key 和 Client ID 后，就可以同步和导出笔记。', [
      {
        id: 'settings',
        label: '开始设置',
        variant: 'primary',
        handler: openSettings
      }
    ]);
  }
})();
