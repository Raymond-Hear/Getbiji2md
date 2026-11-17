const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const testSource = source.slice(0, source.lastIndexOf('(async () => {'))
  .replace(/^injectEnhancementStyles\(\);$/m, '')
  .replace(/^setupFilterLayout\(\);$/m, '')
  .replace(/^applyProductCopy\(\);$/m, '')
  .replace(/^applyEnvironmentCopy\(\);$/m, '')
  .replace(/^bindEvents\(\);$/m, '');

function createApp(fetchResponse) {
  const storage = new Map([['get-notes-api-key', 'test-key'], ['get-notes-client-id', 'test-client']]);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', value: '', style: {}, hidden: false, disabled: false,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      querySelectorAll() { return []; }, querySelector() { return null; }
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    console, URL, AbortController, Blob, TextEncoder, Uint8Array, DataView,
    setTimeout, clearTimeout, fetch: fetchResponse,
    document: { getElementById: element, querySelector: () => null, querySelectorAll: () => [] },
    window: { location: { protocol: 'http:', hostname: 'localhost' } },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  });
  vm.runInContext(testSource, context);
  vm.runInContext(`
    hasSavedConfig = true;
    filterElements = {
      syncToolbar: document.getElementById('syncToolbar'),
      syncPauseBtn: document.getElementById('syncPauseBtn'),
      syncResumeBtn: document.getElementById('syncResumeBtn'),
      syncFullBtn: document.getElementById('syncFullBtn'),
      syncProgress: document.getElementById('syncProgress'),
      syncHint: document.getElementById('syncHint')
    };
    window.waits = [];
    window.realWait = wait;
    wait = async ms => { window.waits.push(ms); };
    hideSyncGuide = () => {};
    showStatus = (message, kind) => { window.lastStatus = { message, kind }; };
    window.realRenderNotes = renderNotes;
    renderNotes = () => {};
    renderTagOptions = () => {};
    renderTypeOptions = () => {};
    updateDropdownLabels = () => {};
    renderFilters = () => {};
    fillDetailPlaceholder = () => {};
    loadOwnedKnowledgeBases = async () => {};
  `, context);
  return { context, storage, run: code => vm.runInContext(code, context) };
}

function response(data, status = 200, retryAfter = null) {
  return { ok: status >= 200 && status < 300, status,
    headers: { get: () => retryAfter }, json: async () => data };
}

function note(id, type = 'plain_text') {
  return { note_id: String(id), note_type: type, title: `笔记 ${id}`,
    created_at: '2026-03-03 23:59:59', updated_at: '2026-03-04',
    content: `正文 ${id}`, tags: [{ name: '工作' }], topics: [] };
}

test('1000 notes sync automatically; checkpoint every page and preserve order', async () => {
  const notes = Array.from({ length: 1000 }, (_, i) => note(1000 - i));
  let requests = 0;
  const app = createApp(async url => {
    requests++;
    const cursor = Number(new URL(url).searchParams.get('cursor') || 0);
    return response({ success: true, data: { notes: notes.slice(cursor, cursor + 20),
      cursor: String(cursor + 20), has_more: cursor + 20 < notes.length } });
  });
  await app.run('runSyncSession()');
  assert.equal(requests, 50);
  assert.equal(app.run('allNotes.length'), 1000);
  assert.equal(app.run('allNotes[0].note_id'), '1000');
  assert.equal(app.run('allNotes[999].note_id'), '1');
  assert.equal(app.run('syncSession'), null);
  assert.equal(JSON.parse(app.storage.get('get-notes-view-state')).allNotes.length, 1000);
  assert.equal(app.run('allScopeSnapshot.loadState.hasMore'), false);
});

test('pause and reload resumes at saved cursor, keeping selection and type/date filters', async () => {
  let calls = 0;
  let app;
  const fetchPage = async url => {
    calls++;
    const cursor = Number(new URL(url).searchParams.get('cursor') || 0);
    if (calls === 1) app.run('pauseSyncSession()');
    return response({ success: true, data: { notes: [note(cursor + 1, 'audio')],
      cursor: String(cursor + 1), has_more: cursor < 2 } });
  };
  app = createApp(fetchPage);
  app.run(`activeNoteType = 'audio'; customDateStart = '2026-03-03'; customDateEnd = '2026-03-03'; selectedNotes.add('1');`);
  await app.run('runSyncSession()');
  assert.equal(calls, 1);
  assert.equal(app.run('syncSession.cursor'), '1');
  const raw = app.storage.get('get-notes-view-state');
  app = createApp(fetchPage);
  app.storage.set('get-notes-view-state', raw);
  assert.equal(await app.run('restoreViewState()'), true);
  assert.equal(app.run('activeNoteType'), 'audio');
  assert.equal(app.run('selectedNotes.has("1")'), true);
  await app.run('runSyncSession()');
  assert.equal(calls, 3);
  assert.equal(app.run('allNotes.length'), 3);
  assert.equal(app.run('filteredNotes.length'), 3);
});

test('rate limit waits and retries; quota limit stops once with a saved checkpoint', async () => {
  let calls = 0;
  const app = createApp(async () => {
    calls++;
    if (calls === 1) return response({ success: false, error: { reason: 'qps_global' } }, 429, '3');
    return response({ success: true, data: { notes: [note(1)], cursor: '1', has_more: false } });
  });
  await app.run('runSyncSession()');
  assert.equal(calls, 2);
  assert.equal(app.run('allNotes.length'), 1);
  const quota = createApp(async () => response({ success: false,
    error: { reason: 'quota_day', code: 42900 } }, 429));
  await quota.run('runSyncSession()');
  assert.equal(quota.run('syncSession.status'), 'paused');
  assert.match(quota.run('syncSession.error'), /今日接口额度/);
  assert.ok(quota.storage.get('get-notes-view-state'));
});

test('permanent failure and repeated cursor stop rather than loop or report success', async () => {
  let calls = 0;
  const app = createApp(async () => { calls++; return response({}, 401); });
  await app.run('runSyncSession()');
  assert.equal(calls, 1);
  assert.equal(app.run('syncRunning'), false);
  assert.equal(app.run('window.lastStatus.kind'), 'error');
  const repeated = createApp(async () => response({ success: true,
    data: { notes: [note(1)], cursor: '0', has_more: true } }));
  repeated.run('getNoteList = async () => ({ notes: [], nextCursor: "0", hasMore: true })');
  await repeated.run('runSyncSession()');
  assert.equal(repeated.run('syncSession.status'), 'paused');
});

test('pause interrupts a long rate-limit cooldown without sending another request', async () => {
  let calls = 0;
  const app = createApp(async () => {
    calls++;
    return response({ success: false, error: { reason: 'qps_bucket' } }, 429, '120');
  });
  app.run('wait = window.realWait');
  const task = app.run('runSyncSession()');
  setTimeout(() => app.run('pauseSyncSession()'), 10);
  await task;
  assert.equal(calls, 1);
  assert.equal(app.run('syncSession.status'), 'paused');
  assert.equal(app.run('syncSession.error'), '');
  assert.equal(app.run('syncRunning'), false);
});

test('preview and list requests are serialized through the same queue', async () => {
  let active = 0;
  let maximum = 0;
  const app = createApp(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return response({ success: true, data: {} });
  });
  await app.run('Promise.all([apiGet("/note/list"), apiGet("/note/detail"), apiGet("/knowledge/list")])');
  assert.equal(maximum, 1);
  assert.ok(app.run('window.waits.some(ms => ms >= 1000)'), 'queue must apply a minimum request interval');
});

test('unchanged note cards retain DOM identity when another page arrives', () => {
  const app = createApp(async () => response({}));
  class Card {
    constructor(id) { this.dataset = { noteId: id }; this.parent = null; }
    get nextElementSibling() {
      return this.parent?.children[this.parent.children.indexOf(this) + 1] || null;
    }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    replaceWith(card) {
      const parent = this.parent;
      const index = parent.children.indexOf(this);
      parent.children[index] = card; card.parent = parent; this.parent = null;
    }
  }
  const container = app.context.document.getElementById('notesContainer');
  container.children = [];
  Object.defineProperty(container, 'firstElementChild', { get: () => container.children[0] || null });
  container.querySelectorAll = () => container.children;
  container.replaceChildren = () => { container.children.forEach(card => { card.parent = null; }); container.children = []; };
  container.insertBefore = (card, next) => {
    card.remove();
    const index = next ? container.children.indexOf(next) : container.children.length;
    container.children.splice(index, 0, card); card.parent = container;
  };
  app.context.document.createElement = tag => {
    if (tag === 'div') {
      const div = { textContent: '' };
      Object.defineProperty(div, 'innerHTML', { get: () => String(div.textContent).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') });
      return div;
    }
    const template = { content: {} };
    Object.defineProperty(template, 'innerHTML', { set: markup => {
      template.content.firstElementChild = new Card(markup.match(/data-note-id="([^"]+)"/)[1]);
    } });
    return template;
  };
  app.context.notes = [note(2), note(1)];
  app.run('allNotes = notes; filteredNotes = notes; window.realRenderNotes()');
  const first = container.children[0];
  const second = container.children[1];
  app.context.more = note(0);
  app.run('allNotes = [...notes, more]; filteredNotes = allNotes; window.realRenderNotes()');
  assert.equal(container.children.length, 3);
  assert.equal(container.children[0], first);
  assert.equal(container.children[1], second);
});

test('types are separate from system type tags and combine with keyword, tag, and single-day date', () => {
  const app = createApp(async () => response({}));
  app.context.notes = [note(1, 'audio'), note(2, 'link'), note(3, 'img_text'), note(4, 'video'), note(5, 'plain_text'), note(6, 'pdf')];
  assert.equal(app.run('notes.map(getNoteType).join(",")'), 'audio,web,image,video,text,other');
  app.run(`notes[0].tags.push({ name: '录音笔记', type: 'system' }); activeNoteType = 'audio';
    activeTagFilters.add('工作'); keyword = '正文'; customDateStart = '2026-03-03'; customDateEnd = '2026-03-03';`);
  assert.equal(app.run('getTags(notes[0]).join(",")'), '工作');
  assert.equal(app.run('notes.filter(noteMatchesFilters).length'), 1);
  app.run('customDateEnd = "2026-03-02"');
  assert.equal(app.run('notes.filter(noteMatchesFilters).length'), 0);
});

test('recent check updates edited notes and preserves history; full sync reconciles deletions', async () => {
  const remote = [note(3), note(2), note(1)];
  remote[1].content = '修改后的正文';
  const app = createApp(async () => response({ success: true, data: { notes: remote, cursor: '3', has_more: false } }));
  app.context.previous = [note(2), note(1), note(0)];
  app.run(`allScopeSnapshot = { notes: previous, loadState: { mode: 'all', cursor: '3', hasMore: false } }; allNotes = previous;`);
  await app.run('runSyncSession()');
  assert.equal(app.run('allNotes.length'), 4);
  assert.equal(app.run('allNotes.find(note => note.note_id === "2").content'), '修改后的正文');
  await app.run('runSyncSession({ full: true })');
  assert.equal(app.run('allNotes.length'), 3);
  assert.equal(app.run('allNotes.some(note => note.note_id === "0")'), false);
});
