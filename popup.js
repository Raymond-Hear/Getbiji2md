const API_BASE = 'https://openapi.biji.com/open/api/v1/resource';
const STORAGE_KEYS = {
  apiKey: 'get-notes-api-key',
  clientId: 'get-notes-client-id'
};

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
const topicDropdown = document.getElementById('topicDropdown');
const tagDropdown = document.getElementById('tagDropdown');
const topicDropdownBtn = document.getElementById('topicDropdownBtn');
const tagDropdownBtn = document.getElementById('tagDropdownBtn');
const topicDropdownLabel = document.getElementById('topicDropdownLabel');
const tagDropdownLabel = document.getElementById('tagDropdownLabel');
const topicFilterSearch = document.getElementById('topicFilterSearch');
const tagFilterSearch = document.getElementById('tagFilterSearch');
const topicFilters = document.getElementById('topicFilters');
const tagFilters = document.getElementById('tagFilters');
const activeFilters = document.getElementById('activeFilters');
const resultsMeta = document.getElementById('resultsMeta');

let allNotes = [];
let filteredNotes = [];
let knowledgeBases = [];
let lastCursor = '0';
let currentNoteId = null;
let keyword = '';
let hasSavedConfig = false;
let isLoadingNotes = false;
let hasMoreNotes = false;
let topicFilterKeyword = '';
let tagFilterKeyword = '';

const selectedNotes = new Set();
const activeTopicFilters = new Set();
const activeTagFilters = new Set();
const detailCache = new Map();

const RATE_LIMIT_STATUS = 429;
const DETAIL_FETCH_DELAY_MS = 450;
const DETAIL_FETCH_RETRY_DELAY_MS = 1400;
const DETAIL_FETCH_MAX_RETRIES = 3;

detailView.classList.add('active');

function openSettings() {
  settingsOverlay?.classList.add('open');
}

function closeSettings() {
  settingsOverlay?.classList.remove('open');
}

function showStatus(message, type = 'error') {
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
}

function showLoading(text = '加载中...') {
  notesContainer.innerHTML = `<div class="loading"><span class="spinner"></span>${escapeHtml(text)}</div>`;
}

function showEmpty(title, hint) {
  const showAction = !hasSavedConfig;
  notesContainer.innerHTML = `
    <div class="empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(hint)}</p>
      ${showAction ? '<button id="emptyStateSettingsBtn" class="btn btn-primary" style="margin-top: 16px;">去设置</button>' : ''}
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

function getNoteId(note) {
  return String(note.note_id || note.id || '');
}

function getTopics(note) {
  return (note.topics || []).map(topic => topic.name).filter(Boolean);
}

function getTopicEntries(note) {
  return (note.topics || []).map(topic => ({
    id: String(topic.topic_id || topic.id || topic.name || ''),
    name: topic.name || ''
  })).filter(topic => topic.id && topic.name);
}

function getTags(note) {
  return (note.tags || []).map(tag => tag.name).filter(Boolean);
}

function getNoteDate(note) {
  return note.created_at ? note.created_at.slice(0, 10) : '';
}

function getSearchText(note) {
  return [
    note.title || '',
    note.content || '',
    note.web_page?.content || '',
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

function buildKnowledgeBaseOptions() {
  return knowledgeBases
    .filter(item => item && item.id && item.name)
    .map(item => ({ id: String(item.id), name: item.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
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

function updateDropdownLabels() {
  topicDropdownLabel.textContent = activeTopicFilters.size > 0
    ? `已选 ${activeTopicFilters.size} 个知识库`
    : (knowledgeBases.length > 0 ? '选择知识库范围' : '配置后自动加载');

  tagDropdownLabel.textContent = activeTagFilters.size > 0
    ? `已选 ${activeTagFilters.size} 个标签`
    : (allNotes.length > 0 ? '从当前结果中选择标签' : '加载结果后可选');
}

function updateSettingsButtonLabel() {
  if (!openSettingsBtn) return;
  openSettingsBtn.textContent = hasSavedConfig ? '设置' : '先去设置';
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
    addedCount++;
  }

  return { merged, addedCount };
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
}

function renderFilterSection(container, items, activeSet, type, searchTerm = '') {
  const visibleItems = items.filter(item => {
    const label = typeof item === 'string' ? item : item.name;
    return label.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (items.length === 0) {
    container.innerHTML = `<div class="filter-empty">${type === 'topic' ? '配置后自动加载知识库' : '加载结果后自动提取标签'}</div>`;
    return;
  }

  if (visibleItems.length === 0) {
    container.innerHTML = '<div class="filter-empty">没有匹配的选项</div>';
    return;
  }

  container.innerHTML = visibleItems.map(item => {
    const value = typeof item === 'string' ? item : item.id;
    const label = typeof item === 'string' ? item : item.name;
    return `
      <label class="filter-option">
        <input
          type="checkbox"
          class="filter-option-check"
          data-filter-type="${type}"
          data-filter-value="${escapeHtml(value)}"
          ${activeSet.has(value) ? 'checked' : ''}
        >
        <span class="filter-option-text">${escapeHtml(label)}</span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('.filter-option-check').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const value = checkbox.dataset.filterValue;
      const set = type === 'topic' ? activeTopicFilters : activeTagFilters;
      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      applyFilters();
    });
  });
}

function renderActiveFilters() {
  const parts = [];

  if (keyword) {
    parts.push(`<span class="mini-chip tag">搜索：${escapeHtml(keyword)}</span>`);
  }

  activeTopicFilters.forEach(topicId => {
    const topic = knowledgeBases.find(item => String(item.id) === String(topicId));
    parts.push(`<span class="mini-chip topic">知识库：${escapeHtml(topic?.name || topicId)}</span>`);
  });

  activeTagFilters.forEach(tag => {
    parts.push(`<span class="mini-chip tag">标签：${escapeHtml(tag)}</span>`);
  });

  if (parts.length === 0) {
    activeFilters.className = 'active-filters empty';
    activeFilters.textContent = '还没有启用任何筛选条件';
    return;
  }

  activeFilters.className = 'active-filters';
  activeFilters.innerHTML = parts.join('');
}

function renderFilterChips() {
  renderFilterSection(topicFilters, buildKnowledgeBaseOptions(), activeTopicFilters, 'topic', topicFilterKeyword);
  renderFilterSection(tagFilters, buildUniqueValues(allNotes, getTags), activeTagFilters, 'tag', tagFilterKeyword);
  renderActiveFilters();
  updateDropdownLabels();
}

function noteMatchesFilters(note) {
  const topicEntries = getTopicEntries(note);
  const topicIds = topicEntries.map(topic => String(topic.id));
  const tags = getTags(note);
  const searchable = getSearchText(note);

  const matchKeyword = !keyword || searchable.includes(keyword.toLowerCase());
  const matchTopics = activeTopicFilters.size === 0 || Array.from(activeTopicFilters).every(topicId => topicIds.includes(String(topicId)));
  const matchTags = activeTagFilters.size === 0 || Array.from(activeTagFilters).every(tag => tags.includes(tag));

  return matchKeyword && matchTopics && matchTags;
}

function updateResultsMeta() {
  if (allNotes.length === 0) {
    resultsMeta.textContent = hasSavedConfig ? '正在等待首批结果' : '完成设置后会自动加载结果';
    return;
  }

  const hasFilters = Boolean(keyword) || activeTopicFilters.size > 0 || activeTagFilters.size > 0;
  resultsMeta.textContent = hasFilters
    ? `共加载 ${allNotes.length} 条，当前命中 ${filteredNotes.length} 条`
    : `共加载 ${allNotes.length} 条，可继续搜索、筛选并批量下载`;
}

function renderNotes() {
  if (filteredNotes.length === 0) {
    if (allNotes.length === 0) {
      showEmpty('还没有结果', hasSavedConfig ? '系统会在配置可用后自动拉取笔记。' : '先完成设置，然后系统会自动加载数据。');
    } else {
      showEmpty('没有匹配结果', '换一个关键词，或者清空当前筛选条件。');
    }
    updateStats();
    updateResultsMeta();
    return;
  }

  notesContainer.innerHTML = filteredNotes.map(note => {
    const noteId = getNoteId(note);
    const topics = getTopics(note);
    const tags = getTags(note);
    const summary = note.content || note.web_page?.content || '暂无摘要内容';
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
          <div class="note-summary">${escapeHtml(summary)}</div>
          <div class="tag-row">
            ${topics.map(topic => `<button type="button" class="mini-chip topic note-filter-trigger" data-filter-type="topic-name" data-filter-label="${escapeHtml(topic)}">${escapeHtml(topic)}</button>`).join('')}
            ${tags.map(tag => `<button type="button" class="mini-chip tag note-filter-trigger" data-filter-type="tag" data-filter-value="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}
          </div>
        </div>
        <div class="note-open">></div>
      </article>
    `;
  }).join('');

  notesContainer.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', event => {
      if (event.target.closest('.note-check') || event.target.closest('.note-filter-trigger')) {
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

  notesContainer.querySelectorAll('.note-filter-trigger').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const type = button.dataset.filterType;
      if (type === 'tag') {
        activeTagFilters.add(button.dataset.filterValue);
      } else {
        const topic = knowledgeBases.find(item => item.name === button.dataset.filterLabel);
        if (topic) {
          activeTopicFilters.add(String(topic.id));
        }
      }
      applyFilters();
    });
  });

  updateStats();
  updateResultsMeta();
}

function applyFilters() {
  filteredNotes = allNotes.filter(noteMatchesFilters);
  renderFilterChips();
  renderNotes();
}

function resetFilters() {
  keyword = '';
  topicFilterKeyword = '';
  tagFilterKeyword = '';
  searchInput.value = '';
  topicFilterSearch.value = '';
  tagFilterSearch.value = '';
  activeTopicFilters.clear();
  activeTagFilters.clear();
  applyFilters();
}

function fillDetailPlaceholder() {
  document.getElementById('detailTitle').textContent = '点击任意笔记查看详情';
  document.getElementById('detailMeta').textContent = '这里会显示类型、日期、知识库和标签。';
  document.getElementById('originalContent').textContent = '打开一条笔记后，这里会显示原文。';
  document.getElementById('originalContent').classList.add('empty');
  document.getElementById('aiContent').textContent = '如果有 AI 总结，这里会显示对应内容。';
  document.getElementById('aiContent').classList.add('empty');
}

function renderDetail(note) {
  let meta = `${note.note_type || 'text'} | ${getNoteDate(note) || '未知日期'}`;
  const topics = getTopics(note);
  const tags = getTags(note);

  if (topics.length > 0) {
    meta += ` | 知识库：${topics.join(' / ')}`;
  }
  if (tags.length > 0) {
    meta += ` | 标签：${tags.join(' / ')}`;
  }

  document.getElementById('detailTitle').textContent = note.title || '未标题笔记';
  document.getElementById('detailMeta').textContent = meta;

  const originalEl = document.getElementById('originalContent');
  const originalContent = note.web_page?.content || '';
  if (originalContent) {
    originalEl.textContent = originalContent;
    originalEl.classList.remove('empty');
  } else {
    originalEl.textContent = '无原文内容';
    originalEl.classList.add('empty');
  }

  const aiEl = document.getElementById('aiContent');
  const aiContent = note.content || '';
  if (aiContent && aiContent !== originalContent) {
    aiEl.textContent = aiContent;
    aiEl.classList.remove('empty');
  } else {
    aiEl.textContent = '无 AI 总结内容';
    aiEl.classList.add('empty');
  }
}

async function apiGet(path, params = {}) {
  const apiKey = getApiKey();
  const clientId = getClientId();

  if (!apiKey || !clientId) {
    throw new Error('请先完成接口设置');
  }

  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  url.searchParams.set('_t', Date.now().toString());

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

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function textToUint8Array(text) {
  return new TextEncoder().encode(text);
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = ((date.getHours() & 0x1F) << 11)
    | ((date.getMinutes() & 0x3F) << 5)
    | Math.floor(date.getSeconds() / 2);
  const dosDate = (((year - 1980) & 0x7F) << 9)
    | (((date.getMonth() + 1) & 0x0F) << 5)
    | (date.getDate() & 0x1F);
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

async function getKnowledgeList() {
  const resp = await apiGet('/knowledge/list', { page: 1 });
  if (!resp.success) {
    throw new Error(resp.error?.message || '获取知识库列表失败');
  }
  return resp.data?.topics || [];
}

async function getNoteList(cursor = '0', limit = 20) {
  const params = { limit };
  if (cursor && cursor !== '0') {
    params.cursor = cursor;
  } else {
    params.since_id = '0';
  }

  const resp = await apiGet('/note/list', params);
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
    total: resp.data?.total || notes.length
  };
}

async function getNoteDetail(noteId) {
  const resp = await apiGet('/note/detail', { id: noteId });
  if (!resp.success) {
    throw new Error(resp.error?.message || '获取笔记详情失败');
  }
  return resp.data.note;
}

async function getNoteDetailWithRetry(noteId) {
  let attempt = 0;

  while (attempt <= DETAIL_FETCH_MAX_RETRIES) {
    try {
      return await getNoteDetail(noteId);
    } catch (error) {
      attempt += 1;
      const message = error?.message || '';
      const isRateLimited = message.includes(`(${RATE_LIMIT_STATUS})`);

      if (!isRateLimited || attempt > DETAIL_FETCH_MAX_RETRIES) {
        throw error;
      }

      const backoff = DETAIL_FETCH_RETRY_DELAY_MS * attempt;
      showStatus(`请求过快，正在等待后重试 (${attempt}/${DETAIL_FETCH_MAX_RETRIES})...`, 'info');
      await wait(backoff);
    }
  }

  throw new Error('获取笔记详情失败');
}

async function getCachedOrFetchDetail(noteId) {
  const cached = detailCache.get(noteId);
  if (cached) {
    return { note: cached, fromCache: true };
  }

  const note = await getNoteDetailWithRetry(noteId);
  detailCache.set(noteId, note);
  return { note, fromCache: false };
}

async function loadKnowledgeBases() {
  if (!hasSavedConfig) {
    knowledgeBases = [];
    renderFilterChips();
    return;
  }

  try {
    knowledgeBases = (await getKnowledgeList()).map(topic => ({
      id: String(topic.topic_id || topic.id || topic.name || ''),
      name: topic.name || ''
    })).filter(topic => topic.id && topic.name);
    renderFilterChips();
  } catch (error) {
    showStatus(`获取知识库列表失败: ${error.message}`);
  }
}

async function openNoteDetail(noteId) {
  currentNoteId = noteId;
  document.getElementById('detailTitle').textContent = '加载中...';
  document.getElementById('detailMeta').textContent = '';
  document.getElementById('originalContent').textContent = '加载中...';
  document.getElementById('aiContent').textContent = '加载中...';

  try {
    const { note } = await getCachedOrFetchDetail(noteId);
    renderDetail(note);
  } catch (error) {
    showStatus(`加载详情失败: ${error.message}`);
  }
}

function goBack() {
  currentNoteId = null;
  fillDetailPlaceholder();
}

async function downloadCurrentNote(type) {
  if (!currentNoteId) {
    showStatus('请先打开一条笔记再下载');
    return;
  }

  try {
    const { note } = await getCachedOrFetchDetail(currentNoteId);
    const title = sanitizeFilename(note.title || '笔记');
    const prefix = type === 'original' ? '原文' : 'AI总结';
    const content = type === 'original' ? (note.web_page?.content || '') : (note.content || '');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${title}_${prefix}.md`);
    showStatus(`已下载${type === 'original' ? '原文' : 'AI 总结'}：${note.title || '未标题笔记'}`, 'success');
  } catch (error) {
    showStatus(`下载失败: ${error.message}`);
  }
}

async function batchDownload(type) {
  if (selectedNotes.size === 0) {
    showStatus('先选中需要下载的笔记');
    return;
  }

  try {
    const prefix = type === 'original' ? '原文' : 'AI总结';
    showStatus(`正在准备打包 ${selectedNotes.size} 条${prefix}...`, 'info');
    const files = [];
    const noteIds = Array.from(selectedNotes);

    for (let index = 0; index < noteIds.length; index++) {
      const noteId = noteIds[index];
      showStatus(`正在打包 ${index + 1}/${noteIds.length} 条${prefix}...`, 'info');

      const { note, fromCache } = await getCachedOrFetchDetail(noteId);
      const content = type === 'original' ? (note.web_page?.content || '') : (note.content || '');
      files.push({
        name: `${sanitizeFilename(note.title || '笔记')}_${prefix}.md`,
        content: textToUint8Array(content),
        date: new Date()
      });

      if (index < noteIds.length - 1 && !fromCache) {
        await wait(DETAIL_FETCH_DELAY_MS);
      } else if (index < noteIds.length - 1) {
        await wait(120);
      }
    }

    const zipBlob = buildZip(files);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBlob(zipBlob, `Get笔记_${prefix}_${timestamp}.zip`);
    showStatus(`已打包下载 ${files.length} 条${prefix}，输出为 zip`, 'success');
  } catch (error) {
    showStatus(`打包下载失败: ${error.message || '未知错误'}`);
    console.error('batchDownload failed', error);
  }
}

async function loadNotes(cursor = '0', append = false) {
  if (isLoadingNotes || !hasSavedConfig) {
    return;
  }

  isLoadingNotes = true;
  if (!append) {
    showLoading('正在自动加载笔记...');
  } else {
    showStatus('正在加载更多笔记...', 'info');
  }

  try {
    const result = await getNoteList(cursor, 20);

    if (append) {
      const { merged, addedCount } = mergeNotes(allNotes, result.notes);
      allNotes = merged;
      showStatus(addedCount === 0 ? '没有加载到新的笔记，可能已到底部' : `新增加载 ${addedCount} 条笔记`, addedCount === 0 ? 'error' : 'success');
    } else {
      allNotes = result.notes;
      selectedNotes.clear();
      detailCache.clear();
      currentNoteId = null;
      fillDetailPlaceholder();
      showStatus(`已自动加载 ${allNotes.length} 条笔记`, 'success');
    }

    lastCursor = result.nextCursor;
    hasMoreNotes = result.hasMore;
    loadMoreContainer.style.display = hasMoreNotes ? 'block' : 'none';
    applyFilters();
  } catch (error) {
    showStatus(`加载失败: ${error.message}`);
    if (!append) {
      showEmpty('加载失败', '如果这是独立网站模式，请确认接口允许网页直接访问；若接口没有开放 CORS，还需要后端代理。');
    }
  } finally {
    isLoadingNotes = false;
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

  await loadKnowledgeBases();
  closeSettings();
  lastCursor = '0';
  hasMoreNotes = false;
  loadNotes('0', false);
}

function refreshNotes() {
  if (!hasSavedConfig) {
    showStatus('请先完成接口设置', 'error');
    openSettings();
    return;
  }

  lastCursor = '0';
  hasMoreNotes = false;
  loadNotes('0', false);
}

async function checkConfig() {
  const apiKey = getApiKey();
  const clientId = getClientId();

  if (apiKey && clientId) {
    hasSavedConfig = true;
    apiKeyInput.value = '';
    clientIdInput.value = '';
    apiKeyInput.placeholder = 'API Key 已保存';
    clientIdInput.placeholder = 'Client ID 已保存';
    updateSettingsButtonLabel();
    return true;
  }

  updateSettingsButtonLabel();
  return false;
}

function runKeywordSearch() {
  keyword = searchInput.value.trim();
  applyFilters();
}

function toggleDropdown(target) {
  [topicDropdown, tagDropdown].forEach(dropdown => {
    if (dropdown === target) {
      dropdown.classList.toggle('open');
    } else {
      dropdown.classList.remove('open');
    }
  });
}

saveConfigBtn?.addEventListener('click', event => {
  event.preventDefault();
  saveConfig();
});
refreshBtn?.addEventListener('click', event => {
  event.preventDefault();
  refreshNotes();
});
backBtn?.addEventListener('click', goBack);
downloadOriginalBtn?.addEventListener('click', () => downloadCurrentNote('original'));
downloadAiBtn?.addEventListener('click', () => downloadCurrentNote('ai'));
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
topicDropdownBtn?.addEventListener('click', event => {
  event.stopPropagation();
  toggleDropdown(topicDropdown);
});
tagDropdownBtn?.addEventListener('click', event => {
  event.stopPropagation();
  toggleDropdown(tagDropdown);
});
topicFilterSearch?.addEventListener('input', () => {
  topicFilterKeyword = topicFilterSearch.value.trim();
  renderFilterChips();
});
tagFilterSearch?.addEventListener('input', () => {
  tagFilterKeyword = tagFilterSearch.value.trim();
  renderFilterChips();
});
searchInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    runKeywordSearch();
  }
});
document.addEventListener('click', event => {
  if (!event.target.closest('.filter-dropdown')) {
    topicDropdown.classList.remove('open');
    tagDropdown.classList.remove('open');
  }
});
settingsOverlay?.addEventListener('click', event => {
  if (event.target === settingsOverlay) {
    closeSettings();
  }
});
notesContainer?.addEventListener('scroll', () => {
  const remaining = notesContainer.scrollHeight - notesContainer.scrollTop - notesContainer.clientHeight;
  if (remaining < 120 && hasMoreNotes && !isLoadingNotes) {
    loadNotes(lastCursor, true);
  }
});

window.__getNotesApp = {
  openSettings,
  closeSettings,
  saveConfig,
  refreshNotes,
  batchDownloadOriginal: () => batchDownload('original'),
  batchDownloadAi: () => batchDownload('ai')
};

(async () => {
  fillDetailPlaceholder();
  updateStats();
  renderFilterChips();
  updateResultsMeta();
  updateDropdownLabels();
  updateSettingsButtonLabel();

  const configured = await checkConfig();
  if (configured) {
    showStatus('配置已识别，正在自动加载数据', 'info');
    await loadKnowledgeBases();
    loadNotes('0', false);
  } else {
    showEmpty('先完成接口设置', '第一次使用时先保存 API Key 和 Client ID。');
    openSettings();
  }
})();
