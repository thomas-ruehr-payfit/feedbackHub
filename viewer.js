import { supabase } from './supabase.js';

const frame = document.getElementById('prototype-frame');
const overlay = document.getElementById('comment-overlay');
const toolbarTitle = document.getElementById('toolbar-title');
const btnComment = document.getElementById('btn-comment');
const errorBanner = document.getElementById('error-banner');

const btnCopyLink = document.getElementById('btn-copy-link');
const copyTooltip = document.getElementById('copy-tooltip');

btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(location.href);
  copyTooltip.classList.add('visible');
  setTimeout(() => copyTooltip.classList.remove('visible'), 1500);
});

const params = new URLSearchParams(location.search);
const prototypeId = params.get('id');

let commentMode = false;
let prototypeName = '';
let currentPath = '/';
let comments = [];
let openCardId = null; // null = none open, 'new' = temp pin open
let scale = 1;

if (!prototypeId) {
  showError('No prototype ID in URL. Go back and open a prototype from the dashboard.');
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove('hidden');
}

// ── Comment mode toggle ───────────────────────────────────
function setCommentMode(on) {
  commentMode = on;
  btnComment.setAttribute('aria-pressed', String(on));
  overlay.classList.toggle('active', on);
  document.getElementById('toolbar').classList.toggle('comment-active', on);
  document.getElementById('frame-wrap').classList.toggle('comment-active', on);
  document.body.classList.toggle('comment-active', on);
  toolbarTitle.innerHTML = on
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style="margin-right:5px;vertical-align:-1px" aria-hidden="true"><path d="M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z"/></svg>Page locked`
    : prototypeName;
  if (!on) closeOpenCard();
}

btnComment.addEventListener('click', () => setCommentMode(!commentMode));

// ── Load prototype metadata ───────────────────────────────
async function loadPrototype() {
  const { data, error } = await supabase
    .from('prototypes')
    .select('name, url')
    .eq('id', prototypeId)
    .single();

  if (error || !data) {
    showError('Prototype not found. It may have been deleted.');
    toolbarTitle.textContent = 'Not found';
    return;
  }

  document.title = data.name + ' — Viewer';
  prototypeName = data.name;
  toolbarTitle.textContent = data.name;
  frame.src = data.url;
}

// ── Load & render comments ────────────────────────────────
async function loadComments() {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('prototype_id', prototypeId)
    .eq('page_path', currentPath)
    .order('created_at', { ascending: true });

  if (error) {
    showError('Could not load comments: ' + error.message);
    return;
  }
  comments = data || [];
  renderPins();
}

function renderPins() {
  // Keep any temp pin that may be open
  const tempPin = overlay.querySelector('.pin[data-temp]');
  const tempCard = overlay.querySelector('.comment-card[data-temp]');

  // Remove all real pins and cards
  overlay.querySelectorAll('.pin:not([data-temp]), .comment-card:not([data-temp])').forEach(el => el.remove());

  comments.forEach((c, i) => {
    const pin = buildPin(i + 1, c.x_pct, c.y_px, c.id);
    overlay.appendChild(pin);
    if (openCardId === c.id) {
      overlay.appendChild(buildExistingCard(c, pin));
      pin.classList.add('active');
    }
  });

  // Re-append temp pin/card so they stay on top
  if (tempPin) overlay.appendChild(tempPin);
  if (tempCard) overlay.appendChild(tempCard);
}

function buildPin(label, xPct, yPx, id) {
  const pin = document.createElement('div');
  pin.className = 'pin';
  pin.textContent = label;
  pin.dataset.id = id;
  pin.style.left = xPct + '%';
  pin.style.top = (yPx * scale) + 'px';

  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openCardId === id) {
      closeOpenCard();
    } else {
      closeOpenCard();
      openCardId = id;
      overlay.classList.add('card-open');
      const comment = comments.find(c => c.id === id);
      if (comment) {
        overlay.querySelector(`.pin[data-id="${id}"]`)?.classList.add('active');
        overlay.appendChild(buildExistingCard(comment, pin));
      }
    }
  });

  return pin;
}

// ── Smart card placement ──────────────────────────────────
function placeCard(cardEl, pin, xPct, yPx) {
  const ow = overlay.offsetWidth;
  const oh = overlay.offsetHeight;
  const cw = 260; // card width
  const ch = 160; // estimated card height
  const pinPx = 12; // half pin size

  const pinX = (xPct / 100) * ow;
  const pinY = yPx * scale;

  // Prefer right of pin; flip left if not enough space
  let left = pinX + pinPx + 8;
  if (left + cw > ow - 8) left = pinX - pinPx - cw - 8;
  left = Math.max(8, left);

  // Prefer below pin; flip up if not enough space
  let top = pinY - pinPx;
  if (top + ch > oh - 8) top = pinY - ch + pinPx;
  top = Math.max(8, top);

  cardEl.style.left = left + 'px';
  cardEl.style.top = top + 'px';
}

function buildExistingCard(comment, pinEl) {
  const card = document.createElement('div');
  card.className = 'comment-card';
  card.dataset.id = comment.id;

  card.innerHTML = `
    <div class="card-header-row">
      <span class="card-author">${escHtml(comment.author)}</span>
      <button class="card-delete-icon" aria-label="Delete comment">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>
    <p class="card-message">${escHtml(comment.message)}</p>
  `;

  placeCard(card, pinEl, comment.x_pct, comment.y_px);

  card.querySelector('.card-delete-icon').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Delete this comment?')) return;
    const { error } = await supabase.from('comments').delete().eq('id', comment.id);
    if (error) { showError('Could not delete: ' + error.message); return; }
    comments = comments.filter(c => c.id !== comment.id);
    closeOpenCard();
    renderPins();
  });

  card.addEventListener('click', (e) => e.stopPropagation());

  return card;
}

function buildNewCard(xPct, yPx, tempPin) {
  const card = document.createElement('div');
  card.className = 'comment-card';
  card.dataset.temp = '1';

  card.innerHTML = `
    <div class="new-comment-form">
      <input type="text" placeholder="Your name" maxlength="60" autocomplete="off" id="nc-author" />
      <textarea placeholder="Leave a comment…" maxlength="1000" id="nc-message"></textarea>
      <div class="new-comment-actions">
        <button class="btn btn-ghost" id="nc-cancel">Cancel</button>
        <button class="btn btn-primary" id="nc-post">Post</button>
      </div>
    </div>
  `;

  placeCard(card, tempPin, xPct, yPx);

  const authorInput = card.querySelector('#nc-author');
  // Restore last-used name
  authorInput.value = localStorage.getItem('fh-author') || '';

  card.querySelector('#nc-cancel').addEventListener('click', (e) => {
    e.stopPropagation();
    removeTempPin();
  });

  card.querySelector('#nc-post').addEventListener('click', async (e) => {
    e.stopPropagation();
    const author = authorInput.value.trim();
    const message = card.querySelector('#nc-message').value.trim();
    if (!author) { authorInput.focus(); return; }
    if (!message) { card.querySelector('#nc-message').focus(); return; }

    localStorage.setItem('fh-author', author);

    const btn = card.querySelector('#nc-post');
    btn.disabled = true;
    btn.textContent = 'Posting…';

    const { error } = await supabase.from('comments').insert({
      prototype_id: prototypeId,
      page_path: currentPath,
      x_pct: xPct,
      y_px: yPx,
      author,
      message,
    });

    if (error) {
      showError('Could not post comment: ' + error.message);
      btn.disabled = false;
      btn.textContent = 'Post';
      return;
    }

    removeTempPin();
    await loadComments();
  });

  card.addEventListener('click', (e) => e.stopPropagation());
  return card;
}

// ── Overlay click → new comment ───────────────────────────
overlay.addEventListener('click', (e) => {
  // Close open card when clicking outside it (works even inside the iframe area)
  if (openCardId && e.target === overlay) {
    closeOpenCard();
    return;
  }

  if (!commentMode) return;
  if (e.target !== overlay) return;

  e.stopPropagation();
  closeOpenCard();
  removeTempPin();

  const rect = overlay.getBoundingClientRect();
  const xPct = ((e.clientX - rect.left) / rect.width) * 100;
  const yPx = (e.clientY - rect.top) / scale;

  const tempPin = document.createElement('div');
  tempPin.className = 'pin active';
  tempPin.textContent = comments.length + 1;
  tempPin.dataset.temp = '1';
  tempPin.style.left = xPct + '%';
  tempPin.style.top = (yPx * scale) + 'px';
  tempPin.addEventListener('click', (ev) => ev.stopPropagation());

  const card = buildNewCard(xPct, yPx, tempPin);
  overlay.appendChild(tempPin);
  overlay.appendChild(card);
  openCardId = 'new';
  overlay.classList.add('card-open');

  // Focus name or message
  const authorInput = card.querySelector('#nc-author');
  authorInput.value ? card.querySelector('#nc-message').focus() : authorInput.focus();
});

// ── Close helpers ─────────────────────────────────────────
function closeOpenCard() {
  openCardId = null;
  overlay.classList.remove('card-open');
  overlay.querySelectorAll('.comment-card:not([data-temp])').forEach(el => el.remove());
  overlay.querySelectorAll('.pin.active').forEach(el => el.classList.remove('active'));
  removeTempPin();
}

function removeTempPin() {
  overlay.querySelector('.pin[data-temp]')?.remove();
  overlay.querySelector('.comment-card[data-temp]')?.remove();
  if (openCardId === 'new') openCardId = null;
}

// Close card when clicking outside
document.addEventListener('click', (e) => {
  if (openCardId && !e.target.closest('.pin') && !e.target.closest('.comment-card')) {
    closeOpenCard();
  }
});

// ── Fixed-width iframe scaling ────────────────────────────
const DESIGN_WIDTH = 1440;
const frameWrap = document.getElementById('frame-wrap');

function updateIframeScale() {
  scale = frameWrap.offsetWidth / DESIGN_WIDTH;
  frame.style.transform = `scale(${scale})`;
  frame.style.height = Math.round(frameWrap.offsetHeight / scale) + 'px';
}

window.addEventListener('resize', () => { updateIframeScale(); renderPins(); });
updateIframeScale();

// ── Tracker detection ─────────────────────────────────────
let trackerDetected = false;
const trackerWarning = document.getElementById('tracker-warning');

frame.addEventListener('load', () => {
  // Same-origin: path tracking works via load events, no tracker needed
  try {
    frame.contentWindow.location.href;
    trackerDetected = true;
    return;
  } catch { /* cross-origin */ }

  // Cross-origin: wait briefly for tracker's initial routeChange message
  setTimeout(() => {
    if (!trackerDetected) trackerWarning.classList.remove('hidden');
  }, 2000);
});

// ── iframe load → path tracking (full-page navigations) ──
frame.addEventListener('load', async () => {
  let newPath = '/';
  try {
    newPath = frame.contentWindow.location.pathname + frame.contentWindow.location.hash;
  } catch {
    return;
  }
  if (newPath !== currentPath) {
    currentPath = newPath;
    closeOpenCard();
    await loadComments();
  }
});

// ── postMessage for per-page tracking (cross-origin SPAs) ─
window.addEventListener('message', async (e) => {
  if (e.data?.type === 'routeChange' && e.data.path) {
    trackerDetected = true;
    trackerWarning.classList.add('hidden');
    currentPath = e.data.path;
    closeOpenCard();
    await loadComments();
  }
});

// ── Escape closes card ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  const inField = e.target.matches('input, textarea, [contenteditable]');
  if (e.key === 'c' && !inField && !e.metaKey && !e.ctrlKey) {
    setCommentMode(!commentMode);
    return;
  }
  if (e.key === 'Escape') {
    if (openCardId) { closeOpenCard(); return; }
    if (commentMode) setCommentMode(false);
  }
});

// ── Escape HTML ───────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────
if (prototypeId) {
  loadPrototype();
  loadComments();
}
