import { supabase } from './supabase.js';

const frame = document.getElementById('prototype-frame');
const overlay = document.getElementById('comment-overlay');
const toolbarTitle = document.getElementById('toolbar-title');
const btnComment = document.getElementById('btn-comment');
const errorBanner = document.getElementById('error-banner');

const params = new URLSearchParams(location.search);
const prototypeId = params.get('id');

let commentMode = false;
let currentPath = '/';
let comments = [];
let openCardId = null; // null = none open, 'new' = temp pin open

if (!prototypeId) {
  showError('No prototype ID in URL. Go back and open a prototype from the dashboard.');
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.remove('hidden');
}

// ── Comment mode toggle ───────────────────────────────────
btnComment.addEventListener('click', () => {
  commentMode = !commentMode;
  btnComment.setAttribute('aria-pressed', String(commentMode));
  overlay.classList.toggle('active', commentMode);
  // Disable iframe pointer events so the overlay can capture clicks
  frame.style.pointerEvents = commentMode ? 'none' : '';
  if (!commentMode) closeOpenCard();
});

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
    const pin = buildPin(i + 1, c.x_pct, c.y_pct, c.id);
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

function buildPin(label, xPct, yPct, id) {
  const pin = document.createElement('div');
  pin.className = 'pin';
  pin.textContent = label;
  pin.dataset.id = id;
  pin.style.left = xPct + '%';
  pin.style.top = yPct + '%';

  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openCardId === id) {
      closeOpenCard();
    } else {
      closeOpenCard();
      openCardId = id;
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
function placeCard(cardEl, pin, xPct, yPct) {
  const ow = overlay.offsetWidth;
  const oh = overlay.offsetHeight;
  const cw = 260; // card width
  const ch = 160; // estimated card height
  const pinPx = 12; // half pin size

  const pinX = (xPct / 100) * ow;
  const pinY = (yPct / 100) * oh;

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

  const ts = new Date(comment.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  card.innerHTML = `
    <div class="card-header-row">
      <span class="card-author">${escHtml(comment.author)}</span>
      <button class="card-close" aria-label="Close">×</button>
    </div>
    <p class="card-message">${escHtml(comment.message)}</p>
    <div class="card-footer">
      <span>${escHtml(comment.page_path)}</span>
      <span>${ts}</span>
    </div>
    <div class="card-footer" style="margin-top:8px">
      <button class="card-delete">Delete</button>
    </div>
  `;

  placeCard(card, pinEl, comment.x_pct, comment.y_pct);

  card.querySelector('.card-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeOpenCard();
  });

  card.querySelector('.card-delete').addEventListener('click', async (e) => {
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

function buildNewCard(xPct, yPct, tempPin) {
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

  placeCard(card, tempPin, xPct, yPct);

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
      y_pct: yPct,
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
  if (!commentMode) return;
  if (e.target !== overlay) return; // ignore clicks on pins/cards

  e.stopPropagation();
  closeOpenCard();
  removeTempPin();

  const rect = overlay.getBoundingClientRect();
  const xPct = ((e.clientX - rect.left) / rect.width) * 100;
  const yPct = ((e.clientY - rect.top) / rect.height) * 100;

  const tempPin = document.createElement('div');
  tempPin.className = 'pin active';
  tempPin.textContent = comments.length + 1;
  tempPin.dataset.temp = '1';
  tempPin.style.left = xPct + '%';
  tempPin.style.top = yPct + '%';
  tempPin.addEventListener('click', (ev) => ev.stopPropagation());

  const card = buildNewCard(xPct, yPct, tempPin);
  overlay.appendChild(tempPin);
  overlay.appendChild(card);
  openCardId = 'new';

  // Focus name or message
  const authorInput = card.querySelector('#nc-author');
  authorInput.value ? card.querySelector('#nc-message').focus() : authorInput.focus();
});

// ── Close helpers ─────────────────────────────────────────
function closeOpenCard() {
  openCardId = null;
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

// ── Resize → re-render (positions are % so this is mostly cosmetic) ──
window.addEventListener('resize', renderPins);

// ── iframe load → path tracking (full-page navigations) ──
frame.addEventListener('load', async () => {
  let newPath = '/';
  try {
    // Works when the prototype is same-origin
    newPath = frame.contentWindow.location.pathname + frame.contentWindow.location.hash;
  } catch {
    // Cross-origin: can't read URL — postMessage snippet required for SPAs
    return;
  }
  if (newPath !== currentPath) {
    currentPath = newPath;
    updatePathDisplay();
    closeOpenCard();
    await loadComments();
  }
});

// ── postMessage for per-page tracking (cross-origin SPAs) ─
window.addEventListener('message', async (e) => {
  if (e.data?.type === 'routeChange' && e.data.path) {
    currentPath = e.data.path;
    updatePathDisplay();
    closeOpenCard();
    await loadComments();
  }
});

function updatePathDisplay() {
  const el = document.getElementById('toolbar-path');
  if (el) el.textContent = currentPath;
}

// ── Escape closes card ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (openCardId) { closeOpenCard(); return; }
    if (commentMode) {
      commentMode = false;
      btnComment.setAttribute('aria-pressed', 'false');
      overlay.classList.remove('active');
    }
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
