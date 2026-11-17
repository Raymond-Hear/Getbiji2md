// Synthetic data only. Loaded exclusively by the local preview server.
(() => {
  const types = ['plain_text', 'audio', 'link', 'img_text', 'video', 'pdf'];
  const labels = ['文本笔记', '录音笔记', '链接笔记', '图文笔记', '视频笔记', '其他笔记'];
  const notes = Array.from({ length: 1000 }, (_, index) => ({
    note_id: String(1000 - index), title: `${labels[index % types.length]} · 测试 ${index + 1}`,
    note_type: types[index % types.length], content: '这是一条用于验证同步与组合筛选的模拟笔记。',
    created_at: index % 2 ? '2026-03-03 23:59:59' : '2026-10-04 12:00:00',
    updated_at: '2026-10-04 12:00:00',
    tags: [{ name: '学习', type: 'user' }, { name: labels[index % types.length], type: 'system' }],
    topics: [{ id: 'test-topic', name: '测试知识库' }]
  }));
  const initial = notes.slice(0, 40);
  const feed = { mode: 'all', cursor: '40', page: 1, hasMore: true, scopeName: '全部笔记', totalHint: 1000 };
  // Each preview reload deliberately restores a clean synthetic dataset.
  localStorage.setItem('get-notes-api-key', 'synthetic-preview-key');
  localStorage.setItem('get-notes-client-id', 'synthetic-preview-client');
  localStorage.setItem('get-notes-view-state', JSON.stringify({
    allNotes: initial, loadState: feed, allScopeSnapshot: { notes: initial, loadState: feed },
    ownedKnowledgeBases: [{ id: 'test-topic', name: '测试知识库' }]
  }));
  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, options) => {
    const parsed = new URL(url, location.href);
    if (parsed.hostname !== 'openapi.biji.com') return realFetch(url, options);
    const cursor = Number(parsed.searchParams.get('cursor') || 0);
    const payload = parsed.pathname.endsWith('/note/list')
      ? { notes: notes.slice(cursor, cursor + 20), cursor: String(cursor + 20), has_more: cursor + 20 < notes.length, total: notes.length }
      : parsed.pathname.endsWith('/note/detail')
        ? { note: notes.find(note => note.note_id === parsed.searchParams.get('id')) }
        : { topics: [{ id: 'test-topic', name: '测试知识库' }], has_more: false };
    return new Response(JSON.stringify({ success: true, data: payload }), { headers: { 'Content-Type': 'application/json' } });
  };
})();
