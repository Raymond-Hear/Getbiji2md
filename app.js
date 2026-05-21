const API_BASE = 'https://openapi.biji.com/open/api/v1/resource';
const STORAGE_KEYS = {
  apiKey: 'get-notes-api-key',
  clientId: 'get-notes-client-id',
  viewState: 'get-notes-view-state'
};

const RATE_LIMIT_STATUS = 429;
const PAGE_SIZE = 20;
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 1500;
const LOAD_ALL_STEP_DELAY_MS = 850;

const detailView = document.getElementById('detailView');
const notesContainer = document.getElementById('notesContainer');
const loadMoreContainer = document.getElementById('loadMoreContainer');
const batchActions = document.getElementById('batchActions');
const selectedCount = document.getElementById('selectedCount');
const selectedCountHero = document.getElementById('selectedCountHero');
const loadedCount = document.getElementById('loadedCount');
const visibleCount = document.getElementById('visibleCount');
const batchDownloadBtn = document.getElementById('batchDownloadBtn');
const batchDownloadAiBtn = document.getElementById('batchDownloadAiBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const clientIdInput = document.getElementById('clientIdInput');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const clearConfigBtn = document.getElementById('clearConfigBtn');
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
const originalContent = document.getElementById('originalContent');
const aiContent = document.getElementById('aiContent');

let filterElements = {};
let allNotes = [];
let filteredNotes = [];
let ownedKnowledgeBases = [];
let currentNoteId = null;
let keyword = '';
let hasSavedConfig = false;
let isLoadingNotes = false;
let isLoadingKnowledgeBases = false;
let pendingLoadAll = false;
let currentLoadToken = 0;
let knowledgeSearchKeyword = '';
let tagSearchKeyword = '';
let activeKnowledgeBaseId = '';
let allScopeSnapshot = null;
let knowledgeBaseSyncState = 'idle';

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

detailView?.classList.add('active');

injectEnhancementStyles();
setupFilterLayout();
applyProductCopy();

function injectEnhancementStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .filters-grid {
      align-items: start;
    }

    .filters-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .filter-toolbar {
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 18px;
      border: 1px solid rgba(106, 79, 53, 0.12);
      background: rgba(255, 255, 255, 0.58);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .filter-toolbar-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      min-width: 0;
      flex: 1 1 280px;
    }

    .filter-toolbar-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(36, 106, 101, 0.08);
      color: var(--teal);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .filter-actions-row {
      flex: 0 0 auto;
    }

    .filter-inline-meta {
      min-height: 20px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
      white-space: normal;
    }

    .filter-option.is-active {
      border-color: var(--brand);
      background: rgba(163, 90, 36, 0.08);
    }

    .topic-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(36, 106, 101, 0.08);
      color: var(--teal);
      font-size: 12px;
      line-height: 1;
      margin-right: 8px;
      margin-bottom: 8px;
    }

    .note-scope-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
      margin-bottom: 4px;
    }

    .floating-loader {
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 120;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 180px;
      max-width: 260px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(106, 79, 53, 0.12);
      background: rgba(255, 253, 249, 0.96);
      box-shadow: 0 16px 36px rgba(65, 46, 29, 0.14);
      opacity: 0;
      pointer-events: none;
      transform: translateY(10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .floating-loader.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .floating-loader.success .floating-loader-ring {
      border-color: rgba(36, 106, 101, 0.22);
      color: var(--teal);
    }

    .floating-loader-ring {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid rgba(163, 90, 36, 0.14);
      border-top-color: var(--brand);
      animation: spin 0.8s linear infinite;
      flex: 0 0 auto;
    }

    .floating-loader.success .floating-loader-ring {
      animation: none;
      display: grid;
      place-items: center;
      border-width: 2px;
    }

    .floating-loader.success .floating-loader-ring::before {
      content: "\\2713";
      font-size: 12px;
      font-weight: 700;
    }

    .floating-loader-copy {
      font-size: 12px;
      color: var(--text);
      line-height: 1.5;
    }

    .note-summary {
      white-space: pre-wrap;
    }

    .note-media-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .note-media-card {
      position: relative;
      overflow: hidden;
      border-radius: 18px;
      border: 1px solid rgba(106, 79, 53, 0.12);
      background: rgba(255, 255, 255, 0.72);
      min-height: 120px;
    }

    .note-media-card img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: rgba(246, 241, 235, 0.8);
    }

    @media (max-width: 900px) {
      .filters-grid {
        grid-template-columns: 1fr;
      }

      .filter-toolbar {
        align-items: stretch;
      }

      .floating-loader {
        right: 16px;
        left: 16px;
        bottom: 16px;
        max-width: none;
        min-width: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

function setupFilterLayout() {
  const filtersGrid = document.querySelector('.filters-grid');
  if (!filtersGrid) return;

  filtersGrid.innerHTML = `
    <div id="ownedKnowledgeDropdown" class="filter-dropdown">
      <button id="ownedKnowledgeDropdownBtn" class="btn dropdown-trigger" type="button">
        <span class="dropdown-label">
          <strong>我的知识库</strong>
          <span id="ownedKnowledgeDropdownLabel">配置后自动加载</span>
        </span>
        <span class="dropdown-arrow">⌄</span>
      </button>
      <div class="dropdown-panel">
        <input id="ownedKnowledgeFilterSearch" class="filter-search" type="text" placeholder="筛选我创建的知识库">
        <div id="ownedKnowledgeFilters" class="filter-options"></div>
      </div>
    </div>
    <div id="tagDropdown" class="filter-dropdown">
      <button id="tagDropdownBtn" class="btn dropdown-trigger" type="button">
        <span class="dropdown-label">
          <strong>标签筛选</strong>
          <span id="tagDropdownLabel">加载结果后可选</span>
        </span>
        <span class="dropdown-arrow">⌄</span>
      </button>
      <div class="dropdown-panel">
        <input id="tagFilterSearch" class="filter-search" type="text" placeholder="筛选标签名称">
        <div id="tagFilters" class="filter-options"></div>
      </div>
    </div>
  `;

  filtersGrid.insertAdjacentHTML('afterend', `
    <div class="filter-toolbar">
      <div class="filter-toolbar-left">
        <div id="filterInlineMeta" class="filter-inline-meta">完成设置后会自动加载首批结果。</div>
      </div>
    </div>
  `);

  const floatingLoader = document.createElement('div');
  floatingLoader.id = 'floatingLoader';
  floatingLoader.className = 'floating-loader';
  floatingLoader.innerHTML = `
    <span class="floating-loader-ring" aria-hidden="true"></span>
    <div id="floatingLoaderCopy" class="floating-loader-copy">正在加载…</div>
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
    activeFilters: document.getElementById('activeFilters'),
    filterInlineMeta: document.getElementById('filterInlineMeta'),
    floatingLoader: document.getElementById('floatingLoader'),
    floatingLoaderCopy: document.getElementById('floatingLoaderCopy')
  };

  hideBottomLoadMore();
}

function applyProductCopy() {
  document.querySelector('.brand-mark')?.setAttribute('alt', 'Get 笔记 Markdown 导出工具图标');
  document.querySelector('.brand-copy h1') && (document.querySelector('.brand-copy h1').textContent = '把你的 Get 笔记整理成 Markdown');
  document.querySelector('.brand-copy p') && (document.querySelector('.brand-copy p').textContent = '按知识库筛选、搜索、预览，再把你要的内容导出下来。配置只保存在当前浏览器里。');

  if (refreshBtn) refreshBtn.textContent = '同步我的笔记';
  if (openSettingsBtn) openSettingsBtn.textContent = '设置';

  const statLabels = document.querySelectorAll('.stat-label');
  if (statLabels[0]) statLabels[0].textContent = '已整理笔记';
  if (statLabels[1]) statLabels[1].textContent = '当前结果';

  const panelTitle = document.querySelector('.filters-panel .panel-title h2');
  if (panelTitle) panelTitle.textContent = '搜索与筛选';
  const panelSubtitle = document.querySelector('.filters-panel .panel-subtitle');
  if (panelSubtitle) panelSubtitle.textContent = '先选知识库，再用标签和关键词缩小范围。';
  if (clearFiltersBtn) clearFiltersBtn.textContent = '清空筛选';
  if (searchInput) searchInput.placeholder = '搜索标题、标签，或已经加载出的正文内容';
  document.getElementById('searchBtn') && (document.getElementById('searchBtn').textContent = '搜索');
  if (clearSearchBtn) clearSearchBtn.textContent = '清空搜索';

  const activeFiltersTitle = document.querySelector('#activeFilters')?.previousElementSibling;
  if (activeFiltersTitle) activeFiltersTitle.textContent = '当前筛选';
  if (filterElements.ownedKnowledgeFilterSearch) filterElements.ownedKnowledgeFilterSearch.placeholder = '筛选我创建的知识库';
  if (filterElements.tagFilterSearch) filterElements.tagFilterSearch.placeholder = '筛选标签名称';
  const dropdownStrong = document.querySelectorAll('.dropdown-label strong');
  if (dropdownStrong[0]) dropdownStrong[0].textContent = '我的知识库';
  if (dropdownStrong[1]) dropdownStrong[1].textContent = '标签筛选';

  const resultsTitle = document.querySelector('.results-toolbar h2');
  if (resultsTitle) resultsTitle.textContent = '笔记列表';
  if (batchDownloadBtn) batchDownloadBtn.textContent = '下载原文';
  if (batchDownloadAiBtn) batchDownloadAiBtn.textContent = '下载 AI 总结';

  if (backBtn) backBtn.textContent = '返回列表';
  if (downloadOriginalBtn) downloadOriginalBtn.textContent = '下载原文';
  if (downloadAiBtn) downloadAiBtn.textContent = '下载 AI 总结';
  const contentLabels = document.querySelectorAll('.content-label');
  if (contentLabels[0]) contentLabels[0].textContent = '原文内容';
  if (contentLabels[1]) contentLabels[1].textContent = 'AI 总结';

  const settingsTitle = document.querySelector('.settings-copy h2');
  if (settingsTitle) settingsTitle.textContent = '先完成一次设置';
  const settingsIntro = document.querySelector('.settings-copy p');
  if (settingsIntro) settingsIntro.textContent = '只需要填入你的 API Key 和 Client ID，保存后就可以同步、筛选和导出自己的笔记。';
  if (closeSettingsBtn) closeSettingsBtn.textContent = '关闭';

  const guideTitle = document.querySelector('.settings-guide h3');
  if (guideTitle) guideTitle.textContent = '获取 API Key 和 Client ID';
  const guideList = document.querySelector('.settings-guide ol');
  if (guideList) {
    guideList.innerHTML = `
      <li>打开 <a class="guide-link" href="https://www.biji.com/openapi?tab=clients" target="_blank" rel="noopener noreferrer">Get 笔记开放平台<span class="link-badge">点击打开</span></a> 并登录账号。</li>
      <li>找到 Get 笔记对应的开放应用。</li>
      <li>生成并保存你的 API Key 和 Client ID。</li>
      <li>回到这里填入两项信息，点击“保存并开始”。</li>
    `;
  }
  const memberNote = document.querySelector('.member-note');
  if (memberNote) memberNote.textContent = '如果你还没有 API Key，可以先去开放平台确认账号权限。';
  const privacyNote = document.querySelector('.privacy-note');
  if (privacyNote) privacyNote.textContent = '这里不会替你保存账号体系，API Key 和 Client ID 只保存在当前浏览器本地。';
  const fieldHints = document.querySelectorAll('.field-hint');
  if (fieldHints[0]) fieldHints[0].textContent = '填入你自己的 API Key，用来读取笔记内容。';
  if (fieldHints[1]) fieldHints[1].textContent = '填入对应的 Client ID，保存后就可以开始同步。';
  const settingsFoot = document.querySelector('.settings-foot .panel-subtitle');
  if (settingsFoot) settingsFoot.textContent = '保存后会自动准备你的知识库和首批笔记内容。';
  if (clearConfigBtn) clearConfigBtn.textContent = '清除本地配置';
  if (saveConfigBtn) saveConfigBtn.textContent = '保存并开始';
}

function hideBottomLoadMore() {
  if (!loadMoreContainer) return;
  loadMoreContainer.style.display = 'none';
  loadMoreContainer.innerHTML = '';
}

function openSettings() {
  settingsOverlay?.classList.add('open');
}

function closeSettings() {
  settingsOverlay?.classList.remove('open');
}

function showStatus(message, type = 'error') {
  if (!statusBar) return;
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
}

function setInlineMeta(message) {
  if (filterElements.filterInlineMeta) {
    filterElements.filterInlineMeta.textContent = message;
  }
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

function formatLoaderProgress() {
  if (loadState.totalHint > 0) {
    return `已加载 ${allNotes.length} / ${loadState.totalHint}`;
  }
  return `已加载 ${allNotes.length} 条`;
}

function showEmpty(title, hint) {
  const showAction = !hasSavedConfig;
  notesContainer.innerHTML = `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(hint)}</p>
      ${showAction ? '<button id="emptyStateSettingsBtn" class="btn btn-primary" style="margin-top: 16px;">开始设置</button>' : ''}
    </div>
  `;

  if (showAction) {
    document.getElementById('emptyStateSettingsBtn')?.addEventListener('click', openSettings);
  }
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

function saveViewState() {
  if (!hasSavedConfig) return;

  try {
    const payload = {
      keyword,
      activeKnowledgeBaseId,
      activeTagFilters: Array.from(activeTagFilters),
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

    localStorage.setItem(STORAGE_KEYS.viewState, JSON.stringify(payload));
  } catch (error) {
    console.warn('save view state failed', error);
  }
}

function clearViewState() {
  localStorage.removeItem(STORAGE_KEYS.viewState);
}

function restoreViewState() {
  const raw = localStorage.getItem(STORAGE_KEYS.viewState);
  if (!raw) {
    return false;
  }

  try {
    const payload = JSON.parse(raw);
    ownedKnowledgeBases = Array.isArray(payload.ownedKnowledgeBases) ? payload.ownedKnowledgeBases : [];
    allNotes = Array.isArray(payload.allNotes) ? payload.allNotes : [];
    allScopeSnapshot = payload.allScopeSnapshot || null;
    keyword = typeof payload.keyword === 'string' ? payload.keyword : '';
    activeKnowledgeBaseId = typeof payload.activeKnowledgeBaseId === 'string' ? payload.activeKnowledgeBaseId : '';
    currentNoteId = typeof payload.currentNoteId === 'string' ? payload.currentNoteId : null;

    activeTagFilters.clear();
    (Array.isArray(payload.activeTagFilters) ? payload.activeTagFilters : []).forEach(tag => activeTagFilters.add(tag));

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
    return allNotes.length > 0 || ownedKnowledgeBases.length > 0;
  } catch (error) {
    console.warn('restore view state failed', error);
    clearViewState();
    return false;
  }
}

function getNoteId(note) {
  return String(note.note_id || note.id || '');
}

function getTopics(note) {
  return (note.topics || []).map(topic => topic.name).filter(Boolean);
}

function getTags(note) {
  return (note.tags || []).map(tag => tag.name).filter(Boolean);
}

function getNoteDate(note) {
  return note.created_at ? note.created_at.slice(0, 10) : '';
}

function getOriginalContent(note) {
  const audioOriginal = note.audio?.original || '';
  if (audioOriginal) return audioOriginal;

  const webOriginal = note.web_page?.content || '';
  if (webOriginal) return webOriginal;

  return note.content || '';
}

function getAiContent(note) {
  const original = getOriginalContent(note);
  const candidates = [
    note.web_page?.excerpt || '',
    note.content || ''
  ];
  return candidates.find(candidate => candidate && candidate !== original) || '';
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
  selectedCount.textContent = String(count);
  selectedCountHero.textContent = String(count);
  batchActions.style.display = count > 0 ? 'flex' : 'none';
}

function updateStats() {
  loadedCount.textContent = String(allNotes.length);
  visibleCount.textContent = String(filteredNotes.length);
  updateBatchActions();
}

function updateSettingsButtonLabel() {
  if (!openSettingsBtn) return;
  openSettingsBtn.textContent = hasSavedConfig ? '设置' : '开始设置';
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
}

function updateLoadButtons() {
  if (refreshBtn) {
    const busy = isLoadingNotes || isLoadingKnowledgeBases;
    refreshBtn.disabled = busy;
    refreshBtn.textContent = busy ? '同步中...' : '同步我的笔记';
  }

  if (!hasSavedConfig) {
    setInlineMeta('完成设置后，就可以开始同步和整理你的笔记。');
    return;
  }

  if (isLoadingNotes) {
    setInlineMeta(`正在整理 ${loadState.scopeName}，你可以继续浏览当前页面。`);
    return;
  }

  if (!allNotes.length) {
    setInlineMeta('同步后会先出现首批结果，再继续补齐完整内容。');
    return;
  }

  if (loadState.hasMore) {
    setInlineMeta(`当前已整理 ${allNotes.length} 条 ${loadState.scopeName}。`);
  } else {
    setInlineMeta(`当前范围已经整理完成，共 ${allNotes.length} 条。`);
  }
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
        loadOwnedKnowledgeBases({ preserveExisting: false });
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
      loadOwnedKnowledgeBases({ preserveExisting: false });
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

function renderActiveFilters() {
  const parts = [];
  const selectedKnowledgeBase = ownedKnowledgeBases.find(item => item.id === activeKnowledgeBaseId);

  if (keyword) {
    parts.push(`<span class="mini-chip tag">搜索：${escapeHtml(keyword)}</span>`);
  }

  if (selectedKnowledgeBase) {
    parts.push(`<span class="mini-chip topic">我的知识库：${escapeHtml(selectedKnowledgeBase.name)}</span>`);
  }

  activeTagFilters.forEach(tag => {
    parts.push(`<span class="mini-chip tag">标签：${escapeHtml(tag)}</span>`);
  });

  if (!parts.length) {
    filterElements.activeFilters.className = 'active-filters empty';
    filterElements.activeFilters.textContent = '还没有启用任何筛选条件';
    return;
  }

  filterElements.activeFilters.className = 'active-filters';
  filterElements.activeFilters.innerHTML = parts.join('');
}

function renderFilters() {
  renderKnowledgeBaseOptions();
  renderTagOptions();
  renderActiveFilters();
  updateDropdownLabels();
  updateLoadButtons();
}

function noteMatchesFilters(note) {
  const searchable = getSearchText(note);
  const tags = getTags(note);
  const matchKeyword = !keyword || searchable.includes(keyword.toLowerCase());
  const matchTags = activeTagFilters.size === 0 || Array.from(activeTagFilters).every(tag => tags.includes(tag));
  return matchKeyword && matchTags;
}

function updateResultsMeta() {
  if (!hasSavedConfig) {
    resultsMeta.textContent = '完成设置后会自动加载首批结果';
    return;
  }

  if (allNotes.length === 0) {
    resultsMeta.textContent = isLoadingNotes ? '正在准备首批结果…' : '当前还没有加载到结果';
    return;
  }

  const scope = activeKnowledgeBaseId
    ? (ownedKnowledgeBases.find(item => item.id === activeKnowledgeBaseId)?.name || '当前知识库')
    : '全部笔记';
  const filterHint = keyword || activeTagFilters.size > 0
    ? `，当前命中 ${filteredNotes.length} 条`
    : '';

  resultsMeta.textContent = `当前范围：${scope}，已加载 ${allNotes.length} 条${filterHint}`;
}

function renderNotes() {
  if (filteredNotes.length === 0) {
    if (allNotes.length === 0) {
      showEmpty(
        hasSavedConfig ? '还没有结果' : '先完成接口设置',
        hasSavedConfig ? '当前范围还没有加载到笔记，或者知识库里暂时没有内容。' : '第一次使用时先保存 API Key 和 Client ID。'
      );
    } else {
      showEmpty('没有匹配结果', '换一个关键词，或者清空当前筛选条件。');
    }
    updateStats();
    updateResultsMeta();
    return;
  }

  notesContainer.innerHTML = filteredNotes.map(note => {
    const noteId = getNoteId(note);
    const tags = getTags(note);
    const topics = getTopics(note);
    const summary = getOriginalContent(note) || '暂无摘要内容';
    const isSelected = selectedNotes.has(noteId);

    return `
      <article class="note-item ${isSelected ? 'selected' : ''}" data-note-id="${noteId}">
        <div class="note-checkbox">
          <input type="checkbox" class="note-check" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="note-main">
          <div class="note-heading">
            <div class="note-title">${escapeHtml(note.title || '未标题笔记')}</div>
            <div class="note-date">${escapeHtml(getNoteDate(note))}</div>
          </div>
          <div class="note-meta">
            <span class="note-type">${escapeHtml(note.note_type || 'text')}</span>
          </div>
          ${topics.length ? `<div class="note-scope-row">${topics.map(topic => `<span class="topic-badge">${escapeHtml(topic)}</span>`).join('')}</div>` : ''}
          <div class="note-summary">${escapeHtml(summary)}</div>
          <div class="tag-row">
            ${tags.map(tag => `<button type="button" class="mini-chip tag note-tag-trigger" data-tag-value="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}
          </div>
        </div>
        <div class="note-open">></div>
      </article>
    `;
  }).join('');

  notesContainer.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', event => {
      if (event.target.closest('.note-check') || event.target.closest('.note-tag-trigger')) {
        return;
      }
      openNoteDetail(item.dataset.noteId);
    });
  });

  notesContainer.querySelectorAll('.note-check').forEach(checkbox => {
    checkbox.addEventListener('change', event => {
      event.stopPropagation();
      toggleSelection(checkbox.closest('.note-item').dataset.noteId, checkbox.checked);
    });
  });

  notesContainer.querySelectorAll('.note-tag-trigger').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const tag = button.dataset.tagValue;
      activeTagFilters.add(tag);
      applyFilters();
    });
  });

  updateStats();
  updateResultsMeta();
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
  detailTitle.textContent = '点击左侧任意笔记查看详情';
  detailMeta.textContent = '这里会显示类型、日期、当前筛选范围和标签。';
  ensureDetailMediaContainer().innerHTML = '';
  originalContent.textContent = '打开一条笔记后，这里会显示原文。';
  originalContent.classList.add('empty');
  aiContent.textContent = '如果这条笔记有 AI 总结，这里会显示对应内容。';
  aiContent.classList.add('empty');
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

  detailTitle.textContent = note.title || '未标题笔记';
  detailMeta.textContent = [
    note.note_type || 'text',
    getNoteDate(note),
    `当前筛选：${currentKnowledgeBase}`,
    topics.length ? `归属：${topics.join(' / ')}` : '',
    tags.length ? `标签：${tags.join(' / ')}` : ''
  ].filter(Boolean).join(' · ');

  const original = getOriginalContent(note) || '暂无原文';
  const ai = getAiContent(note) || '暂无 AI 总结';
  const mediaGrid = ensureDetailMediaContainer();

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

  showStatus('正在获取笔记详情…', 'info');

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
    renderNoteDetail(detail.note);
    showStatus(detail.fromCache ? '已显示本地缓存详情' : '笔记详情已更新', 'success');
    saveViewState();
  } catch (error) {
    showStatus(`加载详情失败: ${error.message}`);
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

async function apiGet(path, params = {}) {
  const apiKey = getApiKey();
  const clientId = getClientId();
  if (!apiKey || !clientId) {
    throw new Error('请先完成接口设置');
  }

  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': apiKey,
      'X-Client-ID': clientId,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`);
  }

  return response.json();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRateLimitRetry(task, label, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    retryDelayMs = RETRY_DELAY_MS
  } = options;

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const message = error?.message || '';
      const isRateLimited = message.includes(`(${RATE_LIMIT_STATUS})`);

      if (!isRateLimited || attempt >= maxRetries) {
        throw error;
      }

      attempt += 1;
      const backoff = retryDelayMs * attempt;
      showStatus(`${label} 请求过快，${Math.ceil(backoff / 1000)} 秒后自动重试`, 'info');
      showFloatingLoader(`${label} 请求稍快，正在重试…`);
      await wait(backoff);
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

async function getNoteList(cursor = '0', limit = PAGE_SIZE) {
  const params = { limit };
  if (cursor && cursor !== '0') {
    params.cursor = cursor;
  } else {
    params.since_id = '0';
  }

  const resp = await withRateLimitRetry(
    () => apiGet('/note/list', params),
    '笔记列表'
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
  if (!activeKnowledgeBaseId) return '全部笔记';
  return ownedKnowledgeBases.find(item => item.id === activeKnowledgeBaseId)?.name || '我的知识库';
}

async function loadOwnedKnowledgeBases(options = {}) {
  const {
    silent = false,
    preserveExisting = true
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
    if (!silent) {
      showStatus('这次没有同步到你的知识库，请稍后再试');
    }
  } finally {
    isLoadingKnowledgeBases = false;
    renderFilters();
  }
}

function beginLoading(message) {
  isLoadingNotes = true;
  updateLoadButtons();
  showFloatingLoader(message);
}

function finishLoading(successMessage) {
  isLoadingNotes = false;
  updateLoadButtons();
  if (successMessage) {
    pulseFloatingSuccess(successMessage);
  } else {
    hideFloatingLoader();
  }
}

async function loadInitialNotesForCurrentScope() {
  if (!hasSavedConfig || isLoadingNotes) {
    return;
  }

  currentLoadToken += 1;
  const token = currentLoadToken;
  const scopeName = getCurrentScopeName();

  beginLoading(`正在准备 ${scopeName}…`);

  try {
    if (activeKnowledgeBaseId) {
      const result = await getKnowledgeNotes(activeKnowledgeBaseId, 1);
      if (token !== currentLoadToken) return;

      replaceNotesForNewScope(result.notes);
      applyContextToLoadState({
        mode: 'owned-knowledge',
        scopeName,
        page: 2,
        hasMore: result.hasMore,
        totalHint: result.total
      });
      showStatus(`已加载 ${scopeName} 的首批 ${allNotes.length} 条笔记`, 'success');
    } else {
      const result = await getNoteList('0', PAGE_SIZE);
      if (token !== currentLoadToken) return;

      replaceNotesForNewScope(result.notes);
      applyContextToLoadState({
        mode: 'all',
        scopeName,
        cursor: result.nextCursor,
        hasMore: result.hasMore,
        totalHint: result.total
      });
      cacheAllScopeSnapshot();
      showStatus(`已快速加载首批 ${allNotes.length} 条笔记`, 'success');
    }

    applyFilters();
    finishLoading('首批结果已就绪');
    saveViewState();
  } catch (error) {
    if (token !== currentLoadToken) return;

    finishLoading();
    showStatus(`加载失败: ${error.message}`);
    const title = activeKnowledgeBaseId ? '我的知识库加载失败' : '加载失败';
    const hint = activeKnowledgeBaseId
      ? '这个知识库的内容暂时没有加载出来，请稍后再试。'
      : '内容暂时没有加载出来，请稍后再试。';
    showEmpty(title, hint);
    renderFilters();
  }
}

async function continueLoadingCurrentFeed(options = {}) {
  const {
    silentProgress = false,
    keepLoader = false
  } = options;

  if (!hasSavedConfig || isLoadingNotes || !loadState.hasMore) {
    return;
  }

  beginLoading(silentProgress
    ? `${loadState.scopeName} · ${formatLoaderProgress()}`
    : `正在加载更多 ${loadState.scopeName}…`);

  try {
    let mergeResult;

    if (loadState.mode === 'owned-knowledge') {
      const result = await getKnowledgeNotes(activeKnowledgeBaseId, loadState.page);
      mergeResult = mergeNotes(allNotes, result.notes);
      allNotes = mergeResult.merged;
      applyContextToLoadState({
        mode: loadState.mode,
        scopeName: loadState.scopeName,
        page: loadState.page + 1,
        hasMore: result.hasMore,
        totalHint: result.total
      });
    } else {
      const result = await getNoteList(loadState.cursor, PAGE_SIZE);
      mergeResult = mergeNotes(allNotes, result.notes);
      allNotes = mergeResult.merged;
      applyContextToLoadState({
        mode: loadState.mode,
        scopeName: loadState.scopeName,
        cursor: result.nextCursor,
        hasMore: result.hasMore,
        totalHint: result.total
      });
      cacheAllScopeSnapshot();
    }

    applyFilters();

    if (silentProgress) {
      showFloatingLoader(`${loadState.scopeName} · ${formatLoaderProgress()}`);
    } else if (mergeResult.addedCount > 0) {
      showStatus(`已补充 ${mergeResult.addedCount} 条内容`, 'success');
    } else {
      showStatus('没有更多内容了', 'info');
    }

    if (keepLoader) {
      isLoadingNotes = false;
      updateLoadButtons();
    } else {
      finishLoading('加载完成');
    }
    saveViewState();
  } catch (error) {
    finishLoading();
    showStatus(`继续加载失败: ${error.message}`);
    renderFilters();
  }
}

async function loadAllRemainingForCurrentFeed() {
  if (!hasSavedConfig || isLoadingNotes || !loadState.hasMore) {
    return;
  }

  pendingLoadAll = true;
  const initialCount = allNotes.length;
  showFloatingLoader(`${loadState.scopeName} · ${formatLoaderProgress()}`);

  while (pendingLoadAll && loadState.hasMore) {
    await continueLoadingCurrentFeed({ silentProgress: true, keepLoader: true });

    if (loadState.hasMore && pendingLoadAll) {
      showFloatingLoader(`${loadState.scopeName} · ${formatLoaderProgress()}`);
      await wait(LOAD_ALL_STEP_DELAY_MS);
    }
  }

  pendingLoadAll = false;

  const addedCount = Math.max(0, allNotes.length - initialCount);
  if (addedCount > 0) {
    showStatus(`已补齐 ${addedCount} 条内容`, 'success');
  } else {
    showStatus('当前已经是最新加载结果', 'info');
  }
  finishLoading('补齐完成');
}

async function refreshNotesForCurrentFilters() {
  pendingLoadAll = false;
  await loadInitialNotesForCurrentScope();
}

async function refreshNotes() {
  await loadOwnedKnowledgeBases({ preserveExisting: false });
  await refreshNotesForCurrentFilters();
  if (loadState.hasMore) {
    await loadAllRemainingForCurrentFeed();
  }
}

function runKeywordSearch() {
  keyword = searchInput.value.trim();
  applyFilters();
}

function resetFilters() {
  keyword = '';
  knowledgeSearchKeyword = '';
  tagSearchKeyword = '';
  activeTagFilters.clear();
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
  const lines = [
    `# ${title}`,
    '',
    `- 日期：${getNoteDate(note) || '未知'}`,
    `- 类型：${note.note_type || 'text'}`,
    `- 标签：${getTags(note).join(' / ') || '无'}`,
    `- 归属：${getTopics(note).join(' / ') || '无'}`,
    ''
  ];

  if (mode === 'ai') {
    lines.push('## AI 总结', '', ai || '暂无 AI 总结', '');
  } else {
    lines.push('## 原文', '', original || '暂无原文', '');
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
    downloadBlob(zipBlob, `Get笔记_${prefix}_${timestamp}.zip`);
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
  filterElements.ownedKnowledgeDropdown?.classList.remove('open');
  filterElements.tagDropdown?.classList.remove('open');
  if (!isOpen) {
    dropdown.classList.add('open');
  }
}

async function saveConfig() {
  const apiKey = apiKeyInput.value.trim();
  const clientId = clientIdInput.value.trim();

  if (!apiKey || !clientId) {
    showStatus('请填写完整的 API 配置');
    return;
  }

  saveConfigLocal(apiKey, clientId);
  apiKeyInput.value = '';
  clientIdInput.value = '';
  apiKeyInput.placeholder = 'API Key 已保存';
  clientIdInput.placeholder = 'Client ID 已保存';
  updateSettingsButtonLabel();
  updateClearConfigVisibility();

  await loadOwnedKnowledgeBases();
  closeSettings();
  await refreshNotesForCurrentFilters();
  saveViewState();
}

function clearConfig() {
  clearConfigLocal();
  clearViewState();
  pendingLoadAll = false;
  currentLoadToken += 1;
  knowledgeBaseSyncState = 'idle';
  activeKnowledgeBaseId = '';
  keyword = '';
  activeTagFilters.clear();
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

  updateSettingsButtonLabel();
  updateClearConfigVisibility();
  renderFilters();
  renderNotes();
  showStatus('本地配置已清除', 'success');
  openSettings();
}

function bindEvents() {
  saveConfigBtn?.addEventListener('click', event => {
    event.preventDefault();
    saveConfig();
  });
  clearConfigBtn?.addEventListener('click', event => {
    event.preventDefault();
    clearConfig();
  });
  refreshBtn?.addEventListener('click', event => {
    event.preventDefault();
    refreshNotes();
  });
  backBtn?.addEventListener('click', event => {
    event.preventDefault();
    detailView?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
      filterElements.ownedKnowledgeDropdown?.classList.remove('open');
      filterElements.tagDropdown?.classList.remove('open');
    }
  });
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
  batchDownloadOriginal: () => batchDownload('original'),
  batchDownloadAi: () => batchDownload('ai')
};

bindEvents();

(async () => {
  fillDetailPlaceholder();
  updateStats();
  renderFilters();
  updateResultsMeta();

  const configured = await checkConfig();
  if (configured) {
    const restored = restoreViewState();
    if (restored) {
      showStatus('已恢复上次浏览内容', 'success');
      renderFilters();
      updateResultsMeta();
      if (ownedKnowledgeBases.length === 0) {
        knowledgeBaseSyncState = 'loading';
        loadOwnedKnowledgeBases({ silent: true, preserveExisting: true });
      } else {
        knowledgeBaseSyncState = 'ready';
      }
    } else {
      showStatus('正在准备你的内容', 'info');
      await loadOwnedKnowledgeBases();
      await refreshNotesForCurrentFilters();
    }
  } else {
    showEmpty('先完成接口设置', '先保存 API Key 和 Client ID，然后就可以开始查看内容。');
    openSettings();
  }
})();
