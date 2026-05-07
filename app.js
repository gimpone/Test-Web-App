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

// ── Date / Status Helpers ──────────────────────────────────────

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
  const now = new Date();
  const daysUntilDue = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= 7) return 'due-soon';
  return 'ok';
}

function getDueDate(task) {
  if (!task.lastCompleted) return null;
  return addInterval(task.lastCompleted, task.interval, task.intervalUnit);
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

function formatInterval(amount, unit) {
  const label = amount === 1 ? unit.replace(/s$/, '') : unit;
  return `Every ${amount} ${label}`;
}

// ── Render ─────────────────────────────────────────────────────

function matchesFilter(task) {
  if (activeFilter === 'all') return true;
  const status = getStatus(task);
  if (activeFilter === 'overdue') return status === 'overdue' || status === 'never';
  if (activeFilter === 'due-soon') return status === 'due-soon';
  if (activeFilter === 'ok') return status === 'ok';
  return true;
}

function renderTasks() {
  const list = document.getElementById('task-list');
  const filtered = tasks.filter(matchesFilter);

  if (filtered.length === 0) {
    const msg = tasks.length === 0
      ? 'No tasks yet. Add one above to get started.'
      : 'No tasks match this filter.';
    list.innerHTML = `<p class="empty-state">${msg}</p>`;
    return;
  }

  list.innerHTML = filtered.map(task => buildTaskCard(task)).join('');
  attachCardListeners();
}

function buildTaskCard(task) {
  const status = getStatus(task);
  const dueDate = getDueDate(task);
  const badgeMap = {
    overdue: ['badge-overdue', 'Overdue'],
    'due-soon': ['badge-due-soon', 'Due Soon'],
    ok: ['badge-ok', 'Up to Date'],
    never: ['badge-never', 'Not Started'],
  };
  const [badgeClass, badgeLabel] = badgeMap[status];

  const lastDone = task.lastCompleted
    ? `<span class="meta-item">Last done: ${formatDate(task.lastCompleted)}</span>`
    : `<span class="meta-item">Never completed</span>`;

  const nextDue = dueDate
    ? `<span class="meta-item">Next due: ${formatDate(dueDate.toISOString())}</span>`
    : '';

  const notesSection = buildNotesSection(task);

  return `
    <div class="task-card status-${status}" data-id="${task.id}">
      <div class="task-top">
        <span class="task-name">${escapeHtml(task.name)}</span>
        <div class="task-actions">
          <button class="btn btn-complete" data-action="complete" data-id="${task.id}">Mark Complete</button>
          <button class="btn btn-remove" data-action="delete" data-id="${task.id}" title="Remove task">&#x2715;</button>
        </div>
      </div>
      <div class="task-meta">
        <span class="status-badge ${badgeClass}">${badgeLabel}</span>
        ${lastDone}
        ${nextDue}
        <span class="meta-item">${formatInterval(task.interval, task.intervalUnit)}</span>
      </div>
      ${notesSection}
    </div>
  `;
}

function buildNotesSection(task) {
  const hasNotes = task.notes && task.notes.trim();
  const toggleLabel = hasNotes ? 'View notes' : 'Add notes';
  return `
    <div class="notes-section" data-notes-id="${task.id}">
      <button class="notes-toggle" data-action="toggle-notes" data-id="${task.id}">${toggleLabel}</button>
      <div class="notes-content hidden">
        ${hasNotes
          ? `<div class="notes-body" data-notes-body="${task.id}">${escapeHtml(task.notes)}</div>
             <div class="notes-edit-actions">
               <button class="btn-save-notes" data-action="edit-notes" data-id="${task.id}">Edit</button>
             </div>`
          : buildNotesEditor(task, '')
        }
      </div>
    </div>
  `;
}

function buildNotesEditor(task, currentValue) {
  return `
    <textarea class="notes-editor" data-notes-editor="${task.id}" placeholder="Add notes here...">${escapeHtml(currentValue)}</textarea>
    <div class="notes-edit-actions">
      <button class="btn-save-notes" data-action="save-notes" data-id="${task.id}">Save</button>
      <button class="btn-cancel-notes" data-action="cancel-notes" data-id="${task.id}">Cancel</button>
    </div>
  `;
}

// ── Card Listeners ─────────────────────────────────────────────

function attachCardListeners() {
  document.getElementById('task-list').addEventListener('click', handleCardClick);
}

function handleCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'complete') markComplete(id);
  else if (action === 'delete') openDeleteModal(id);
  else if (action === 'toggle-notes') toggleNotes(id);
  else if (action === 'edit-notes') showNotesEditor(id);
  else if (action === 'save-notes') saveNotes(id);
  else if (action === 'cancel-notes') cancelNotesEdit(id);
}

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
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('delete-modal').classList.add('hidden');
}

function confirmDelete() {
  if (!pendingDeleteId) return;
  tasks = tasks.filter(t => t.id !== pendingDeleteId);
  saveTasks();
  closeDeleteModal();
  renderTasks();
}

// ── Notes ──────────────────────────────────────────────────────

function toggleNotes(id) {
  const section = document.querySelector(`[data-notes-id="${id}"] .notes-content`);
  if (!section) return;
  section.classList.toggle('hidden');
  const btn = document.querySelector(`[data-action="toggle-notes"][data-id="${id}"]`);
  const task = tasks.find(t => t.id === id);
  const hasNotes = task && task.notes && task.notes.trim();
  btn.textContent = section.classList.contains('hidden')
    ? (hasNotes ? 'View notes' : 'Add notes')
    : 'Hide notes';
}

function showNotesEditor(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const content = document.querySelector(`[data-notes-id="${id}"] .notes-content`);
  content.innerHTML = buildNotesEditor(task, task.notes || '');
}

function saveNotes(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const editor = document.querySelector(`[data-notes-editor="${id}"]`);
  if (!editor) return;
  task.notes = editor.value.trim();
  saveTasks();
  // Re-render the notes section only
  const section = document.querySelector(`[data-notes-id="${id}"]`);
  if (section) {
    const temp = document.createElement('div');
    temp.innerHTML = buildNotesSection(task);
    const newSection = temp.firstElementChild;
    section.replaceWith(newSection);
    // Keep notes visible after saving
    const newContent = newSection.querySelector('.notes-content');
    if (newContent) newContent.classList.remove('hidden');
    const toggle = newSection.querySelector('[data-action="toggle-notes"]');
    if (toggle) toggle.textContent = 'Hide notes';
  }
}

function cancelNotesEdit(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const section = document.querySelector(`[data-notes-id="${id}"]`);
  if (!section) return;
  const temp = document.createElement('div');
  temp.innerHTML = buildNotesSection(task);
  const newSection = temp.firstElementChild;
  section.replaceWith(newSection);
  // Keep open
  const newContent = newSection.querySelector('.notes-content');
  if (newContent && task.notes) {
    newContent.classList.remove('hidden');
    const toggle = newSection.querySelector('[data-action="toggle-notes"]');
    if (toggle) toggle.textContent = 'Hide notes';
  }
}

// ── Form Submission ────────────────────────────────────────────

function handleAddTask(e) {
  e.preventDefault();
  const name = document.getElementById('task-name').value.trim();
  const interval = parseInt(document.getElementById('task-interval').value, 10);
  const intervalUnit = document.getElementById('task-interval-unit').value;
  const notes = document.getElementById('task-notes').value.trim();

  if (!name || interval < 1) return;

  const task = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    interval,
    intervalUnit,
    notes,
    lastCompleted: null,
  };

  tasks.push(task);
  saveTasks();
  renderTasks();

  e.target.reset();
  document.getElementById('task-interval').value = '1';
  document.getElementById('task-interval-unit').value = 'months';
}

// ── Filter Tabs ────────────────────────────────────────────────

function handleFilterClick(e) {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  activeFilter = tab.dataset.filter;
  renderTasks();
}

// ── Utility ────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ───────────────────────────────────────────────────────

function init() {
  loadTasks();
  renderTasks();

  document.getElementById('add-task-form').addEventListener('submit', handleAddTask);
  document.querySelector('.filter-tabs').addEventListener('click', handleFilterClick);
  document.getElementById('modal-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('modal-confirm').addEventListener('click', confirmDelete);
  document.getElementById('delete-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
  });
}

document.addEventListener('DOMContentLoaded', init);
