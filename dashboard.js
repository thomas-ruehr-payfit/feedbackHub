import { supabase } from './supabase.js';

const cardList = document.getElementById('card-list');
const loading = document.getElementById('loading');
const errorBanner = document.getElementById('error-banner');
const modalBackdrop = document.getElementById('modal-backdrop');
const formNew = document.getElementById('form-new');
const inputName = document.getElementById('input-name');
const inputUrl = document.getElementById('input-url');
const formError = document.getElementById('form-error');
const btnNew = document.getElementById('btn-new');
const btnCancel = document.getElementById('btn-cancel');
const btnSubmit = document.getElementById('btn-submit');

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function openModal() {
  formNew.reset();
  formError.classList.add('hidden');
  modalBackdrop.classList.remove('hidden');
  inputName.focus();
}

function closeModal() {
  modalBackdrop.classList.add('hidden');
}

btnNew.addEventListener('click', openModal);
btnCancel.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ── Inline name editing ───────────────────────────────────
function enableInlineEdit(nameEl, id) {
  const original = nameEl.textContent.trim();
  const input = document.createElement('input');
  input.className = 'card-name-input';
  input.value = original;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  async function save() {
    const newName = input.value.trim();
    if (!newName || newName === original) {
      input.replaceWith(buildNameEl(original, id));
      return;
    }
    const { error } = await supabase
      .from('prototypes')
      .update({ name: newName })
      .eq('id', id);
    if (error) {
      input.replaceWith(buildNameEl(original, id));
      showError('Could not save name: ' + error.message);
    } else {
      input.replaceWith(buildNameEl(newName, id));
    }
  }

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = original; input.blur(); }
  });
}

function buildNameEl(name, id) {
  const el = document.createElement('span');
  el.className = 'card-name';
  el.textContent = name;
  el.title = 'Click to rename';
  el.addEventListener('click', () => enableInlineEdit(el, id));
  return el;
}

// ── Render a card ─────────────────────────────────────────
function buildCard(proto) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = proto.id;

  const body = document.createElement('div');
  body.className = 'card-body';

  body.appendChild(buildNameEl(proto.name, proto.id));

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  const link = document.createElement('a');
  link.href = proto.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = proto.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  meta.appendChild(link);
  meta.append(' · Added ' + formatDate(proto.created_at));
  body.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const btnOpen = document.createElement('a');
  btnOpen.className = 'btn btn-primary';
  btnOpen.href = `viewer.html?id=${proto.id}`;
  btnOpen.textContent = 'Open';
  actions.appendChild(btnOpen);

  const btnDelete = document.createElement('button');
  btnDelete.className = 'btn btn-ghost';
  btnDelete.textContent = 'Delete';
  btnDelete.addEventListener('click', () => deletePrototype(proto.id, card));
  actions.appendChild(btnDelete);

  card.appendChild(body);
  card.appendChild(actions);
  return card;
}

async function deletePrototype(id, cardEl) {
  if (!confirm('Delete this prototype and all its comments?')) return;
  const { error } = await supabase.from('prototypes').delete().eq('id', id);
  if (error) {
    showError('Could not delete: ' + error.message);
    return;
  }
  cardEl.remove();
  if (cardList.querySelectorAll('.card').length === 0) renderEmpty();
}

function renderEmpty() {
  if (cardList.querySelector('.empty-state')) return;
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.textContent = 'No prototypes yet. Add your first one.';
  cardList.appendChild(el);
}

// ── Load all prototypes ───────────────────────────────────
async function loadPrototypes() {
  loading.classList.remove('hidden');
  const { data, error } = await supabase
    .from('prototypes')
    .select('*')
    .order('created_at', { ascending: false });

  loading.classList.add('hidden');

  if (error) {
    showError('Could not load prototypes: ' + error.message);
    return;
  }

  if (!data.length) {
    renderEmpty();
    return;
  }

  data.forEach((proto) => cardList.appendChild(buildCard(proto)));
}

// ── Add new prototype ─────────────────────────────────────
formNew.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.classList.add('hidden');

  const name = inputName.value.trim();
  const url = inputUrl.value.trim();

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    formError.textContent = 'URL must start with http:// or https://';
    formError.classList.remove('hidden');
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Adding…';

  const { data, error } = await supabase
    .from('prototypes')
    .insert({ name, url })
    .select()
    .single();

  btnSubmit.disabled = false;
  btnSubmit.textContent = 'Add prototype';

  if (error) {
    formError.textContent = 'Could not add prototype: ' + error.message;
    formError.classList.remove('hidden');
    return;
  }

  cardList.querySelector('.empty-state')?.remove();
  const card = buildCard(data);
  cardList.insertBefore(card, cardList.firstChild);
  closeModal();
});

loadPrototypes();
