import { validateBank, isUserRole, questionsForRole } from './model.js';

export const SCHEMA_VERSION = 2;
const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const hashPattern = /^[a-f0-9]{64}$/;
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export function validateManifest(value) {
  requireValue(value?.schemaVersion === SCHEMA_VERSION, 'Cấu trúc ngân hàng mới cần phiên bản ứng dụng tương thích.');
  requireValue(typeof value.dataVersion === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.dataVersion), 'Phiên bản dữ liệu không hợp lệ.');
  requireValue(typeof value.title === 'string' && value.title.trim(), 'Thiếu tên ngân hàng.');
  requireValue(Array.isArray(value.chapters) && value.chapters.length === 5 && Array.isArray(value.sections) && value.sections.length === 8, 'Ngân hàng phải có 5 chương và 8 mục.');
  requireValue(Array.isArray(value.difficulties) && value.difficulties.length > 0 && value.difficulties.length <= 20 && value.difficulties.every(v => typeof v === 'string' && v.trim()) && new Set(value.difficulties).size === value.difficulties.length, 'Danh mục mức độ không hợp lệ.');
  const ids = new Set(), orders = new Set();
  const chapters = value.chapters.map(c => {
    requireValue(validId(c.id) && !ids.has(c.id) && typeof c.label === 'string' && c.label.trim() && Number.isInteger(c.order) && c.order > 0 && !orders.has(c.order), 'Chương bị trùng hoặc không hợp lệ.');
    ids.add(c.id); orders.add(c.order);
    return { id: c.id, label: c.label, order: c.order };
  }).sort((a,b) => a.order-b.order);
  const sectionIds = new Set(), sectionOrders = new Set(), partKeys = new Set();
  const sections = value.sections.map(s => {
    const partKey = `${s.chapterId}/${s.partNumber}`;
    requireValue(validId(s.id) && !sectionIds.has(s.id) && ids.has(s.chapterId) && typeof s.title === 'string' && s.title.trim() && (s.partNumber === null || Number.isInteger(s.partNumber) && s.partNumber > 0) && !partKeys.has(partKey), 'Mục nội dung bị trùng hoặc không hợp lệ.');
    requireValue(Number.isInteger(s.order) && s.order > 0 && !sectionOrders.has(s.order) && Number.isInteger(s.count) && s.count > 0 && hashPattern.test(s.sha256), 'Số câu, thứ tự hoặc hash không hợp lệ.');
    requireValue(s.url === `releases/${value.dataVersion}/${s.id}.json`, 'Đường dẫn dữ liệu phải thuộc phiên bản và mục đã khai báo.');
    sectionIds.add(s.id); sectionOrders.add(s.order); partKeys.add(partKey);
    return { id:s.id, chapterId:s.chapterId, partNumber:s.partNumber, order:s.order, title:s.title, url:s.url, sha256:s.sha256, count:s.count };
  }).sort((a,b) => a.order-b.order);
  for (const c of chapters) {
    const children = sections.filter(s => s.chapterId === c.id);
    requireValue(children.length > 0 && (children.length === 1 ? children[0].partNumber === null : children.every(s => s.partNumber !== null)), 'Cấp chương/phần không nhất quán.');
  }
  requireValue(Number.isInteger(value.count) && value.count > 0 && value.count <= 10000 && sections.reduce((n,s) => n+s.count,0) === value.count, 'Tổng số câu không khớp.');
  return { schemaVersion:SCHEMA_VERSION, dataVersion:value.dataVersion, title:value.title, difficulties:[...value.difficulties], count:value.count, chapters, sections };
}

export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2,'0')).join('');
}

export async function assembleBank(input, payloads) {
  const manifest = validateManifest(input);
  requireValue(payloads.length === manifest.sections.length, 'Chưa tải đủ 8 mục nội dung.');
  const questions = [];
  for (let i=0;i<manifest.sections.length;i++) {
    const section = manifest.sections[i], bytes = payloads[i];
    requireValue(await sha256(bytes) === section.sha256, `Dữ liệu ${section.title} không khớp hash.`);
    const part = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    requireValue(part?.schemaVersion === SCHEMA_VERSION && part.dataVersion === manifest.dataVersion && part.sectionId === section.id && Array.isArray(part.questions) && part.questions.length === section.count, `Dữ liệu ${section.title} không khớp phiên bản hoặc số câu.`);
    for (const q of part.questions) {
      requireValue(q.chapterId === section.chapterId && q.sectionId === section.id && typeof q.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(q.id) && hashPattern.test(q.revision), 'ID hoặc vị trí câu hỏi không hợp lệ.');
      requireValue((q.stt === null || Number.isInteger(q.stt) && q.stt > 0) && (q.difficulty === null || manifest.difficulties.includes(q.difficulty)), 'STT hoặc mức độ không hợp lệ.');
      requireValue((q.scope === 'shared' && q.role === 'all') || (q.scope === 'role' && isUserRole(q.role)), `Câu ${q.id}: thiếu hoặc không hợp lệ Chức danh (role) / Phân loại.`);
      questions.push(q);
    }
  }
  const normalized = validateBank({version:1,title:manifest.title,questions});
  return { ...normalized, dataVersion:manifest.dataVersion, manifest };
}

export function filterQuestions(bank, role, filters = {}, search = '') {
  const term = search.trim().toLocaleLowerCase('vi');
  return questionsForRole(bank.questions, role).filter(q =>
    (!filters.chapterId || filters.chapterId === 'all' || q.chapterId === filters.chapterId) &&
    (!filters.sectionId || filters.sectionId === 'all' || q.sectionId === filters.sectionId) &&
    (!filters.difficulty || filters.difficulty === 'all' || (filters.difficulty === 'unclassified' ? q.difficulty == null : q.difficulty === filters.difficulty)) &&
    (!filters.scope || filters.scope === 'all' || q.scope === filters.scope) &&
    (!term || `${q.question} ${q.topic}`.toLocaleLowerCase('vi').includes(term)));
}

export function questionPath(bank, q) {
  const section = bank.manifest?.sections.find(s => s.id === q.sectionId);
  const chapter = bank.manifest?.chapters.find(c => c.id === q.chapterId);
  return section && chapter ? `${chapter.label}${section.partNumber ? ` · Phần ${section.partNumber}` : ''}: ${section.title}` : q.topic;
}
