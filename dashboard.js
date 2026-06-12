import { supabase } from './supabase.js';

// ── DOM refs ──────────────────────────────────────────────
const cardList        = document.getElementById('card-list');
const loading         = document.getElementById('loading');
const errorBanner     = document.getElementById('error-banner');
const modalBackdrop   = document.getElementById('modal-backdrop');
const formNew         = document.getElementById('form-new');
const inputName       = document.getElementById('input-name');
const inputUrl        = document.getElementById('input-url');
const formError       = document.getElementById('form-error');
const btnCancel       = document.getElementById('btn-cancel');
const btnSubmit       = document.getElementById('btn-submit');
const btnNewProject   = document.getElementById('btn-new-project');
const btnHowto        = document.getElementById('btn-howto');
const howtoModal      = document.getElementById('howto-modal-backdrop');
const projectModal    = document.getElementById('project-modal-backdrop');
const formProject     = document.getElementById('form-project');
const projectInput    = document.getElementById('project-input-name');
const projectError    = document.getElementById('project-form-error');
const btnProjectCancel = document.getElementById('btn-project-cancel');
const btnProjectSubmit = document.getElementById('btn-project-submit');

// ── State ─────────────────────────────────────────────────
let projects        = [];
let prototypes      = [];
let commentCounts   = {};
let currentProjectId = null;
let expandedProjectIds = new Set();

// ── Helpers ───────────────────────────────────────────────
function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Prototype modal ───────────────────────────────────────
function openModal(projectId) {
  currentProjectId = projectId;
  formNew.reset();
  formError.classList.add('hidden');
  modalBackdrop.classList.remove('hidden');
  inputName.focus();
}

function closeModal() { modalBackdrop.classList.add('hidden'); }

btnCancel.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => { if (e.target === modalBackdrop) closeModal(); });

// ── How to use modal ──────────────────────────────────────
btnHowto.addEventListener('click', () => howtoModal.classList.remove('hidden'));
document.getElementById('btn-howto-close').addEventListener('click', () => howtoModal.classList.add('hidden'));
howtoModal.addEventListener('click', (e) => { if (e.target === howtoModal) howtoModal.classList.add('hidden'); });

// ── Project modal ─────────────────────────────────────────
function openProjectModal() {
  formProject.reset();
  projectError.classList.add('hidden');
  projectModal.classList.remove('hidden');
  projectInput.focus();
}

function closeProjectModal() { projectModal.classList.add('hidden'); }

btnNewProject.addEventListener('click', openProjectModal);
btnProjectCancel.addEventListener('click', closeProjectModal);
projectModal.addEventListener('click', (e) => { if (e.target === projectModal) closeProjectModal(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    closeProjectModal();
    howtoModal.classList.add('hidden');
  }
});

// ── 3-dot menu ────────────────────────────────────────────
let activeMenu = null;

function buildDotMenu(items) {
  const wrap = document.createElement('div');
  wrap.className = 'dot-menu-wrap';

  const btn = document.createElement('button');
  btn.className = 'dot-menu-btn';
  btn.setAttribute('aria-label', 'Options');
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
  </svg>`;

  const menu = document.createElement('div');
  menu.className = 'dot-menu';

  items.forEach(({ label, danger, action }) => {
    const item = document.createElement('button');
    item.className = 'dot-menu-item' + (danger ? ' danger' : '');
    item.textContent = label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      closeActiveMenu();
      action();
    });
    menu.appendChild(item);
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeMenu === menu) { closeActiveMenu(); return; }
    closeActiveMenu();
    wrap.appendChild(menu);
    activeMenu = menu;
  });

  wrap.appendChild(btn);
  return wrap;
}

function closeActiveMenu() {
  activeMenu?.remove();
  activeMenu = null;
}

document.addEventListener('click', closeActiveMenu);

// ── Inline rename helper ──────────────────────────────────
function inlineRename(spanEl, onSave) {
  const original = spanEl.textContent;
  const input = document.createElement('input');
  input.className = 'inline-rename-input';
  input.value = original;
  spanEl.replaceWith(input);
  input.focus();
  input.select();

  async function save() {
    const newName = input.value.trim();
    if (!newName || newName === original) { input.replaceWith(spanEl); return; }
    const ok = await onSave(newName);
    if (ok) spanEl.textContent = newName;
    input.replaceWith(spanEl);
  }

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = original; input.blur(); }
  });
}

// ── Prototype card ────────────────────────────────────────
function buildCard(proto) {
  const count = commentCounts[proto.id] || 0;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = proto.id;

  const body = document.createElement('div');
  body.className = 'card-body';

  const nameEl = document.createElement('span');
  nameEl.className = 'card-name';
  nameEl.textContent = proto.name;
  body.appendChild(nameEl);

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  const link = document.createElement('a');
  link.href = proto.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = proto.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  meta.appendChild(link);
  // date intentionally omitted
  body.appendChild(meta);

  card.appendChild(body);

  const badge = document.createElement('span');
  badge.className = 'comment-count';
  badge.textContent = count === 1 ? '1 comment' : `${count} comments`;
  card.appendChild(badge);

  const cardRight = document.createElement('div');
  cardRight.className = 'card-right';

  const btnOpen = document.createElement('a');
  btnOpen.className = 'btn btn-primary';
  btnOpen.href = `viewer.html?id=${proto.id}`;
  btnOpen.textContent = 'Open';
  cardRight.appendChild(btnOpen);

  const dotMenu = buildDotMenu([
    {
      label: 'Rename',
      action: () => inlineRename(nameEl, async (newName) => {
        const { error } = await supabase.from('prototypes').update({ name: newName }).eq('id', proto.id);
        if (error) { showError('Could not rename: ' + error.message); return false; }
        proto.name = newName;
        return true;
      }),
    },
    {
      label: 'Move to…',
      action: () => openMoveModal(proto),
    },
    {
      label: 'Remove', danger: true,
      action: async () => {
        if (!confirm('Remove this prototype and all its comments?')) return;
        const { error } = await supabase.from('prototypes').delete().eq('id', proto.id);
        if (error) { showError('Could not remove: ' + error.message); return; }
        prototypes = prototypes.filter(p => p.id !== proto.id);
        render();
      },
    },
  ]);
  cardRight.appendChild(dotMenu);
  card.appendChild(cardRight);

  return card;
}

// ── Move prototype ────────────────────────────────────────
async function movePrototype(proto, targetProjectId) {
  const { error } = await supabase
    .from('prototypes').update({ project_id: targetProjectId }).eq('id', proto.id);
  if (error) { showError('Could not move: ' + error.message); return; }
  proto.project_id = targetProjectId;
  render();
}

function openMoveModal(proto) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const title = document.createElement('h2');
  title.textContent = 'Move to project';
  modal.appendChild(title);

  const list = document.createElement('div');
  list.className = 'move-project-list';

  projects.forEach(p => {
    const isCurrent = proto.project_id === p.id;
    const btn = document.createElement('button');
    btn.className = 'move-project-item' + (isCurrent ? ' current' : '');
    btn.textContent = p.name;
    btn.disabled = isCurrent;
    btn.addEventListener('click', () => {
      document.body.removeChild(backdrop);
      movePrototype(proto, p.id);
    });
    list.appendChild(btn);
  });

  modal.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => document.body.removeChild(backdrop));
  actions.appendChild(cancelBtn);
  modal.appendChild(actions);

  backdrop.appendChild(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) document.body.removeChild(backdrop); });

  const onKey = (e) => { if (e.key === 'Escape') { document.body.removeChild(backdrop); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(backdrop);
}

// ── Project section ───────────────────────────────────────
function buildProjectSection(project, protos) {
  const section = document.createElement('div');
  const isExpanded = expandedProjectIds.has(project.id);
  section.className = 'project-section' + (isExpanded ? '' : ' collapsed');
  section.dataset.id = project.id;

  const header = document.createElement('div');
  header.className = 'project-header';

  const toggle = document.createElement('button');
  toggle.className = 'project-toggle';
  toggle.setAttribute('aria-expanded', String(isExpanded));

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'project-toggle-icon';
  toggleIcon.textContent = isExpanded ? '−' : '+';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'project-toggle-name';
  nameSpan.textContent = project.name;

  toggle.appendChild(toggleIcon);
  toggle.appendChild(nameSpan);
  header.addEventListener('click', () => {
    const collapsed = section.classList.toggle('collapsed');
    toggleIcon.textContent = collapsed ? '+' : '−';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    if (collapsed) expandedProjectIds.delete(project.id);
    else expandedProjectIds.add(project.id);
  });

  header.appendChild(toggle);

  const dotMenu = buildDotMenu([
    {
      label: 'Rename',
      action: () => inlineRename(nameSpan, async (newName) => {
        const { error } = await supabase.from('projects').update({ name: newName }).eq('id', project.id);
        if (error) { showError('Could not rename: ' + error.message); return false; }
        project.name = newName;
        return true;
      }),
    },
    {
      label: 'Delete', danger: true,
      action: async () => {
        if (!confirm(`Delete project "${project.name}"? Prototypes will be ungrouped.`)) return;
        const { error } = await supabase.from('projects').delete().eq('id', project.id);
        if (error) { showError('Could not delete project: ' + error.message); return; }
        projects = projects.filter(p => p.id !== project.id);
        prototypes = prototypes.map(p =>
          p.project_id === project.id ? { ...p, project_id: null } : p
        );
        render();
      },
    },
  ]);
  if (protos.length === 0) {
    const emptyLabel = document.createElement('span');
    emptyLabel.className = 'project-empty-inline';
    emptyLabel.textContent = 'Empty';
    header.appendChild(emptyLabel);
  }

  header.appendChild(dotMenu);

  section.appendChild(header);

  const cards = document.createElement('div');
  cards.className = 'project-cards';
  protos.forEach(p => cards.appendChild(buildCard(p)));

  const addBtn = document.createElement('button');
  addBtn.className = 'project-add-proto-btn';
  addBtn.textContent = '+ Add prototype';
  addBtn.addEventListener('click', () => openModal(project.id));
  cards.appendChild(addBtn);

  section.appendChild(cards);

  return section;
}

// ── Render ────────────────────────────────────────────────
function render() {
  [...cardList.children].forEach(el => {
    if (el.id !== 'loading') el.remove();
  });

  const grouped = {};
  const ungrouped = [];

  prototypes.forEach(p => {
    if (p.project_id) (grouped[p.project_id] = grouped[p.project_id] || []).push(p);
    else ungrouped.push(p);
  });

  projects.forEach(project => {
    cardList.appendChild(buildProjectSection(project, grouped[project.id] || []));
  });

  if (ungrouped.length > 0) {
    if (projects.length > 0) {
      const divider = document.createElement('p');
      divider.className = 'ungrouped-label';
      divider.textContent = 'Ungrouped';
      cardList.appendChild(divider);
    }
    ungrouped.forEach(p => cardList.appendChild(buildCard(p)));
  }

  if (!prototypes.length && !projects.length) {
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.textContent = 'No prototypes yet. Add your first one.';
    cardList.appendChild(el);
  }
}

// ── Load all ──────────────────────────────────────────────
async function loadAll() {
  loading.classList.remove('hidden');

  const [projRes, protoRes, commentRes] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: true }),
    supabase.from('prototypes').select('*').order('created_at', { ascending: false }),
    supabase.from('comments').select('prototype_id'),
  ]);

  loading.classList.add('hidden');

  if (projRes.error) showError('Could not load projects: ' + projRes.error.message);
  if (protoRes.error) { showError('Could not load prototypes: ' + protoRes.error.message); return; }

  projects   = projRes.data || [];
  prototypes = protoRes.data || [];

  commentCounts = {};
  (commentRes.data || []).forEach(r => {
    commentCounts[r.prototype_id] = (commentCounts[r.prototype_id] || 0) + 1;
  });

  render();
}

// ── Add new prototype ─────────────────────────────────────
formNew.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.classList.add('hidden');

  const name      = inputName.value.trim();
  const url       = inputUrl.value.trim();
  const projectId = currentProjectId;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    formError.textContent = 'URL must start with http:// or https://';
    formError.classList.remove('hidden');
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Adding…';

  const { data, error } = await supabase
    .from('prototypes')
    .insert({ name, url, project_id: projectId })
    .select()
    .single();

  btnSubmit.disabled = false;
  btnSubmit.textContent = 'Add prototype';

  if (error) {
    formError.textContent = 'Could not add: ' + error.message;
    formError.classList.remove('hidden');
    return;
  }

  prototypes.unshift(data);
  if (projectId) expandedProjectIds.add(projectId);
  closeModal();
  render();
});

// ── Add new project ───────────────────────────────────────
formProject.addEventListener('submit', async (e) => {
  e.preventDefault();
  projectError.classList.add('hidden');

  const name = projectInput.value.trim();
  if (!name) return;

  btnProjectSubmit.disabled = true;

  const { data, error } = await supabase.from('projects').insert({ name }).select().single();

  btnProjectSubmit.disabled = false;

  if (error) {
    projectError.textContent = 'Could not create: ' + error.message;
    projectError.classList.remove('hidden');
    return;
  }

  projects.push(data);
  closeProjectModal();
  render();
});

loadAll();
