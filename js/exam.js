import { createSession, shuffle, questionRole, isUserRole, roleLabel, EXAM_DURATION_MS, EXAM_QUESTION_COUNT } from './model.js';

export function selectExamQuestions(bank, role, random = Math.random) {
  if (!isUserRole(role)) throw new Error('Hãy chọn vai trò trước khi thi.');
  const sections = bank.manifest?.sections;
  if (!Array.isArray(sections) || sections.length !== 8 || sections.some(s => typeof s?.id !== 'string' || !s.id.trim()) || new Set(sections.map(s => s.id)).size !== 8) {
    throw new Error('Ngân hàng phải có đủ 8 chủ đề riêng biệt để tạo đề thi.');
  }
  const eligible = bank.questions.filter(q => ['all',role].includes(questionRole(q)));
  if (eligible.some(q => typeof q.id !== 'string' || !q.id) || new Set(eligible.map(q => q.id)).size !== eligible.length) {
    throw new Error('Ngân hàng có ID câu hỏi thiếu hoặc trùng. Không thể tạo đề thi.');
  }
  const selected = [];
  // Shuffling topics randomizes all quotas: four get 4/4, two get 4/3,
  // and two get 3/4 (common/private), totaling exactly 30 of each group.
  for (const [index, section] of shuffle(sections,random).entries()) {
    const count = index < 4 ? 8 : 7;
    const commonCount = index < 6 ? 4 : 3, roleCount = count-commonCount;
    const pool = eligible.filter(q => q.sectionId === section.id);
    const common = pool.filter(q => questionRole(q) === 'all');
    const privateQuestions = pool.filter(q => questionRole(q) === role);
    const label = section.title ? `${section.title} (${section.id})` : section.id;
    if (common.length < commonCount) throw new Error(`${label}: không đủ câu hỏi dùng chung (cần ${commonCount}, hiện có ${common.length}). Không thể tạo đề thi.`);
    if (privateQuestions.length < roleCount) throw new Error(`${label}: không đủ câu hỏi riêng cho ${roleLabel(role)} (cần ${roleCount}, hiện có ${privateQuestions.length}). Không thể tạo đề thi.`);
    selected.push(...shuffle(privateQuestions,random).slice(0,roleCount),...shuffle(common,random).slice(0,commonCount));
  }
  if (selected.length !== EXAM_QUESTION_COUNT) throw new Error('Chưa tạo đủ 60 câu hỏi.');
  return shuffle(selected,random);
}

export function createExamSession(bank, role, { shuffleAnswers = true, random = Math.random, now = Date.now() } = {}) {
  const session = createSession(selectExamQuestions(bank,role,random),{
    mode:'exam', count:'all', role, bankVersion:bank.dataVersion, shuffleQuestions:false, shuffleAnswers,
    filters:{chapterId:'all',sectionId:'all',difficulty:'all',scope:'all'}
  },random);
  return { ...session, examVersion:1, createdAt:now, updatedAt:now, startTime:now, endTime:now+EXAM_DURATION_MS };
}
