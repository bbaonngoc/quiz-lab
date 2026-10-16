export const LETTERS = ['A', 'B', 'C', 'D'];
export const ROLES = Object.freeze([
  { id: 'bi-thu-dang-uy', label: 'Bí thư Đảng ủy' },
  { id: 'chu-tich-hdnd', label: 'Chủ tịch HĐND' },
  { id: 'chu-tich-ubnd', label: 'Chủ tịch UBND' },
  { id: 'chu-tich-mttq', label: 'Chủ tịch Ủy ban MTTQ' }
]);
const roleKey = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');
const roleAliases = new Map([
  ...['all', 'common', 'chung', 'dungchung', 'tatca', 'tatcavaitro'].map(key => [key, 'all']),
  ...ROLES.flatMap((role, index) => [role.id, role.label, String(index + 1)].map(value => [roleKey(value), role.id]))
]);
export const isUserRole = value => ROLES.some(role => role.id === value);
export const roleLabel = value => value === 'all' ? 'Dùng chung' : ROLES.find(role => role.id === value)?.label || 'Chưa xác định';

export function normalizeRole(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) throw new Error('Thiếu Chức danh (role). Câu dùng chung phải ghi rõ Chung.');
  const role = typeof value === 'string' ? roleAliases.get(roleKey(value)) : null;
  if (!role) throw new Error('Vai trò không hợp lệ. Chọn Dùng chung hoặc một trong bốn vai trò.');
  return role;
}

// Unknown metadata never grants access to the common pool, including old cached banks.
export function questionRole(question) {
  let role;
  try { role=normalizeRole(question?.role); } catch { return null; }
  if (question.scope != null && !['shared','role'].includes(question.scope)) return null;
  if (question.scope === 'shared' && role !== 'all' || question.scope === 'role' && role === 'all') return null;
  return role;
}

export function roleIssues(questions) {
  return questions.filter(q=>questionRole(q)===null).map(q=>({id:q?.id || '',sectionId:q?.sectionId || '',stt:q?.stt ?? null,
    message:q?.role == null || typeof q.role==='string' && !q.role.trim() ? 'Thiếu Chức danh (role).' : 'Chức danh hoặc Phân loại không hợp lệ.'}));
}

export function questionsForRole(questions, role) {
  if (!isUserRole(role)) return [];
  return questions.filter(question => {
    const scope = questionRole(question);
    return scope === 'all' || scope === role;
  });
}
const encoder = new TextEncoder();

export function createQuestionId(question, prefix = 'question') {
  // Stable across repeated imports and row reordering; preserve existing Excel IDs.
  let hash = 0xcbf29ce484222325n;
  const content = [question.topic, question.question, question.options, question.answer];
  if (question.role && question.role !== 'all') content.push(question.role);
  for (const byte of encoder.encode(JSON.stringify(content))) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  }
  return `${prefix}-${hash.toString(16).padStart(16, '0')}`;
}

function optionalText(value, field, label) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error(`${label}: ${field} phải là văn bản hoặc null.`);
  return value.trim();
}

export function validateBank(input, { allowEmpty = false, legacy = false } = {}) {
  const source = Array.isArray(input) ? { version: 1, title: 'Ngân hàng câu hỏi', questions: input } : input;
  if (!source || source.version !== 1 || !Array.isArray(source.questions) || (!allowEmpty && !source.questions.length)) {
    throw new Error('JSON cần version: 1 và mảng questions có ít nhất một câu.');
  }
  if (source.questions.length > 10000) throw new Error('Ngân hàng tối đa 10.000 câu hỏi.');
  const ids = new Set();
  const questions = source.questions.map((q, index) => {
    const label = `Câu ${index + 1}`;
    if (!q || typeof q !== 'object' || Array.isArray(q)) throw new Error(`${label}: dữ liệu câu hỏi không hợp lệ.`);
    if (typeof q.question !== 'string' || !q.question.trim()) throw new Error(`${label}: thiếu Câu hỏi (question).`);
    if (!q.options || LETTERS.some(key => typeof q.options[key] !== 'string' || !q.options[key].trim())) {
      throw new Error(`${label}: cần đủ đáp án A, B, C, D.`);
    }
    if (!LETTERS.includes(q.answer)) throw new Error(`${label}: Đáp án đúng (answer) phải là A, B, C hoặc D.`);
    const question = { topic: optionalText(q.topic, 'topic', label) || 'Tổng hợp', question: q.question.trim(),
      options: Object.fromEntries(LETTERS.map(key => [key, q.options[key].trim()])),
      answer: q.answer, explanation: optionalText(q.explanation, 'explanation', label),
      // Preserve unknown legacy snapshots for history, without assigning a common role.
      role: legacy && (q.role == null || typeof q.role==='string' && !q.role.trim()) ? null : normalizeRole(q.role) };
    // Preserve official metadata and legacy snapshots without changing their identities.
    for (const field of ['chapterId', 'sectionId', 'scope', 'revision']) {
      if (q[field] != null) question[field] = optionalText(q[field], field, label);
    }
    if (Object.hasOwn(q, 'difficulty')) question.difficulty = q.difficulty == null ? null : optionalText(q.difficulty, 'difficulty', label);
    if (Object.hasOwn(q, 'stt')) {
      if (q.stt != null && (!Number.isInteger(q.stt) || q.stt < 1)) throw new Error(`${label}: STT không hợp lệ.`);
      question.stt = q.stt;
    }
    const id = q.id == null || (typeof q.id === 'string' && !q.id.trim()) ? createQuestionId(question) : q.id;
    if (typeof id !== 'string' || Object.hasOwn(Object.prototype, id) || id === 'prototype' || ids.has(id)) throw new Error(`${label}: id phải là chuỗi duy nhất, không dùng tên thuộc tính hệ thống.`);
    ids.add(id);
    return { id, ...question };
  });
  return { version: 1, title: questions.length ? (typeof source.title === 'string' ? source.title : 'Ngân hàng câu hỏi') : '', questions };
}

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createSession(questions, config, random = Math.random) {
  if (!['practice', 'exam'].includes(config.mode)) throw new Error('Chế độ không hợp lệ.');
  if (!isUserRole(config.role)) throw new Error('Hãy chọn vai trò trước khi làm bài.');
  questions = questionsForRole(questions, config.role);
  if (!questions.length) throw new Error('Chưa có câu hỏi phù hợp.');
  const ordered = config.shuffleQuestions ? shuffle(questions, random) : [...questions];
  const count = config.count === 'all' ? ordered.length : Math.min(Number(config.count), ordered.length);
  if (!Number.isInteger(count) || count < 1) throw new Error('Số câu không hợp lệ.');
  return {
    id: crypto.randomUUID(), status: 'active', mode: config.mode, source: config.source || 'bank',
    ...(config.role ? { role: config.role } : {}),
    ...(config.bankVersion ? { bankVersion: config.bankVersion } : {}),
    ...(config.filters ? { filters: structuredClone(config.filters) } : {}),
    createdAt: Date.now(), updatedAt: Date.now(), completedAt: null, currentIndex: 0,
    questions: ordered.slice(0, count).map(q => ({ ...structuredClone(q),
      optionOrder: config.shuffleAnswers ? shuffle(LETTERS, random) : [...LETTERS] })),
    answers: {}, flags: []
  };
}

export function questionStatus(session, question) {
  const selected = session.answers[question.id];
  if (!selected) return 'blank';
  return selected === question.answer ? 'correct' : 'wrong';
}

export function getResult(session) {
  const counts = { correct: 0, wrong: 0, blank: 0, total: session.questions.length };
  session.questions.forEach(q => counts[questionStatus(session, q)]++);
  return { ...counts, answered: counts.correct + counts.wrong,
    score: counts.total ? Math.round(counts.correct / counts.total * 100) / 10 : 0 };
}

// A later correct answer removes an older mistake; unanswered attempts do not.
export function getMistakes(sessions) {
  const latest = new Map();
  sessions.filter(s => s.status === 'completed').sort((a, b) => b.completedAt - a.completedAt).forEach(session => {
    session.questions.forEach(q => {
      const key = JSON.stringify([questionRole(q), q.id, q.revision || 'legacy']);
      if (!latest.has(key) && session.answers[q.id]) latest.set(key, { question: q, status: questionStatus(session, q) });
    });
  });
  return [...latest.values()].filter(q => q.status === 'wrong').map(q => {
    const { optionOrder, ...question } = q.question;
    return question;
  });
}

// New practice uses the current official text; retired/foreign IDs remain only in history.
export function currentMistakes(sessions, bank, role) {
  const current = new Map(questionsForRole(bank.questions, role).map(q => [q.id, q]));
  const latestCurrent = new Map();
  for (const session of sessions.filter(s=>s.status==='completed').sort((a,b)=>b.completedAt-a.completedAt)) {
    for (const old of session.questions) {
      const q=current.get(old.id);
      if (q && questionRole(old)===q.role && old.revision===q.revision && session.answers[q.id] && !latestCurrent.has(q.id)) {
        latestCurrent.set(q.id,session.answers[q.id]===old.answer);
      }
    }
  }
  const done = new Set();
  return getMistakes(sessions).flatMap(old => {
    const q = current.get(old.id);
    if (!q || q.role !== questionRole(old) || done.has(q.id)) return [];
    // A correct attempt on this exact revision clears errors on older revisions.
    if (latestCurrent.get(q.id)===true) return [];
    done.add(q.id); return [q];
  });
}

export function canResumeSession(session, role) {
  return isUserRole(role) && (!session.role || session.role===role) &&
    session.questions.length>0 && questionsForRole(session.questions,role).length===session.questions.length;
}

export function validateSession(input) {
  if (!input || typeof input.id !== 'string' || !input.id || !['active', 'completed'].includes(input.status)
    || !['practice', 'exam'].includes(input.mode)) throw new Error('Bài làm trong bản sao lưu không hợp lệ.');
  if (input.role != null && !isUserRole(input.role)) throw new Error('Vai trò của bài làm trong bản sao lưu không hợp lệ.');
  // Imported questions get IDs before a session starts. Backups must retain them.
  if (!Array.isArray(input.questions) || input.questions.some(q => typeof q?.id !== 'string' || !q.id.trim())) throw new Error('Bản sao lưu thiếu ID câu hỏi đã lưu.');
  const bank = validateBank({ version: 1, questions: input.questions }, {legacy:true});
  if (!Number.isFinite(input.createdAt) || !Number.isFinite(input.updatedAt) || input.createdAt < 0
    || input.updatedAt < input.createdAt || (input.status === 'completed' && (!Number.isFinite(input.completedAt) || input.completedAt < input.createdAt))) {
    throw new Error('Thời gian bài làm không hợp lệ.');
  }
  const answers = {};
  const questions = bank.questions.map((q, i) => {
    const order = input.questions[i].optionOrder;
    if (!Array.isArray(order) || order.length !== 4 || new Set(order).size !== 4 || order.some(key => !LETTERS.includes(key))) {
      throw new Error('Thứ tự đáp án trong bản sao lưu không hợp lệ.');
    }
    if (Object.hasOwn(input.answers || {}, q.id)) {
      if (!LETTERS.includes(input.answers[q.id])) throw new Error('Đáp án đã chọn không hợp lệ.');
      Object.defineProperty(answers, q.id, { value: input.answers[q.id], enumerable: true, writable: true, configurable: true });
    }
    return { ...q, optionOrder: [...order] };
  });
  if (!Number.isInteger(input.currentIndex) || input.currentIndex < 0 || input.currentIndex >= questions.length) throw new Error('Vị trí câu hỏi không hợp lệ.');
  return { id: input.id, status: input.status, mode: input.mode, source: input.source === 'mistakes' ? 'mistakes' : 'bank',
    ...(input.role ? { role: input.role } : {}),
    ...(typeof input.bankVersion === 'string' ? { bankVersion: input.bankVersion } : {}),
    ...(input.filters && typeof input.filters === 'object' && !Array.isArray(input.filters) ? { filters: Object.fromEntries(
      ['chapterId','sectionId','difficulty','scope'].filter(key=>typeof input.filters[key]==='string').map(key=>[key,input.filters[key]])) } : {}),
    createdAt: input.createdAt, updatedAt: input.updatedAt, completedAt: input.status === 'completed' ? input.completedAt : null,
    currentIndex: input.currentIndex, questions, answers,
    flags: Array.isArray(input.flags) ? [...new Set(input.flags.filter(id => questions.some(q => q.id === id)))] : [] };
}
