// Practice covers complete sections or a whole chapter. Exam filters are independent.
export function normalizeQuizConfig(bank, input = {}, mode = 'practice') {
  const { chapters, sections, difficulties } = bank.manifest;
  const practice = mode !== 'exam';
  const chapterId = chapters.some(c => c.id === input.chapterId) ? input.chapterId :
    practice ? chapters[0]?.id || 'all' : 'all';
  const children = sections.filter(s => s.chapterId === chapterId);
  const selected = children.find(s => s.id === input.sectionId);
  const allParts = input.sectionId === 'all' && children.some(s => s.partNumber !== null);
  const sectionId = practice ? allParts ? 'all' : (selected || children[0])?.id || 'all' :
    selected?.partNumber != null ? selected.id : 'all';
  return {
    mode: practice ? 'practice' : 'exam', chapterId, sectionId,
    count: practice ? 'all' : ['20','50','100','all'].includes(input.count) ? input.count : '20',
    difficulty: practice ? 'all' : ['all','unclassified',...difficulties].includes(input.difficulty) ? input.difficulty : 'all',
    scope: practice ? 'all' : ['all','shared','role'].includes(input.scope) ? input.scope : 'all',
    shuffleQuestions: input.shuffleQuestions !== false,
    shuffleAnswers: input.shuffleAnswers !== false
  };
}

export const quizConfigKey = mode => mode === 'exam' ? 'exam-config' : 'practice-config';
