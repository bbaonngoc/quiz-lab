import { icon } from './icons.js';

const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let pending;

export function validateMemoryData(input) {
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const ids = new Set(), numbers = new Set();
  const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value) && !ids.has(value);
  const requireValue = (condition, message) => { if (!condition) throw new Error(`Mẹo ghi nhớ: ${message}`); };
  requireValue(input?.schemaVersion === 1 && text(input.title), 'dữ liệu không đúng cấu trúc.');
  requireValue(text(input.source?.fileName) && text(input.source?.sheet) && /^[a-f0-9]{64}$/.test(input.source?.sha256 || ''), 'thiếu thông tin nguồn Excel.');
  requireValue(Array.isArray(input.chapters) && input.chapters.length > 0 && input.chapters.length <= 100, 'thiếu danh sách chương.');
  let count = 0;
  for (const chapter of input.chapters) {
    requireValue(validId(chapter?.id) && text(chapter.label), 'chương thiếu nhãn hoặc trùng ID.'); ids.add(chapter.id);
    requireValue(Array.isArray(chapter.sections) && chapter.sections.length > 0, 'chương không có phần.');
    for (const section of chapter.sections) {
      requireValue(validId(section?.id) && text(section.label), 'phần thiếu nhãn hoặc trùng ID.'); ids.add(section.id);
      requireValue(Array.isArray(section.rows) && section.rows.length > 0, 'phần không có nội dung.');
      for (const row of section.rows) {
        requireValue(validId(row?.id) && Number.isSafeInteger(row.stt) && row.stt > 0 && !numbers.has(row.stt), 'nội dung có ID hoặc STT không hợp lệ.');
        requireValue(text(row.topic) && text(row.details) && text(row.tip) && Number.isSafeInteger(row.sourceRow) && row.sourceRow > 2, 'thiếu chủ đề, nội dung chi tiết hoặc mẹo ghi nhớ.');
        ids.add(row.id); numbers.add(row.stt); count++;
        requireValue(count <= 5000, 'vượt quá số nội dung cho phép.');
      }
    }
  }
  // Validate only. Source strings, including whitespace and punctuation, stay intact.
  return input;
}

export function loadMemoryTips() {
  if (!pending) pending = (async () => {
    const response = await fetch(new URL('../data/memory-tips.json', import.meta.url), {signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Chưa tải được Mẹo ghi nhớ. Vui lòng thử lại.');
    return validateMemoryData(await response.json());
  })().catch(error => { pending = null; throw error; });
  return pending;
}

export function memorySelection(data, chapterId, sectionId) {
  const chapter = data.chapters.find(chapter => chapter.id === chapterId) || data.chapters[0];
  const section = chapter.sections.find(section => section.id === sectionId) || chapter.sections[0];
  return {chapter, section};
}

export function renderMemoryPage(data, {chapterId, sectionId, expanded = new Set()} = {}) {
  const {chapter, section} = memorySelection(data, chapterId, sectionId);
  const total = data.chapters.reduce((count, chapter) => count + chapter.sections.reduce((count, section) => count + section.rows.length, 0), 0);
  const opened = section.rows.filter(row => expanded.has(row.id)).length;
  const choices = (items, current) => items.map(item => `<option value="${esc(item.id)}" ${item.id === current ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
  return `<section class="memory-page"><div class="page-heading"><h1>Mẹo ghi nhớ</h1><span class="memory-count">${section.rows.length} / ${total} mục</span></div>
    <div class="memory-controls"><div class="memory-selects"><label class="field-label" for="memory-chapter">Chương<select id="memory-chapter" class="select">${choices(data.chapters,chapter.id)}</select></label><label class="field-label" for="memory-section">Phần<select id="memory-section" class="select" ${chapter.sections.length === 1 ? 'disabled' : ''}>${choices(chapter.sections,section.id)}</select></label></div><div class="memory-actions"><button type="button" class="btn secondary" data-action="memory-open-all" ${opened === section.rows.length ? 'disabled' : ''}>Mở tất cả</button><button type="button" class="btn secondary" data-action="memory-close-all" ${opened === 0 ? 'disabled' : ''}>Thu gọn</button></div></div>
    <div class="memory-section-heading"><h2 id="memory-section-title">${esc(section.label === '—' ? chapter.label : section.label)}</h2><p>Nhấn vào từng hàng để xem hoặc ẩn nội dung chi tiết.</p></div>
    <div class="memory-table" role="table" aria-labelledby="memory-section-title" aria-colcount="2" aria-rowcount="${section.rows.length + 1}"><div class="memory-table-head" role="row"><div role="columnheader">Chủ đề / Nội dung</div><div role="columnheader">${icon('bulb')} Mẹo ghi nhớ</div></div>
    ${section.rows.map(row => {
      const open = expanded.has(row.id);
      return `<div class="memory-row" role="row" data-memory-row="${esc(row.id)}"><div class="memory-topic" role="cell"><button type="button" class="memory-toggle" data-action="memory-toggle" data-value="${esc(row.id)}" aria-expanded="${open}" aria-controls="memory-detail-${esc(row.id)}"><span class="memory-topic-title">${esc(row.topic)}</span><span class="memory-toggle-label">${open ? 'Ẩn nội dung' : 'Xem nội dung'} ${icon('chevron')}</span></button><div id="memory-detail-${esc(row.id)}" class="memory-detail" ${open ? '' : 'hidden'}><p class="memory-detail-text">${esc(row.details)}</p></div></div><div class="memory-tip" role="cell"><span class="memory-tip-label">Mẹo ghi nhớ</span><p>${esc(row.tip)}</p></div></div>`;
    }).join('')}</div></section>`;
}
