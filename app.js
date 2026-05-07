const STORAGE_KEY = 'home_maintenance_tasks';

let tasks = [];
let activeFilter = 'all';
let pendingDeleteId = null;

// ── Persistence ────────────────────────────────────────────────

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// ── Date / Status ──────────────────────────────────────────────

function addInterval(date, amount, unit) {
  const d = new Date(date);
  if (unit === 'days') d.setDate(d.getDate() + amount);
  else if (unit === 'weeks') d.setDate(d.getDate() + amount * 7);
  else if (unit === 'months') d.setMonth(d.getMonth() + amount);
  return d;
}

function getStatus(task) {
  if (!task.lastCompleted) return 'never';
  const due = addInterval(task.lastCompleted, task.interval, task.intervalUnit);
  const daysLeft = Math.ceil((due - new Date()) / 86400000);
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 7) return 'due-soon';
  return 'ok';
}

function getDueDate(task) {
  if (!task.lastCompleted) return null;
  return addInterval(task.lastCompleted, task.interval, task.intervalUnit);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatInterval(n, unit) {
  const label = n === 1 ? unit.replace(/s$/, '') : unit;
  return `Every ${n} ${label}`;
}

// ── Render ─────────────────────────────────────────────────────

function matchesFilter(task) {
  const s = getStatus(task);
  if (activeFilter === 'all') return true;
  if (activeFilter === 'overdue') return s === 'overdue' || s === 'never';
  if (activeFilter === 'due-soon') return s === 'due-soon';
  if (activeFilter === 'ok') return s === 'ok';
  return true;
}

function renderTasks() {
  const list = document.getElementById('task-list');
  const filtered = tasks.filter(matchesFilter);

  if (filtered.length === 0) {
    const isGlobal = tasks.length === 0;
    list.innerHTML = `
      <div class="empty-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
          <path d="M9 21V12h6v9"/>
        </svg>
        <p>${isGlobal ? 'No tasks yet.' : 'No tasks match this filter.'}</p>
        ${isGlobal ? `<button id="empty-add-btn">Add your first task</button>` : ''}
      </div>`;
    if (isGlobal) {
      document.getElementById('empty-add-btn').addEventListener('click', openAddModal);
    }
    return;
  }

  list.innerHTML = filtered.map(buildCard).join('');
}

function buildCard(task) {
  const status = getStatus(task);
  const due = getDueDate(task);

  const statusLabels = { overdue: 'Overdue', 'due-soon': 'Due Soon', ok: 'Up to Date', never: 'Not Started' };
  const statusChipClass = `chip chip-status-${status}`;

  const lastDoneHtml = task.lastCompleted
    ? `<span class="date-item"><strong>Last done:</strong> ${formatDate(task.lastCompleted)}</span>`
    : `<span class="date-item">Never completed</span>`;

  const nextDueHtml = due
    ? `<span class="date-item"><strong>Next due:</strong> ${formatDate(due.toISOString())}</span>`
    : '';

  const notesHtml = buildNotesBlock(task);

  const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const xIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const repeatIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

  return `
    <div class="task-card status-${status}" data-id="${task.id}">
      <div class="card-accent"></div>
      <div class="card-body">
        <div class="card-top">
          <span class="task-name">${escapeHtml(task.name)}</span>
          <button class="card-delete" data-action="delete" data-id="${task.id}" title="Remove task">${xIcon}</button>
        </div>
        <div class="card-chips">
          <span class="${statusChipClass}">${statusLabels[status]}</span>
          <span class="chip chip-interval">${repeatIcon}${escapeHtml(formatInterval(task.interval, task.intervalUnit))}</span>
        </div>
        <div class="card-dates">
          ${lastDoneHtml}
          ${nextDueHtml}
        </div>
        ${notesHtml}
      </div>
      <div class="card-footer">
        <button class="btn-complete" data-action="complete" data-id="${task.id}">
          ${checkIcon} Mark Complete
        </button>
      </div>
    </div>`;
}

function buildNotesBlock(task) {
  const hasNotes = task.notes && task.notes.trim();
  return `
    <div class="card-notes" data-notes-id="${task.id}">
      ${hasNotes
        ? `<div class="notes-text">${escapeHtml(task.notes)}</div>
           <button class="btn-notes-edit" data-action="edit-notes" data-id="${task.id}">Edit note</button>`
        : `<span class="notes-placeholder">No notes —
           <button class="btn-notes-edit" data-action="edit-notes" data-id="${task.id}" style="font-style:normal">add one</button></span>`
      }
    </div>`;
}

function buildNotesEditor(task) {
  return `
    <div class="notes-editor-wrap">
      <textarea data-notes-editor="${task.id}" placeholder="Add notes here...">${escapeHtml(task.notes || '')}</textarea>
      <div class="notes-editor-actions">
        <button class="btn-notes-save" data-action="save-notes" data-id="${task.id}">Save</button>
        <button class="btn-notes-cancel" data-action="cancel-notes" data-id="${task.id}">Cancel</button>
      </div>
    </div>`;
}

// ── Card Click Handler ─────────────────────────────────────────

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'complete')     markComplete(id);
  else if (action === 'delete')  openDeleteModal(id);
  else if (action === 'edit-notes')   showNotesEditor(id);
  else if (action === 'save-notes')   saveNotes(id);
  else if (action === 'cancel-notes') cancelNotes(id);
});

// ── Task Actions ───────────────────────────────────────────────

function markComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.lastCompleted = new Date().toISOString();
  saveTasks();
  renderTasks();
}

function openDeleteModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  pendingDeleteId = id;
  document.getElementById('modal-task-name').textContent = task.name;
  document.getElementById('delete-overlay').classList.remove('hidden');
}

function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('delete-overlay').classList.add('hidden');
}

function confirmDelete() {
  if (!pendingDeleteId) return;
  tasks = tasks.filter(t => t.id !== pendingDeleteId);
  saveTasks();
  closeDeleteModal();
  renderTasks();
}

// ── Notes Editing ──────────────────────────────────────────────

function showNotesEditor(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const section = document.querySelector(`[data-notes-id="${id}"]`);
  if (!section) return;
  section.innerHTML = buildNotesEditor(task);
  section.querySelector('textarea').focus();
}

function saveNotes(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const editor = document.querySelector(`[data-notes-editor="${id}"]`);
  if (!editor) return;
  task.notes = editor.value.trim();
  saveTasks();
  const section = document.querySelector(`[data-notes-id="${id}"]`);
  if (section) section.outerHTML = buildNotesBlock(task).trim();
}

function cancelNotes(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const section = document.querySelector(`[data-notes-id="${id}"]`);
  if (section) section.outerHTML = buildNotesBlock(task).trim();
}

// ── Add Task Sheet ─────────────────────────────────────────────

function openAddModal() {
  document.getElementById('add-overlay').classList.remove('hidden');
  document.getElementById('task-name').focus();
}

function closeAddModal() {
  document.getElementById('add-overlay').classList.add('hidden');
  document.getElementById('add-task-form').reset();
  document.getElementById('task-interval').value = '1';
  document.getElementById('task-interval-unit').value = 'months';
}

function handleAddTask(e) {
  e.preventDefault();
  const name     = document.getElementById('task-name').value.trim();
  const interval = parseInt(document.getElementById('task-interval').value, 10);
  const intervalUnit = document.getElementById('task-interval-unit').value;
  const notes    = document.getElementById('task-notes').value.trim();
  if (!name || interval < 1) return;

  tasks.push({
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name, interval, intervalUnit, notes,
    lastCompleted: null,
  });
  saveTasks();
  closeAddModal();
  renderTasks();
}

// ── Filter Tabs ────────────────────────────────────────────────

document.getElementById('filter-pills').addEventListener('click', e => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
  pill.classList.add('active');
  activeFilter = pill.dataset.filter;
  renderTasks();
});

// ── Utility ────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ───────────────────────────────────────────────────────

document.getElementById('open-add-modal').addEventListener('click', openAddModal);
document.getElementById('close-add-modal').addEventListener('click', closeAddModal);
document.getElementById('add-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('add-overlay')) closeAddModal();
});
document.getElementById('add-task-form').addEventListener('submit', handleAddTask);
document.getElementById('modal-cancel').addEventListener('click', closeDeleteModal);
document.getElementById('modal-confirm').addEventListener('click', confirmDelete);
document.getElementById('delete-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('delete-overlay')) closeDeleteModal();
});

loadTasks();
renderTasks();
