import { createSession, getResult, currentMistakes, questionStatus, validateSession, ROLES, isUserRole, roleLabel, questionRole, roleIssues, questionsForRole, canResumeSession, isTimedExam, isExamExpired, ongoingExam, finishSession, nextExamAttemptNumber, examRemainingSeconds, formatDuration } from './model.js';
import { openDatabase, getSessions, getSession, addSession, addExamSession, updateSession, getSetting, setSetting, restoreBackup } from './db.js';
import { createExamSession } from './exam.js';
import { icon } from './icons.js';
import { cachedBank, checkBankUpdate } from './bank.js';
import { filterQuestions, questionPath } from './bank-schema.js';
import { normalizeQuizConfig, quizConfigKey } from './quiz-config.js';
import { loadMemoryTips, memorySelection, renderMemoryPage } from './memory.js';

const VERSION = '2.3.1';
const root = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);
const date = timestamp => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp);
const modeName = mode => mode === 'practice' ? 'Ôn tập' : 'Thi thử';
const state = {
  bank: { version: 1, title: 'Ngân hàng câu hỏi', questions: [], manifest: { chapters: [], sections: [], difficulties: [] } }, sessions: [], viewSession: null, route: 'home', initialized: false, role: null,
  config: { mode: 'practice', count: 'all', chapterId: 'all', sectionId: 'all', difficulty: 'all', scope: 'all', shuffleQuestions: true, shuffleAnswers: true },
  examConfig: { mode: 'exam', count: '20', chapterId: 'all', sectionId: 'all', difficulty: 'all', scope: 'all', shuffleQuestions: true, shuffleAnswers: true },
  reviewFilter: 'all', reviewIndex: 0, reviewOpen: false, examCounter: 0, historyFilter: 'all', search: '', bankChapter: null, bankSection: null,
  bankFilters: { difficulty: 'all', scope: 'all' }, legacyBank: null, checkingBank: false, loadingRoute: false, navigationError: '',
  memoryData: null, memoryChapter: null, memorySection: null, memoryExpanded: new Set(),
  waitingWorker: null, swRegistration: null, updating: false, installPrompt: null, appInstalled: false
};
let busy = false;
let toastTimer;
let routeRevision = 0;
let preferencesWrite = Promise.resolve();
let pendingReload = false;
let reloading = false;
let syncPending = false;
let lastBankWarning = '';
let deadlineCheck = null;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('quizlab-data') : null;

function saveQuizConfig(mode = 'practice') {
  const config = structuredClone(mode === 'exam' ? state.examConfig : state.config);
  preferencesWrite = preferencesWrite.catch(() => { }).then(() => setSetting(quizConfigKey(mode), config));
  return preferencesWrite;
}

function toast(message, error = false) {
  const box = document.querySelector('#toast');
  box.textContent = message;
  box.className = `toast visible${error ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('visible'), error ? 6500 : 3500);
}

async function run(operation) {
  if (busy) return;
  busy = true;
  root.setAttribute('aria-busy', 'true');
  try { await operation(); }
  catch (error) { console.error(error); toast(error.message || 'Không thể hoàn tất. Vui lòng thử lại.', true); }
  finally {
    busy=false;root.setAttribute('aria-busy','false');
    if (state.initialized) {
      if (syncPending) {syncPending=false;syncFromOtherTab().catch(error=>toast(error.message,true));}
      applyAppUpdate();
    }
  }
}

function confirmDialog(title, body, label = 'Xác nhận', danger = false) {
  dialog.innerHTML = `<form method="dialog"><button class="dialog-close" value="cancel" aria-label="Đóng">${icon('close')}</button><h2 id="dialog-title">${esc(title)}</h2><p>${body}</p><div class="dialog-actions"><button class="btn secondary" value="cancel">Hủy</button><button class="btn ${danger ? 'danger' : 'primary'}" value="confirm">${esc(label)}</button></div></form>`;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}

function roleOptions(selected) {
  return ROLES.map(role => `<option value="${role.id}" ${selected === role.id ? 'selected' : ''}>${role.label}</option>`).join('');
}

function chooseInitialRole() {
  dialog.innerHTML = `<form id="role-onboarding"><h2 id="dialog-title">Bạn là…</h2><p>Chọn vai trò để sử dụng bộ câu hỏi phù hợp.</p><label class="field-label role-field" for="first-role">Vai trò</label><select class="select" id="first-role" required><option value="" disabled selected>Chọn vai trò</option>${roleOptions(null)}</select><p class="role-error" role="alert"></p><div class="dialog-actions"><button class="btn primary" type="submit" disabled>Tiếp tục</button></div></form>`;
  const form = dialog.querySelector('form');
  const select = form.querySelector('select');
  const submit = form.querySelector('button');
  const preventCancel = event => event.preventDefault();
  dialog.addEventListener('cancel', preventCancel);
  select.addEventListener('change', () => { submit.disabled = !isUserRole(select.value); });
  dialog.showModal();
  return new Promise(resolve => form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!isUserRole(select.value) || submit.disabled) return;
    submit.disabled = true;
    try {
      await setSetting('user-role', select.value);
      state.role = select.value;
      dialog.removeEventListener('cancel', preventCancel);
      dialog.close(); resolve();
    } catch (error) {
      form.querySelector('.role-error').textContent = `Không lưu được vai trò: ${error.message}`;
      submit.disabled = false;
    }
  }));
}

async function changeUserRole(role) {
  if (!isUserRole(role)) throw new Error('Vui lòng chọn một trong bốn vai trò.');
  await setSetting('user-role', role);
  state.role = role; state.search = '';
  announceChange(); render(); toast(`Đã chọn vai trò: ${roleLabel(role)}.`);
}

const roleQuestions = () => questionsForRole(state.bank.questions, state.role);
const roleMistakes = () => currentMistakes(state.sessions, state.bank, state.role);

function statistics() {
  const completed = state.sessions.filter(s => s.status === 'completed');
  const scored = completed.filter(s => s.mode === 'practice');
  const totalQuestions = completed.reduce((sum, s) => sum + s.questions.length, 0);
  const correct = completed.reduce((sum, s) => sum + getResult(s).correct, 0);
  return {
    completed, totalQuestions, correct,
    average: scored.length ? scored.reduce((sum, s) => sum + getResult(s).score, 0) / scored.length : null,
    accuracy: totalQuestions ? Math.round(correct / totalQuestions * 100) : 0,
    mistakes: roleMistakes()
  };
}

const navItems = [['home', 'grid', 'Tổng quan'], ['exam', 'file', 'Thi thử'], ['history', 'history', 'Lịch sử'], ['mistakes', 'flag', 'Câu cần ôn'], ['bank', 'book', 'Ngân hàng'], ['memory', 'bulb', 'Mẹo ghi nhớ'], ['settings', 'settings', 'Cài đặt']];
const routeTitle = () => ({ home: 'Tổng quan', exam: 'Thi thử', history: 'Lịch sử làm bài', mistakes: 'Câu cần ôn', bank: 'Ngân hàng câu hỏi', memory: 'Mẹo ghi nhớ', settings: 'Cài đặt', quiz: 'Làm bài', review: 'Kết quả & xem lại' }[state.route] || 'Tổng quan');
const brand = `<div class="brand"><div class="brand-mark" aria-hidden="true">Q</div><span>QuizLab</span></div>`;
const isAppInstalled = () => state.appInstalled || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function statusChip() {
  const disconnected = !navigator.onLine;
  return `<span class="status-chip${disconnected ? ' disconnected' : ''}"><span class="dot"></span>${disconnected ? 'Mất kết nối' : 'Có kết nối'}</span>`;
}

function shell(content) {
  const issues=roleIssues(state.bank.questions);
  const mistakes = roleMistakes().length;
  const activeNav = ['quiz', 'review'].includes(state.route) ? state.viewSession?.mode === 'exam' ? 'exam' : 'home' : state.route;
  const nav = navItems.map(([key, glyph, label]) => `<a href="#${key}" class="${activeNav === key ? 'active' : ''}" ${activeNav === key ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span>${key === 'mistakes' && mistakes ? `<span class="nav-count">${mistakes}</span>` : ''}</a>`).join('');
  return `<aside class="sidebar">${brand}<nav class="side-nav" aria-label="Điều hướng chính">${nav}</nav><div class="sidebar-bottom"><button class="sidebar-install" data-action="install">${icon('download')} ${isAppInstalled() ? 'Hướng dẫn cài đặt' : 'Cài ứng dụng'}</button><span class="version-pill">v${VERSION}</span></div></aside>
  <div class="workspace"><header class="topbar">${brand}<div class="breadcrumb">${routeTitle()}</div><div class="topbar-right"><a class="current-role" href="#settings" title="Đổi vai trò: ${esc(roleLabel(state.role))}">${esc(roleLabel(state.role))}</a>${statusChip()}</div></header>
  ${state.waitingWorker ? `<div class="banner update"><div><strong>QuizLab có phiên bản mới</strong><p>${state.route === 'quiz' ? 'Sẽ cập nhật sau khi bạn lưu và thoát bài.' : 'Tiến độ và lịch sử trên thiết bị sẽ được giữ lại.'}</p></div><button class="btn primary" data-action="update" ${state.updating || state.route === 'quiz' ? 'disabled' : ''}>${state.updating ? 'Đang cập nhật…' : 'Cập nhật ngay'}</button></div>` : ''}
  ${issues.length ? `<div class="banner" role="alert"><div><strong>Có ${issues.length} câu thiếu hoặc sai chức danh, phân loại</strong><p>Các câu này đã được loại khỏi ngân hàng hiển thị và bài mới. Hãy kiểm tra cập nhật dữ liệu.</p></div><a class="btn secondary" href="#settings">Cài đặt</a></div>` : ''}
  <main class="content" id="main" tabindex="-1">${content}</main></div>
  <nav class="bottom-nav" style="--nav-count: ${navItems.length}" aria-label="Điều hướng di động">${navItems.map(([key, glyph, label]) => `<a href="#${key}" class="${activeNav === key ? 'active' : ''}" ${activeNav === key ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></a>`).join('')}</nav>`;
}

function statCard(label, value, unit = '') {
  return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ''}</div></div>`;
}

function emptyState(glyph, title, subtitle) {
  return `<div class="empty"><h3>${title}</h3><p>${subtitle}</p></div>`;
}

function options(items, selected, allLabel) {
  return [['all', allLabel], ...items].map(([value, label]) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function cleanConfig(config = {}, mode = 'practice') {
  return normalizeQuizConfig(state.bank, config, mode);
}

function configFilters(mode = 'practice') {
  const practice = mode !== 'exam', config = practice ? state.config : state.examConfig;
  const prefix = practice ? '' : 'exam-';
  const children = state.bank.manifest.sections.filter(s => s.chapterId === config.chapterId);
  const chapters = state.bank.manifest.chapters.map(c => {
    const items = state.bank.manifest.sections.filter(s => s.chapterId === c.id);
    return [c.id, `${c.label}${items.length === 1 ? `: ${items[0].title}` : ''}`];
  });
  const choice = (items, selected) => items.map(([value,label]) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const parts = children.filter(s => s.partNumber !== null).map(s => [s.id,`Phần ${s.partNumber}: ${s.title}`]);
  const chapterOptions = practice ? choice(chapters,config.chapterId) : options(chapters,config.chapterId,'Tất cả chương');
  const partOptions = practice ? parts.length ? options(parts,config.sectionId,'Tất cả các phần') : choice([[config.sectionId,'Không chia phần']],config.sectionId) : options(parts,config.sectionId,config.chapterId === 'all' ? 'Chọn chương để lọc phần' : parts.length ? 'Tất cả các phần' : 'Không chia phần');
  return `<div><label class="field-label" for="${prefix}chapterId">Chương</label><select id="${prefix}chapterId" name="chapterId" class="select" ${chapters.length ? '' : 'disabled'}>${chapterOptions}</select></div>
    <div><label class="field-label" for="${prefix}sectionId">Phần</label><select id="${prefix}sectionId" name="sectionId" class="select" ${parts.length ? '' : 'disabled'}>${partOptions}</select></div>
    ${practice ? '' : `<div><label class="field-label" for="exam-difficulty">Mức độ</label><select id="exam-difficulty" name="difficulty" class="select">${difficultyOptions(config.difficulty)}</select></div><div><label class="field-label" for="exam-scope">Phân loại</label><select id="exam-scope" name="scope" class="select">${scopeOptions(config.scope)}</select></div>`}`;
}

const difficultyOptions = selected => options([...state.bank.manifest.difficulties.map(v => [v, v]), ['unclassified', 'Chưa phân loại']], selected, 'Tất cả mức độ');
const scopeOptions = selected => options([['shared', 'Dùng chung'], ['role', 'Theo chức danh']], selected, 'Chung và riêng');
const currentFilters = config => Object.fromEntries(['chapterId', 'sectionId', 'difficulty', 'scope'].map(key => [key, config[key]]));
function availableQuestions(config = state.config) { return filterQuestions(state.bank, state.role, config); }
function countNote(config = state.config) {
  const available = availableQuestions(config).length;
  if (config.mode === 'practice') return `${available} câu · Ôn toàn bộ câu hỏi phù hợp vai trò trong mục đã chọn.`;
  const count = config.count === 'all' ? available : Math.min(Number(config.count), available);
  return `${available} câu khả dụng · Bài thi: ${count} câu${config.count !== 'all' && Number(config.count) > available ? ' (toàn bộ hiện có)' : ''}.`;
}

function shuffleFields(config) {
  return `<div class="toggles"><label class="toggle"><input type="checkbox" name="shuffleQuestions" ${config.shuffleQuestions ? 'checked' : ''}>Trộn câu hỏi</label><label class="toggle"><input type="checkbox" name="shuffleAnswers" ${config.shuffleAnswers ? 'checked' : ''}>Đảo thứ tự đáp án</label></div>`;
}

function resumeRow(mode) {
  const active = state.sessions.filter(s => s.status === 'active' && s.mode === mode && canResumeSession(s,state.role)).sort((a,b) => b.updatedAt-a.updatedAt)[0];
  return active ? `<div class="resume-row"><div><strong>Bài đang làm</strong><span>${modeName(active.mode)} · ${getResult(active).answered}/${active.questions.length} câu đã trả lời</span></div><a class="btn secondary" href="#quiz/${encodeURIComponent(active.id)}">Tiếp tục ${icon('arrow')}</a></div>` : '';
}

function home() {
  const stats = statistics();
  const config = state.config;
  return `<div class="page-heading"><h1>Tổng quan</h1><a class="btn link" href="#history">Lịch sử làm bài</a></div>
  <section class="stats" aria-label="Thống kê học tập">${statCard('Câu hỏi', roleQuestions().length)}${statCard('Bài hoàn thành', stats.completed.length)}${statCard('Điểm ôn tập', stats.average === null ? '—' : number(stats.average), '/ 10')}${statCard('Câu cần ôn', stats.mistakes.length)}</section>
  ${resumeRow('practice')}
  <section class="card setup-card"><div class="card-heading"><h2>Ôn tập theo phần</h2><span class="version-pill">${state.bank.dataVersion ? `Dữ liệu ${esc(state.bank.dataVersion)}` : 'Chờ tải ngân hàng'}</span></div>
  <form id="quiz-config" data-mode="practice"><div id="config-filters" class="quiz-filters">${configFilters()}</div><p id="count-note" class="form-note" data-count-note>${countNote()}</p>${shuffleFields(config)}<div class="start-actions"><button type="submit" class="btn primary" ${availableQuestions().length ? '' : 'disabled'}>Bắt đầu ôn tập ${icon('arrow')}</button><button type="button" class="btn secondary" data-action="retry-mistakes" ${stats.mistakes.length ? '' : 'disabled'}>Ôn câu sai</button><span class="save-note">Tự động lưu tiến độ</span></div></form></section>`;
}

function sessionTitle(session) {
  return session.mode === 'exam' ? session.attemptNumber ? `Bài thi thử lần ${session.attemptNumber}` : 'Thi thử (bản cũ)' : 'Ôn tập';
}

function countdown(session, id = '') {
  return `<span class="exam-clock"><span>Thời gian còn lại</span><time ${id ? `id="${id}"` : ''} role="timer" aria-live="off" data-exam-end="${session.endTime}">${formatDuration(examRemainingSeconds(session))}</time></span>`;
}

function examPage() {
  const next = nextExamAttemptNumber(state.sessions,state.examCounter);
  const ongoing = ongoingExam(state.sessions);
  const active = ongoing ? canResumeSession(ongoing,state.role) ? ongoing : null : state.sessions.filter(s => s.mode === 'exam' && s.status === 'active' && canResumeSession(s,state.role)).sort((a,b) => b.createdAt-a.createdAt)[0];
  return `<div class="page-heading"><h1>Thi thử</h1></div><section class="card setup-card exam-intro"><div class="card-heading"><h2>${ongoing ? sessionTitle(ongoing) : `Bài thi thử lần ${next}`}</h2><span class="version-pill">${esc(roleLabel(state.role))}</span></div>
  <dl class="exam-facts"><div><dt>Thời gian</dt><dd>60 phút</dd></div><div><dt>Số câu</dt><dd>60</dd></div></dl>
  <p class="exam-notice">Tiến trình được tự động lưu khi thoát. Thời gian thi vẫn tiếp tục đếm và bài thi tự kết thúc khi hết 60 phút.</p>
  ${ongoing ? `<p id="exam-blocked-note" role="status">Bạn đang có bài thi chưa kết thúc. Hãy nộp bài hoặc chờ hết giờ trước khi bắt đầu bài mới.${active ? '' : ` Bài đang làm thuộc vai trò ${esc(roleLabel(ongoing.role))}. Đổi lại vai trò này để tiếp tục.`}</p>` : ''}
  ${active ? `<div class="exam-resume"><p><strong>${sessionTitle(active)}</strong> · Đã trả lời ${getResult(active).answered}/${active.questions.length} câu</p>${isTimedExam(active) ? countdown(active) : '<p>Bài cũ được giữ nguyên đề và tiến trình.</p>'}</div>` : ''}
  <form id="exam-config" data-mode="exam"><div class="start-actions"><button type="submit" class="btn ${ongoing ? 'secondary' : 'primary'}" ${state.bank.questions.length && !ongoing ? '' : 'disabled'} ${ongoing ? 'aria-describedby="exam-blocked-note"' : ''}>Bắt đầu thi ${icon('arrow')}</button>${active ? `<a class="btn ${ongoing ? 'primary' : 'secondary'}" data-resume-exam href="#quiz/${encodeURIComponent(active.id)}">Tiếp tục bài thi</a>` : ongoing ? '<a class="btn primary" href="#settings">Đổi vai trò để tiếp tục</a>' : ''}<a class="btn secondary" href="#history/exam">Lịch sử thi thử</a></div></form></section>`;
}

function historyTable(sessions) {
  const examOnly = state.historyFilter === 'exam';
  return `<div class="table-wrap"><table class="history-table"><thead><tr><th>Bài làm</th><th>Thời gian</th><th>Kết quả</th>${examOnly ? '' : '<th>Điểm ôn tập</th>'}<th></th></tr></thead><tbody>${sessions.map(session => {
    const result = getResult(session), timed = isTimedExam(session);
    const elapsed = session.status === 'completed' ? formatDuration(Math.max(0,Math.round((session.completedAt-(session.startTime || session.createdAt))/1000))) : null;
    return `<tr><td><span class="row-title">${sessionTitle(session)} · ${session.questions.length} câu</span><small>${session.role ? esc(roleLabel(session.role)) : 'Bài cũ'}</small></td><td>${date(session.startTime || session.createdAt)}${elapsed ? `<small>Làm bài: ${elapsed}</small><small>Kết thúc: ${date(session.completedAt)}</small>` : timed ? `<small>Hạn: ${date(session.endTime)}</small>` : ''}</td><td>${session.status === 'active' ? `<span class="badge amber">Đang làm · ${result.answered}/${result.total}</span>` : `${result.correct} đúng · ${result.wrong} sai · ${result.blank} trống${session.completionReason === 'timeout' ? '<small>Hết giờ</small>' : ''}`}</td>${examOnly ? '' : `<td>${session.status === 'completed' && session.mode === 'practice' ? `<span class="score">${number(result.score)}</span><span class="version-pill"> / 10</span>` : '—'}</td>`}<td><a class="btn link" href="#${session.status === 'active' ? 'quiz' : 'review'}/${encodeURIComponent(session.id)}">${session.status === 'active' ? 'Tiếp tục' : 'Xem kết quả'} ${icon('chevron')}</a></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function history() {
  const sessions = state.sessions.filter(s => state.historyFilter === 'all' || s.status === state.historyFilter || s.mode === state.historyFilter).sort((a,b) => b.createdAt-a.createdAt);
  return `<div class="page-heading"><h1>${state.historyFilter === 'exam' ? 'Lịch sử thi thử' : 'Lịch sử làm bài'}</h1><button class="btn secondary" data-action="export-backup">${icon('download')} Sao lưu</button></div><div class="filter-tabs" role="group" aria-label="Lọc bài làm">${[['all','Tất cả'],['practice','Ôn tập'],['exam','Thi thử'],['active','Đang làm']].map(([value,label]) => `<button data-action="history-filter" data-value="${value}" class="${state.historyFilter === value ? 'active' : ''}" aria-pressed="${state.historyFilter === value}">${label}</button>`).join('')}</div><section class="card">${sessions.length ? historyTable(sessions) : emptyState('history','Chưa có bài làm phù hợp','Bài đang làm và bài đã nộp được lưu tại đây.')}</section>`;
}

function mistakesPage() {
  const questions = roleMistakes();
  return `<div class="page-heading"><div><h1>Câu cần ôn <span class="badge">${questions.length} câu</span></h1><p>Dựa trên lần trả lời gần nhất.</p></div>${questions.length ? `<button class="btn primary" data-action="retry-mistakes">Ôn lại</button>` : ''}</div>${questions.length ? `<div class="question-list">${questions.map((q, i) => questionListItem(q, i)).join('')}</div>` : `<section class="card">${emptyState('check', 'Chưa có câu sai cần ôn', 'Câu trả lời sai trong bài đã nộp sẽ xuất hiện ở đây.')}<a class="btn secondary" href="#home">Về tổng quan</a></section>`}`;
}

function questionListItem(q, index) {
  return `<article class="question-list-item"><span class="question-number">${q.stt || index + 1}</span><div><div class="question-tags"><span class="question-path">${esc(questionPath(state.bank, q))}</span><span class="badge gray">${esc(q.difficulty || 'Chưa phân loại')}</span><span class="badge role-badge">${esc(roleLabel(questionRole(q)))}</span></div><h3>${esc(q.question)}</h3><details><summary>Xem phương án và đáp án</summary><ol class="bank-options" type="A">${['A', 'B', 'C', 'D'].map(key => `<li${key === q.answer ? ' class="text-correct"' : ''}>${esc(q.options[key])}${key === q.answer ? ' <strong>✓ Đáp án đúng</strong>' : ''}</li>`).join('')}</ol></details></div></article>`;
}

function filteredBank() {
  return filterQuestions(state.bank, state.role, { ...state.bankFilters, chapterId: state.bankChapter, sectionId: state.bankSection }, state.search);
}

function bankSummary() {
  const count = roleQuestions().length;
  return `${count} câu phù hợp vai trò${state.bank.dataVersion ? ` · Dữ liệu ${state.bank.dataVersion}` : ''}`;
}

function bankPage() {
  const chapter = state.bank.manifest.chapters.find(c => c.id === state.bankChapter);
  const section = state.bank.manifest.sections.find(s => s.id === state.bankSection);
  const title = section ? `${section.partNumber ? `Phần ${section.partNumber}: ` : `${chapter.label}: `}${section.title}` : chapter?.label || 'Ngân hàng câu hỏi';
  const crumbs = `<a href="#bank">Ngân hàng câu hỏi</a>${chapter ? ` <span>/</span> ${section?.partNumber ? `<a href="#bank/${chapter.id}">${esc(chapter.label)}</a> <span>/</span> <span>Phần ${section.partNumber}</span>` : `<span>${esc(chapter.label)}</span>`}` : ''}`;
  return `<nav class="bank-breadcrumb" aria-label="Đường dẫn ngân hàng">${crumbs}</nav><div class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(bankSummary())}</p></div>${chapter ? `<a class="btn secondary" href="#bank${section?.partNumber ? `/${chapter.id}` : ''}">${icon('arrow', 'back-icon')} Quay lại</a>` : ''}</div><div class="list-tools"><label class="search-field">${icon('search')}<input id="bank-search" type="search" value="${esc(state.search)}" placeholder="Tìm câu hỏi trong thư mục…" aria-label="Tìm câu hỏi"></label><select class="select" id="bank-difficulty" aria-label="Lọc mức độ">${difficultyOptions(state.bankFilters.difficulty)}</select><select class="select" id="bank-scope" aria-label="Lọc phân loại">${scopeOptions(state.bankFilters.scope)}</select></div><p class="form-note bank-count" id="bank-count" aria-live="polite">${filteredBank().length} câu trong phạm vi đang xem</p><div id="bank-list">${bankListContent()}</div>`;
}

function bankListContent() {
  if (!state.bank.questions.length) return emptyState('book', 'Chưa tải được ngân hàng chính thức', 'Kết nối mạng và kiểm tra cập nhật. Bài đã lưu vẫn mở được trong Lịch sử.');
  const questions = filteredBank();
  if (!state.search.trim() && !state.bankSection) {
    const rows = state.bankChapter ? state.bank.manifest.sections.filter(s => s.chapterId === state.bankChapter).map(s => ({ id: s.id, label: `Phần ${s.partNumber}: ${s.title}`, href: `#bank/${s.chapterId}/${s.id}`, count: questions.filter(q => q.sectionId === s.id).length })) : state.bank.manifest.chapters.map(c => {
      const children = state.bank.manifest.sections.filter(s => s.chapterId === c.id);
      return { id: c.id, label: `${c.label}${children.length === 1 ? `: ${children[0].title}` : ''}`, href: `#bank/${c.id}`, count: questions.filter(q => q.chapterId === c.id).length };
    });
    return `<div class="folder-list">${rows.map(row => `<a class="folder-row" href="${row.href}" data-folder-id="${row.id}">${icon('folder')}<span class="folder-title">${esc(row.label)}</span><span class="folder-count">${row.count} câu</span>${icon('chevron')}</a>`).join('')}</div>`;
  }
  return questions.length ? `<div class="question-list">${questions.map((q, i) => questionListItem(q, i)).join('')}</div>` : emptyState('search', 'Không tìm thấy câu hỏi', 'Thử từ khóa khác hoặc thay bộ lọc.');
}

function quizPage() {
  const session = state.viewSession;
  if (!session) return missingSession();
  if (!canResumeSession(session,state.role)) return `<section class="card" data-role-mismatch><h1>Bài làm không phù hợp vai trò đang chọn</h1><p>${session.role ? `Bài này được tạo cho ${esc(roleLabel(session.role))}. Hãy chọn đúng vai trò để tiếp tục.` : 'Bài cũ thiếu thông tin chức danh hợp lệ. Tiến độ được giữ trong Lịch sử.'}</p><div class="button-group"><a class="btn primary" href="#settings">Kiểm tra vai trò</a><a class="btn secondary" href="#history">Về lịch sử</a></div></section>`;
  const index = session.currentIndex;
  const q = session.questions[index];
  const result = getResult(session);
  const revealed = session.mode === 'practice' && !!session.answers[q.id];
  return `<div class="quiz-heading"><div><h1>${sessionTitle(session)}${session.source === 'mistakes' ? ' · Câu sai' : ''}</h1><p>${session.questions.length} câu hỏi${session.role ? ` · ${esc(roleLabel(session.role))}` : ''} · ${isTimedExam(session) ? '60 phút' : 'Không giới hạn thời gian'}</p></div>${isTimedExam(session) ? countdown(session,'exam-timer') : ''}<a class="btn secondary" href="#${session.mode === 'exam' ? 'exam' : 'home'}">${icon('close')} Lưu & thoát</a></div><div class="quiz-layout"><section class="card quiz-card">${questionContent(session, q, index, revealed, false)}<div class="quiz-actions"><button class="btn secondary" data-action="quiz-index" data-value="${index - 1}" ${index === 0 ? 'disabled' : ''}>${icon('arrow', 'back-icon')} Câu trước</button><button class="btn ${index === session.questions.length - 1 ? 'primary' : 'soft'}" data-action="${index === session.questions.length - 1 ? 'submit' : 'quiz-index'}" data-value="${index + 1}">${index === session.questions.length - 1 ? 'Nộp bài' : 'Câu tiếp theo'} ${icon('arrow')}</button></div></section><aside><section class="card navigator-card"><div class="navigator-head"><h2>Danh sách câu hỏi</h2><small>${result.answered}/${result.total}</small></div><div class="question-nav">${session.questions.map((question, i) => `<button data-action="quiz-index" data-value="${i}" class="${i === index ? 'current ' : ''}${session.answers[question.id] ? 'answered ' : ''}${session.flags.includes(question.id) ? 'marked' : ''}" aria-label="Câu ${i + 1}${session.answers[question.id] ? ', đã trả lời' : ', chưa trả lời'}${session.flags.includes(question.id) ? ', đã đánh dấu' : ''}" ${i === index ? 'aria-current="step"' : ''}>${i + 1}</button>`).join('')}</div><div class="legend"><span><i class="answered"></i>Đã trả lời</span><span><i></i>Chưa trả lời</span><span><i class="marked"></i>Đánh dấu</span></div><button class="btn primary block" data-action="submit">Nộp bài ${icon('check')}</button><div class="save-status">${icon('cloud')} Đã lưu trên thiết bị</div></section><p class="quiz-tip">${session.mode === 'practice' ? 'Mỗi câu được trả lời một lần.' : 'Có thể đổi đáp án trước khi nộp.'}</p></aside></div>`;
}

function questionContent(session, q, index, revealed, reviewing) {
  const selected = session.answers[q.id];
  const status = questionStatus(session, q);
  return `<div class="quiz-card-top"><span>Câu <strong>${index + 1}</strong> / ${session.questions.length}</span>${reviewing ? `<span class="badge ${status === 'wrong' ? 'amber' : status === 'blank' ? 'gray' : ''}">${{ correct: 'Trả lời đúng', wrong: 'Trả lời sai', blank: 'Bỏ trống' }[status]}</span>` : `<button class="flag-button ${session.flags.includes(q.id) ? 'marked' : ''}" data-action="flag" aria-pressed="${session.flags.includes(q.id)}">${icon('flag')} ${session.flags.includes(q.id) ? 'Đã đánh dấu' : 'Đánh dấu'}</button>`}</div>
  <div class="progress-track" role="progressbar" aria-label="Tiến độ trả lời" aria-valuemin="0" aria-valuemax="${session.questions.length}" aria-valuenow="${getResult(session).answered}"><div style="width:${getResult(session).answered / session.questions.length * 100}%"></div></div><span class="badge question-topic">${esc(q.topic)}</span><h2 class="question-text" id="question-title" tabindex="-1">${esc(q.question)}</h2>
  <div class="answers" ${!revealed ? 'role="group" aria-label="Chọn đáp án"' : ''}>${q.optionOrder.map((key, i) => {
    const chosen = selected === key;
    const correct = revealed && key === q.answer;
    const wrong = revealed && chosen && key !== q.answer;
    const classes = `${chosen ? 'selected ' : ''}${correct ? 'correct ' : ''}${wrong ? 'wrong ' : ''}`;
    return `<button class="answer ${classes}" data-action="answer" data-value="${key}" ${revealed ? 'disabled' : ''} ${!revealed ? `aria-pressed="${chosen}"` : ''}><span class="answer-letter">${String.fromCharCode(65 + i)}</span><span class="answer-content">${esc(q.options[key])}${revealed && (correct || chosen) ? `<span class="screen-reader"> · ${correct ? 'Đáp án đúng' : 'Đáp án bạn chọn, sai'}</span>` : ''}</span>${correct ? icon('check', 'answer-icon') : wrong ? icon('close', 'answer-icon') : chosen ? icon('check', 'answer-icon') : ''}</button>`;
  }).join('')}</div>${!revealed && session.mode === 'exam' && selected ? `<button class="clear-answer" data-action="clear-answer">Bỏ lựa chọn cho câu này</button>` : ''}
  ${revealed ? `<div class="feedback ${status}" role="status"><h3>${{ correct: 'Trả lời đúng', wrong: 'Trả lời sai', blank: 'Câu bỏ trống' }[status]}</h3><p class="correct-line">Đáp án đúng: ${String.fromCharCode(65 + q.optionOrder.indexOf(q.answer))}. ${esc(q.options[q.answer])}</p></div>` : ''}`;
}

function reviewQuestions(session) {
  return session.questions.map((q, i) => ({ q, index: i })).filter(({ q }) => state.reviewFilter === 'all' || (state.reviewFilter === 'flagged' ? session.flags.includes(q.id) : questionStatus(session, q) === state.reviewFilter));
}

function resultSummary(session,result,retryCount) {
  const exam = session.mode === 'exam';
  const elapsed = formatDuration(Math.max(0,Math.round((session.completedAt-(session.startTime || session.createdAt))/1000)));
  return `<section class="card result-summary" data-exam-result="${exam}"><div class="result-overview"><div><h1>${exam ? sessionTitle(session) : 'Kết quả bài làm'}</h1><p>${exam ? session.completionReason === 'timeout' ? 'Đã kết thúc do hết giờ' : 'Đã nộp bài' : 'Ôn tập'} · ${result.total} câu${session.role ? ` · ${esc(roleLabel(session.role))}` : ''}</p><p>${date(session.completedAt)}${exam ? ` · Thời gian làm bài: ${elapsed}` : ''}</p></div>${exam ? '' : `<div class="result-score">${number(result.score)}<small> / 10</small></div>`}</div>
  <div class="result-stats"><div><strong>${result.correct}</strong><small>Đúng</small></div><div class="wrong"><strong>${result.wrong}</strong><small>Sai</small></div><div class="blank"><strong>${result.blank}</strong><small>Bỏ trống</small></div></div>
  <div class="result-buttons">${exam ? `<a class="btn primary" data-view-answers href="#review/${encodeURIComponent(session.id)}/answers">Xem lại bài làm</a><a class="btn secondary" href="#exam">Thi đề mới</a><a class="btn secondary" href="#home">Về trang chủ</a>` : `<button class="btn primary" data-action="retry-session" ${retryCount ? '' : 'disabled'}>Ôn ${retryCount} câu sai</button><a class="btn secondary" href="#home">Thiết lập bài mới</a>`}</div></section>`;
}

function reviewPage() {
  const session = state.viewSession;
  if (!session) return missingSession();
  const result = getResult(session);
  const filtered = reviewQuestions(session);
  state.reviewIndex = Math.min(state.reviewIndex, Math.max(0, filtered.length - 1));
  const entry = filtered[state.reviewIndex];
  const retryCount = currentMistakes([session], state.bank, state.role).length;
  const summary = resultSummary(session,result,retryCount);
  if (session.mode === 'exam' && !state.reviewOpen) return summary;
  return `${summary}
  <div class="card-heading"><h2>Xem lại bài làm</h2><span class="version-pill">${filtered.length} câu</span></div><div class="filter-tabs" role="group" aria-label="Lọc câu trong bài làm">${[['all', `Tất cả (${result.total})`], ['wrong', `Câu sai (${result.wrong})`], ['blank', `Bỏ trống (${result.blank})`], ['flagged', `Đánh dấu (${session.flags.length})`]].map(([filter, label]) => `<button data-action="review-filter" data-value="${filter}" class="${state.reviewFilter === filter ? 'active' : ''}" aria-pressed="${state.reviewFilter === filter}">${label}</button>`).join('')}</div>
  ${entry ? `<div class="quiz-layout"><section class="card quiz-card">${questionContent(session, entry.q, entry.index, true, true)}<div class="quiz-actions"><button class="btn secondary" data-action="review-index" data-value="${state.reviewIndex - 1}" ${state.reviewIndex === 0 ? 'disabled' : ''}>${icon('arrow', 'back-icon')} Câu trước</button><span class="version-pill">${state.reviewIndex + 1} / ${filtered.length}</span><button class="btn soft" data-action="review-index" data-value="${state.reviewIndex + 1}" ${state.reviewIndex === filtered.length - 1 ? 'disabled' : ''}>Câu tiếp theo ${icon('arrow')}</button></div></section><aside class="card navigator-card"><div class="navigator-head"><h2>Câu trong bộ lọc</h2></div><div class="question-nav">${filtered.map(({ q, index }, i) => `<button data-action="review-index" data-value="${i}" class="${questionStatus(session, q)} ${state.reviewIndex === i ? 'current' : ''}" aria-label="Xem câu ${index + 1}, ${{ correct: 'đúng', wrong: 'sai', blank: 'bỏ trống' }[questionStatus(session, q)]}" ${state.reviewIndex === i ? 'aria-current="step"' : ''}>${index + 1}</button>`).join('')}</div><div class="legend"><span class="text-correct">Đúng</span><span class="text-wrong">Sai</span><span>Bỏ trống</span></div><a class="btn secondary block" href="#history">Về lịch sử</a></aside></div>` : `<section class="card">${emptyState('check', 'Không có câu trong bộ lọc này', 'Chọn bộ lọc khác để xem lại đáp án.')}</section>`}`;
}

function missingSession() { return `<section class="card">${emptyState('file', 'Không tìm thấy bài làm', 'Bài làm được lưu riêng trên từng thiết bị và trình duyệt.')}<a class="btn primary block" href="#history">Về lịch sử</a></section>`; }

function settingsPage() {
  const installed = isAppInstalled();
  return `<div class="page-heading"><h1>Cài đặt & dữ liệu</h1><span class="version-pill">v${VERSION}</span></div><div class="settings-grid">
  <section class="card settings-card"><h2>Vai trò</h2><form id="user-role-form"><label class="field-label role-field" for="user-role">Bạn là…</label><select id="user-role" class="select" required>${roleOptions(state.role)}</select><button type="submit" class="btn primary" disabled>Áp dụng</button></form><p>Bài mới gồm câu hỏi dùng chung và câu dành cho vai trò đã chọn.</p></section>
  <section class="card settings-card"><h2>Cài QuizLab lên thiết bị</h2><p>Thêm QuizLab vào màn hình chính để mở nhanh.</p>${installed ? '<p>Đã cài ứng dụng. Hãy mở QuizLab từ màn hình chính.</p>' : ''}<button class="btn primary" data-action="install">${installed ? 'Hướng dẫn cài đặt' : 'Cài ứng dụng'}</button></section>
  <section class="card settings-card"><h2>Sao lưu & khôi phục</h2><p>Sao lưu bài làm, vai trò và thiết lập thành JSON để chuyển thiết bị hoặc khôi phục.</p><p>Dữ liệu lưu trong trình duyệt; không tự đồng bộ giữa các thiết bị.</p><div class="button-group"><button class="btn primary" data-action="export-backup">${icon('download')} Xuất sao lưu</button><button class="btn secondary" data-action="import-backup">${icon('upload')} Khôi phục</button></div></section>
  <section class="card settings-card"><h2>Ngân hàng câu hỏi</h2><p>${esc(bankSummary())}</p><p>${state.bank.manifest.chapters.length} chương · ${state.bank.manifest.sections.length} mục nội dung. Tự nhận dữ liệu được phát hành khi có mạng.</p><a class="btn secondary" href="#bank">Xem ngân hàng</a>${state.legacyBank ? '<p>Ngân hàng từng nhập ở bản cũ đã được lưu trữ riêng.</p><button class="btn secondary" data-action="export-legacy">Tải ngân hàng cũ</button>' : ''}</section>
  <section class="card settings-card"><h2>Phiên bản & cập nhật</h2><p>Phiên bản ${VERSION}. Cập nhật ứng dụng giữ nguyên tiến độ và lịch sử.</p><button class="btn secondary" data-action="check-update">Kiểm tra cập nhật</button></section></div>`;
}

function render({ focusMain = false } = {}) {
  state.config = cleanConfig(state.config);
  state.examConfig = cleanConfig(state.examConfig, 'exam');
  const questionNavScrollTop = root.querySelector('.question-nav')?.scrollTop;
  const pageScroll = { x: window.scrollX, y: window.scrollY };
  const focused = document.activeElement;
  const previousAction = focused?.dataset?.action;
  const previousValue = focused?.dataset?.value;
  const screens = { home, exam: examPage, history, mistakes: mistakesPage, bank: bankPage, memory: () => renderMemoryPage(state.memoryData,{chapterId:state.memoryChapter,sectionId:state.memorySection,expanded:state.memoryExpanded}), quiz: quizPage, review: reviewPage, settings: settingsPage };
  const content = state.loadingRoute ? '<section class="card settings-card" role="status"><p>Đang tải…</p></section>' : state.navigationError ? `<section class="card settings-card" role="alert"><h1>Chưa tải được trang</h1><p>${esc(state.navigationError)}</p><button class="btn primary" data-action="retry-navigation">Thử lại</button></section>` : (screens[state.route] || home)();
  root.innerHTML = shell(content);
  document.title = `${routeTitle()} · QuizLab`;
  updateCountdowns();
  if (focusMain) { document.querySelector('#main').focus({ preventScroll: true }); window.scrollTo(0, 0); }
  else if (previousAction) {
    const target = [...root.querySelectorAll('[data-action]')].find(button => button.dataset.action === previousAction && button.dataset.value === previousValue && !button.disabled);
    target?.focus({ preventScroll: true });
  }
  // Replacing the shell creates a new scroll container. Keep its position when
  // updating the current quiz; route changes remove the old list naturally.
  const questionNav = root.querySelector('.question-nav');
  if (questionNav && questionNavScrollTop !== undefined) {
    questionNav.scrollTop = questionNavScrollTop;
    if (!focusMain) window.scrollTo(pageScroll.x, pageScroll.y);
  }
  if (state.route === 'memory' && !state.loadingRoute && !focusMain) window.scrollTo(pageScroll.x,pageScroll.y);
}

async function refreshData() {
  const [sessions,counter] = await Promise.all([getSessions(),getSetting('exam-attempt-counter')]);
  state.sessions=sessions;state.examCounter=counter || 0;
}
function announceChange() { channel?.postMessage({ type: 'changed' }); }

async function navigateRoute(focusMain = true) {
  const revision = ++routeRevision;
  const [requested, encodedId, encodedSection] = location.hash.slice(1).split('/');
  const route = ['home', 'exam', 'history', 'mistakes', 'bank', 'memory', 'settings', 'quiz', 'review'].includes(requested) ? requested : 'home';
  state.route = route; state.viewSession = null; state.loadingRoute = true; state.navigationError = '';
  render();
  await refreshData();
  const selectedRole=await getSetting('user-role');
  if (isUserRole(selectedRole)) state.role=selectedRole;
  let session = null;
  if (['quiz', 'review'].includes(route) && encodedId) {
    try { session = await getSession(decodeURIComponent(encodedId)); } catch { session = null; }
  }
  const memoryData = route === 'memory' ? state.memoryData || await loadMemoryTips() : null;
  if (revision !== routeRevision) return;
  state.loadingRoute = false;
  if (session && ((route === 'quiz' && session.status === 'completed') || (route === 'review' && session.status === 'active'))) {
    location.replace(`#${session.status === 'completed' ? 'review' : 'quiz'}/${encodeURIComponent(session.id)}`); return;
  }
  state.route = route; state.viewSession = session;
  if (route === 'history') state.historyFilter = ['practice','exam','active'].includes(encodedId) ? encodedId : 'all';
  state.reviewOpen = session?.mode !== 'exam' || encodedSection === 'answers';
  state.bankChapter = null; state.bankSection = null;
  if (route === 'bank' && encodedId) {
    const chapter = state.bank.manifest.chapters.find(c => c.id === encodedId);
    if (!chapter) { location.replace('#bank'); return; }
    state.bankChapter = chapter.id;
    const children = state.bank.manifest.sections.filter(s => s.chapterId === chapter.id);
    if (encodedSection && !children.some(s => s.id === encodedSection)) { location.replace(`#bank/${chapter.id}`); return; }
    state.bankSection = children.length === 1 ? children[0].id : encodedSection || null;
  }
  if (route === 'memory') {
    state.memoryData = memoryData;
    const chapter = encodedId ? memoryData.chapters.find(chapter => chapter.id === encodedId) : memoryData.chapters[0];
    if (!chapter) { location.replace('#memory'); return; }
    if (encodedSection && !chapter.sections.some(section => section.id === encodedSection)) { location.replace(`#memory/${chapter.id}`); return; }
    state.memoryChapter = chapter.id;
    state.memorySection = memorySelection(memoryData,chapter.id,encodedSection).section.id;
  }
  state.reviewFilter = 'all'; state.reviewIndex = 0;
  render({ focusMain });
  if (route !== 'quiz') applyAppUpdate();
}

function navigationError(error) {
  toast(error.message, true);
  state.loadingRoute = false; state.navigationError = error.message;
  render();
}

function requestNavigation() {
  const navigation = navigateRoute();
  const revision = routeRevision;
  return navigation.catch(error => { if (revision === routeRevision) navigationError(error); });
}

async function startSession(questions, config) {
  const selectedRole=await getSetting('user-role');
  if (selectedRole!==state.role) {
    if (isUserRole(selectedRole)) state.role=selectedRole;
    render();throw new Error('Vai trò đã thay đổi. Hãy chọn lại bài làm theo vai trò hiện tại.');
  }
  const filters = config.source === 'mistakes' ? {chapterId:'all',sectionId:'all',difficulty:'all',scope:'all'} : currentFilters(config);
  const session = createSession(questions, { ...config, role: state.role, bankVersion: state.bank.dataVersion, filters });
  await addSession(session);
  announceChange();
  location.hash = `quiz/${encodeURIComponent(session.id)}`;
}

async function startExam() {
  const selectedRole=await getSetting('user-role');
  if (selectedRole !== state.role) {
    if (isUserRole(selectedRole)) state.role=selectedRole;
    render();throw new Error('Vai trò đã thay đổi. Hãy kiểm tra lại vai trò trước khi thi.');
  }
  await refreshData();
  if (ongoingExam(state.sessions)) {render();toast('Bạn đang có bài thi chưa kết thúc. Hãy nộp bài hoặc chờ hết giờ trước khi bắt đầu bài mới.');return;}
  let session;
  try {session=await addExamSession(createExamSession(state.bank,state.role,{shuffleAnswers:state.examConfig.shuffleAnswers}));}
  catch (error) {
    if (error.code !== 'EXAM_IN_PROGRESS') throw error;
    await refreshData();render();toast(error.message);return;
  }
  await refreshData();announceChange();location.hash=`quiz/${encodeURIComponent(session.id)}`;
}

async function mutateSession(update) {
  const id = state.viewSession?.id;
  if (!id) return;
  const revision = routeRevision;
  const status = document.querySelector('.save-status');
  if (status) status.textContent = 'Đang lưu…';
  let saved;
  try { saved = await updateSession(id, update); }
  catch (error) {
    if (status?.isConnected) status.textContent = 'Chưa lưu được. Vui lòng thử lại.';
    throw error;
  }
  // updateSession returns the committed snapshot. Reading all history after every
  // click needlessly blocks answers and navigation as the history grows.
  const index = state.sessions.findIndex(session => session.id === id);
  if (index < 0) state.sessions.push(saved); else state.sessions[index] = saved;
  announceChange();
  if (revision !== routeRevision || state.route !== 'quiz' || state.viewSession?.id !== id) return;
  state.viewSession = saved;
  if (saved.status === 'completed') location.hash = `review/${encodeURIComponent(id)}`;
  else render();
}

async function submitSession() {
  const current = await getSession(state.viewSession.id);
  if (current.status === 'completed') { location.hash = `review/${encodeURIComponent(current.id)}`; return; }
  const result = getResult(current);
  const confirmed = await confirmDialog('Nộp bài làm?', `Bạn đã trả lời <strong>${result.answered}/${result.total} câu</strong>.${result.blank ? `<br>Còn <strong>${result.blank} câu bỏ trống</strong>.` : ''}<br>Sau khi nộp, bạn có thể xem kết quả và đáp án từng câu.`, 'Nộp bài');
  if (!confirmed) return;
  const finished = await updateSession(current.id, session => finishSession(session));
  state.viewSession = finished; await refreshData(); announceChange();
  location.hash = `review/${encodeURIComponent(finished.id)}`;
}

function downloadJSON(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readJSON(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('File quá lớn. Vui lòng chọn JSON dưới 25 MB.');
  try { return JSON.parse(await file.text()); } catch { throw new Error('Không đọc được JSON. Kiểm tra cú pháp của file.'); }
}

async function importBackup(file) {
  const backup = await readJSON(file);
  if (backup?.format !== 'quizlab-backup' || ![1, 2].includes(backup.version) || !Array.isArray(backup.sessions) || backup.sessions.length > 10000) throw new Error('File không phải bản sao lưu QuizLab hợp lệ.');
  const sessions = backup.sessions.map(validateSession);
  if (new Set(sessions.map(s => s.id)).size !== sessions.length) throw new Error('Bản sao lưu có ID bài làm trùng nhau.');
  const preferences = {};
  if (backup.version === 2) {
    if (isUserRole(backup.preferences?.['user-role'])) preferences['user-role'] = backup.preferences['user-role'];
    const old = backup.preferences?.['quiz-config'];
    const practice = backup.preferences?.['practice-config'] || old;
    const exam = backup.preferences?.['exam-config'] || old;
    if (practice) preferences['practice-config'] = cleanConfig(practice);
    if (exam) preferences['exam-config'] = cleanConfig(exam,'exam');
    if (Number.isSafeInteger(backup.preferences?.['exam-attempt-counter']) && backup.preferences['exam-attempt-counter'] >= 0) preferences['exam-attempt-counter']=backup.preferences['exam-attempt-counter'];
  }
  const added = sessions.filter(s => !state.sessions.some(local => local.id === s.id)).length;
  if (!await confirmDialog('Khôi phục dữ liệu?', `Sẽ thêm <strong>${added} bài làm</strong>${Object.keys(preferences).length ? ' và khôi phục vai trò, thiết lập đã sao lưu' : ''}.<br>Bài làm đã có cùng ID được giữ nguyên. Ngân hàng chính thức tiếp tục dùng phiên bản hiện hành.`, 'Khôi phục')) return;
  await restoreBackup(sessions, preferences);
  if (preferences['user-role']) state.role = preferences['user-role'];
  if (preferences['practice-config']) state.config = preferences['practice-config'];
  if (preferences['exam-config']) state.examConfig = preferences['exam-config'];
  await refreshData(); announceChange(); render(); toast(`Đã khôi phục ${added} bài làm.`);
}

function showInstallGuide() {
  dialog.innerHTML = `<form id="install-guide" method="dialog"><h2 id="dialog-title">Cài QuizLab lên thiết bị</h2><p><strong>iPhone / iPad:</strong> mở bằng Safari → nút Chia sẻ → Thêm vào Màn hình chính.</p><p><strong>Android:</strong> mở bằng Chrome → menu ⋮ → Cài đặt ứng dụng hoặc Thêm vào màn hình chính.</p><p><strong>Máy tính:</strong> chọn biểu tượng cài đặt trên thanh địa chỉ của Chrome / Edge.</p><p>Cần mở bằng HTTPS (hoặc localhost). Nếu ứng dụng đã được cài, hãy mở từ màn hình chính.</p><div class="dialog-actions"><button class="btn primary" value="close">Đã hiểu</button></div></form>`;
  dialog.addEventListener('close', () => applyAppUpdate(), { once: true });
  dialog.showModal();
}

async function installApp() {
  if (state.installPrompt && !isAppInstalled()) {
    const prompt = state.installPrompt;
    state.installPrompt = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') toast('Đã gửi yêu cầu cài đặt QuizLab.');
    return;
  }
  showInstallGuide();
}

const actions = {
  'memory-toggle': value => {
    if (state.route !== 'memory' || !state.memoryData) return;
    const {section} = memorySelection(state.memoryData,state.memoryChapter,state.memorySection);
    if (!section.rows.some(row => row.id === value)) return;
    if (state.memoryExpanded.has(value)) state.memoryExpanded.delete(value); else state.memoryExpanded.add(value);
    updateMemoryRows();
  },
  'memory-open-all': () => expandMemoryRows(true),
  'memory-close-all': () => expandMemoryRows(false),
  'retry-navigation': requestNavigation,
  'install': installApp,
  'answer': async value => {
    const questionId = state.viewSession.questions[state.viewSession.currentIndex].id;
    await mutateSession(session => {
      if (!session.questions.find(q => q.id === questionId)?.optionOrder.includes(value)) return;
      if (session.mode === 'practice' && session.answers[questionId]) return;
      session.answers[questionId] = value;
    });
  },
  'clear-answer': async () => {
    const id = state.viewSession.questions[state.viewSession.currentIndex].id;
    await mutateSession(session => { if (session.mode === 'exam') delete session.answers[id]; });
  },
  'quiz-index': async value => {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= state.viewSession.questions.length) return;
    await mutateSession(session => { session.currentIndex = index; });
    document.querySelector('#question-title')?.focus({ preventScroll: true });
  },
  'flag': async () => {
    const id = state.viewSession.questions[state.viewSession.currentIndex].id;
    await mutateSession(session => { session.flags = session.flags.includes(id) ? session.flags.filter(q => q !== id) : [...session.flags, id]; });
  },
  'submit': submitSession,
  'review-filter': value => { state.reviewFilter = value; state.reviewIndex = 0; render(); },
  'review-index': value => {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= reviewQuestions(state.viewSession).length) return;
    state.reviewIndex = index; render(); document.querySelector('#question-title')?.focus({ preventScroll: true });
  },
  'history-filter': value => { location.hash = value === 'all' ? 'history' : `history/${value}`; },
  'retry-mistakes': () => startSession(roleMistakes(), { ...state.config, mode: 'practice', count: 'all', source: 'mistakes' }),
  'retry-session': () => startSession(currentMistakes([state.viewSession], state.bank, state.role), { ...state.config, mode: 'practice', count: 'all', source: 'mistakes' }),
  'import-backup': () => document.querySelector('#backup-file').click(),
  'export-legacy': () => downloadJSON(state.legacyBank, 'quizlab-ngan-hang-cu.json'),
  'export-backup': async () => { await refreshData(); await preferencesWrite; downloadJSON({ format: 'quizlab-backup', version: 2, exportedAt: new Date().toISOString(), sessions: state.sessions, preferences: { 'user-role': state.role, 'practice-config': state.config, 'exam-config': state.examConfig, 'exam-attempt-counter': state.examCounter } }, `quizlab-backup-${new Date().toISOString().slice(0, 10)}.json`); },
  'check-update': async () => {
    if (!navigator.onLine) throw new Error('Cần kết nối mạng để kiểm tra phiên bản mới.');
    await refreshOfficialBank(true);
    render();
    if (!state.swRegistration) {
      toast('Đã kiểm tra ngân hàng câu hỏi. Tải lại trang để nhận phiên bản giao diện mới.');
      return;
    }
    await state.swRegistration.update();
    toast(state.swRegistration.waiting ? 'Có phiên bản mới. Chọn Cập nhật ngay.' : 'Đã kiểm tra cập nhật; sẽ thông báo khi phiên bản mới tải xong.');
  },
  'update': async () => {
    await applyAppUpdate();
  }
};

root.addEventListener('click', event => {
  let button = event.target.closest('[data-action]');
  if (!button && state.route === 'memory' && !event.target.closest('a,input,select,textarea,button') && window.getSelection()?.isCollapsed !== false) {
    button = event.target.closest('[data-memory-row]')?.querySelector('.memory-toggle');
  }
  if (!button || button.disabled) return;
  const action = actions[button.dataset.action];
  if (action) run(() => action(button.dataset.value));
});

root.addEventListener('submit', event => {
  if (event.target.id === 'user-role-form') {
    event.preventDefault(); run(() => changeUserRole(event.target.querySelector('select').value)); return;
  }
  if (event.target.id === 'exam-config') {event.preventDefault();run(startExam);return;}
  if (event.target.id !== 'quiz-config') return;
  event.preventDefault();
  const mode = event.target.id === 'exam-config' ? 'exam' : 'practice';
  const config = cleanConfig(mode === 'exam' ? state.examConfig : state.config,mode);
  if (mode === 'exam') state.examConfig=config; else state.config=config;
  run(async () => { await saveQuizConfig(mode); await startSession(availableQuestions(config), config); });
});

root.addEventListener('change', event => {
  const input = event.target;
  if (state.route === 'memory' && state.memoryData && ['memory-chapter','memory-section'].includes(input.id)) {
    const chapterId = input.id === 'memory-chapter' ? input.value : state.memoryChapter;
    const sectionId = input.id === 'memory-section' ? input.value : null;
    const {chapter,section} = memorySelection(state.memoryData,chapterId,sectionId);
    location.hash = `memory/${chapter.id}/${section.id}`;
    return;
  }
  const form = input.closest('#quiz-config,#exam-config');
  if (form) {
    if (!['chapterId','sectionId','count','difficulty','scope','shuffleQuestions','shuffleAnswers'].includes(input.name)) return;
    const mode = form.id === 'exam-config' ? 'exam' : 'practice';
    const config = mode === 'exam' ? state.examConfig : state.config;
    config[input.name] = input.type === 'checkbox' ? input.checked : input.value;
    if (input.name === 'chapterId') config.sectionId = 'all';
    const normalized = cleanConfig(config,mode);
    if (mode === 'exam') state.examConfig=normalized; else state.config=normalized;
    if (input.name === 'chapterId') {
      form.querySelector('.quiz-filters').innerHTML = configFilters(mode);
      form.querySelector('[name=chapterId]')?.focus({ preventScroll: true });
    }
    form.querySelector('[data-count-note]').textContent = countNote(normalized);
    form.querySelector('button[type="submit"]').disabled = !availableQuestions(normalized).length;
    saveQuizConfig(mode).catch(error => toast(`Không lưu được thiết lập: ${error.message}`, true));
  } else if (input.id === 'user-role') {
    input.closest('form').querySelector('button').disabled = input.value === state.role;
  } else if (['bank-difficulty', 'bank-scope'].includes(input.id)) {
    state.bankFilters[input.id.slice(5)] = input.value;
    const filters = structuredClone(state.bankFilters);
    preferencesWrite = preferencesWrite.catch(() => { }).then(() => setSetting('bank-filters', filters));
    preferencesWrite.catch(error => toast(error.message, true));
    updateBankList();
  }
});

function expandMemoryRows(open) {
  if (state.route !== 'memory' || !state.memoryData) return;
  const {section} = memorySelection(state.memoryData,state.memoryChapter,state.memorySection);
  for (const row of section.rows) {
    if (open) state.memoryExpanded.add(row.id); else state.memoryExpanded.delete(row.id);
  }
  updateMemoryRows();
}

function updateMemoryRows() {
  const {section} = memorySelection(state.memoryData,state.memoryChapter,state.memorySection);
  let opened = 0;
  for (const row of section.rows) {
    const open = state.memoryExpanded.has(row.id), button = root.querySelector(`.memory-toggle[data-value="${row.id}"]`);
    if (!button) continue;
    document.getElementById(button.getAttribute('aria-controls')).hidden = !open;
    button.setAttribute('aria-expanded',String(open));
    button.querySelector('.memory-toggle-label').innerHTML = `${open ? 'Ẩn nội dung' : 'Xem nội dung'} ${icon('chevron')}`;
    if (open) opened++;
  }
  root.querySelector('[data-action="memory-open-all"]').disabled = opened === section.rows.length;
  root.querySelector('[data-action="memory-close-all"]').disabled = opened === 0;
}

function updateBankList() {
  document.querySelector('#bank-count').textContent = `${filteredBank().length} câu trong phạm vi đang xem`;
  document.querySelector('#bank-list').innerHTML = bankListContent();
}

root.addEventListener('input', event => { if (event.target.id === 'bank-search') { state.search = event.target.value; updateBankList(); } });
for (const [id, handler] of [['backup-file', importBackup]]) {
  document.querySelector(`#${id}`).addEventListener('change', event => {
    const file = event.target.files[0]; event.target.value = '';
    if (file) run(() => handler(file));
  });
}
window.addEventListener('hashchange', () => { if (state.initialized) requestNavigation(); });
window.addEventListener('online', () => { if (state.initialized) { render(); refreshOfficialBank(); } });
window.addEventListener('offline', () => { if (state.initialized) render(); });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; });
window.addEventListener('appinstalled', () => {
  state.installPrompt = null; state.appInstalled = true;
  if (state.initialized) render();
  toast('QuizLab đã được cài lên thiết bị.');
});
window.addEventListener('database-blocked', () => toast('Đóng các tab QuizLab khác để hoàn tất nâng cấp dữ liệu.', true));
window.addEventListener('database-version-change', () => toast('Dữ liệu đã được nâng cấp ở tab khác. Hãy tải lại trang.', true));

async function syncFromOtherTab() {
  if (!state.initialized) return;
  if (busy || dialog.open) {syncPending=true;return;}
  await refreshData();
  const [bank, role] = await Promise.all([cachedBank(), getSetting('user-role')]);
  if (bank) state.bank = bank;
  if (isUserRole(role) && role !== state.role) {
    state.role = role; state.search = '';
  }
  if (['quiz', 'review'].includes(state.route) && state.viewSession) {
    const refreshed = await getSession(state.viewSession.id);
    if (state.route === 'quiz' && refreshed?.status === 'completed') { if (dialog.open) dialog.close('completed'); location.hash = `review/${encodeURIComponent(refreshed.id)}`; return; }
    state.viewSession = refreshed;
  }
  render();
}
channel?.addEventListener('message', () => syncFromOtherTab().catch(error => toast(error.message, true)));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.initialized) { syncFromOtherTab().catch(error => toast(error.message, true)); refreshOfficialBank(); checkExamDeadlines().catch(error => toast(error.message,true)); } });
window.addEventListener('pageshow', () => { if (state.initialized) checkExamDeadlines().catch(error => toast(error.message,true)); });
window.addEventListener('focus', () => { if (state.initialized) checkExamDeadlines().catch(error => toast(error.message,true)); });

async function refreshOfficialBank(manual = false) {
  if (state.checkingBank) return;
  state.checkingBank = true;
  try {
    const bank = await checkBankUpdate();
    const changed = bank.dataVersion !== state.bank.dataVersion;
    const repaired = roleIssues(state.bank.questions).length>0 && roleIssues(bank.questions).length===0;
    state.bank = bank;
    state.legacyBank = await getSetting('legacy-imported-bank') || null;
    if (changed || repaired) {
      announceChange();
      if (!busy && !dialog.open) render();
      if (state.initialized) toast(repaired ? 'Đã kiểm tra và khôi phục dữ liệu chức danh hợp lệ.' : 'Đã cập nhật ngân hàng. Bài đang làm và lịch sử được giữ nguyên.');
    } else if (manual) toast('Ngân hàng đang dùng phiên bản hiện hành.');
  } catch (error) {
    if (manual) throw error;
    if (/role|chức danh|phân loại/i.test(error.message) && error.message!==lastBankWarning) {
      lastBankWarning=error.message;toast('Bộ dữ liệu mới có câu thiếu hoặc sai chức danh, phân loại. Tiếp tục dùng bộ đã lưu.',true);
    }
    if (!state.bank.dataVersion && state.initialized) toast('Chưa tải được ngân hàng. Kết nối mạng để tải dữ liệu; bài đã lưu vẫn mở được.', true);
  } finally { state.checkingBank = false; }
}

function updateCountdowns() {
  for (const timer of document.querySelectorAll('[data-exam-end]')) {
    const remaining=Math.max(0,Math.ceil((Number(timer.dataset.examEnd)-Date.now())/1000));
    timer.textContent=formatDuration(remaining);timer.classList.toggle('urgent',remaining<=300);
  }
}

async function checkExamDeadlines() {
  updateCountdowns();
  if (!state.initialized || deadlineCheck) return deadlineCheck;
  if (!isExamExpired(state.viewSession) && !state.sessions.some(s => isExamExpired(s))) return;
  deadlineCheck=(async()=>{
    const id=state.route === 'quiz' ? state.viewSession?.id : null;
    await refreshData();
    const finished=state.sessions.find(s => s.id===id);
    if (finished?.status === 'completed' && state.route === 'quiz' && state.viewSession?.id === id) {
      state.viewSession=finished;
      if (dialog.open) dialog.close('timeout');
      toast('Đã hết 60 phút. Bài thi đã tự động kết thúc.');
      location.hash=`review/${encodeURIComponent(id)}`;
    } else if (!busy && !dialog.open) render();
    else syncPending=true;
    announceChange();
  })().finally(()=>{deadlineCheck=null;});
  return deadlineCheck;
}

async function applyAppUpdate() {
  if (busy || dialog.open || state.route === 'quiz' || location.hash.startsWith('#quiz/')) return;
  if (pendingReload) {
    if (!reloading) { reloading = true; await preferencesWrite.catch(() => { }); location.reload(); }
    return;
  }
  if (state.waitingWorker && !state.updating) {
    state.updating = true; render(); state.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }
}

async function setupAppUpdates() {
  try {
    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker || !window.isSecureContext) return;
    let hasController = !!serviceWorker.controller;
    serviceWorker.addEventListener('controllerchange', async () => {
      // Initial setup claims this page without reloading. Updates wait for a safe exit.
      if (!hasController && !state.updating) { hasController = true; return; }
      pendingReload = true; await applyAppUpdate();
    });
    const registration = await serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    state.swRegistration = registration;
    const offerUpdate = () => { if (registration.waiting && navigator.serviceWorker.controller) { state.waitingWorker = registration.waiting; render(); applyAppUpdate(); } };
    offerUpdate();
    const watchInstallingWorker = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(); });
    };
    registration.addEventListener('updatefound', watchInstallingWorker);
    watchInstallingWorker();
  } catch (error) { console.warn('Không khởi tạo được cơ chế cập nhật phiên bản ứng dụng.', error); }
}

async function initialize() {
  try {
    await openDatabase();
    const [sessions, cached, oldConfig, practiceConfig, examConfig, role, bankFilters, legacy] = await Promise.all([getSessions(), cachedBank(), getSetting('quiz-config'),getSetting('practice-config'),getSetting('exam-config'), getSetting('user-role'), getSetting('bank-filters'), getSetting('legacy-imported-bank')]);
    state.sessions = sessions;
    state.examCounter = await getSetting('exam-attempt-counter') || 0;
    state.role = isUserRole(role) ? role : null;
    if (cached) state.bank = cached;
    else await refreshOfficialBank();
    state.legacyBank = legacy || await getSetting('legacy-imported-bank') || null;
    state.config = cleanConfig(practiceConfig || oldConfig || {});
    state.examConfig = cleanConfig(examConfig || oldConfig || {},'exam');
    await saveQuizConfig(); await saveQuizConfig('exam');
    if (bankFilters && ['all', 'shared', 'role'].includes(bankFilters.scope) && ['all', 'unclassified', ...state.bank.manifest.difficulties].includes(bankFilters.difficulty)) state.bankFilters = bankFilters;
    if (!state.role) await chooseInitialRole();
    state.initialized = true; await navigateRoute(false); setupAppUpdates();
    if (cached && navigator.onLine) refreshOfficialBank();
  } catch (error) {
    console.error(error);
    root.innerHTML = `<main class="error-screen">${brand}<h1>Không thể mở QuizLab</h1><p>${esc(error.message)}<br>Hãy mở trang bằng HTTP/HTTPS và cho phép trình duyệt lưu dữ liệu trên thiết bị.</p><button class="btn primary" onclick="location.reload()">Thử lại</button></main>`;
  }
}
setInterval(() => checkExamDeadlines().catch(error => toast(error.message,true)),1000);
initialize();
