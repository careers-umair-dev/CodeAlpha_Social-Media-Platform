/**
 * api.js — foundation shared by every page: config, session storage, API client,
 * formatting helpers, theme and toast notifications. No dependencies.
 */
'use strict';

/* ------------------------------ Configuration ----------------------------- */
// The backend serves this frontend, so '/api' just works. If you host the frontend
// somewhere else, add <meta name="api-base" content="https://your-api.example.com/api"> to each page.
const API_BASE = (() => {
  const meta = document.querySelector('meta[name="api-base"]');
  if (meta && meta.content) return meta.content.replace(/\/$/, '');
  const { hostname, port, protocol } = location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (protocol === 'file:') return 'http://localhost:5000/api';
  if (local && port && port !== '5000') return `http://${hostname}:5000/api`; // e.g. separate static dev server
  return '/api';
})();
const API_ORIGIN = API_BASE.replace(/\/api$/, '');

/* --------------------------------- Session -------------------------------- */
const Store = {
  TOKEN: 'msm_token',
  USER: 'msm_user',
  get token() { try { return localStorage.getItem(this.TOKEN); } catch (_) { return null; } },
  get user() { try { return JSON.parse(localStorage.getItem(this.USER) || 'null'); } catch (_) { return null; } },
  setSession(token, user) {
    localStorage.setItem(this.TOKEN, token);
    localStorage.setItem(this.USER, JSON.stringify(user));
  },
  setUser(user) { localStorage.setItem(this.USER, JSON.stringify(user)); },
  clear() { localStorage.removeItem(this.TOKEN); localStorage.removeItem(this.USER); },
  flash(message, type = 'info') { try { sessionStorage.setItem('msm_flash', JSON.stringify({ message, type })); } catch (_) {} },
  takeFlash() {
    try { const f = JSON.parse(sessionStorage.getItem('msm_flash') || 'null'); sessionStorage.removeItem('msm_flash'); return f; } catch (_) { return null; }
  },
};

/** Only same-site relative paths are allowed as post-login redirects (prevents open redirects). */
function safeNext(value) {
  return typeof value === 'string' && /^[a-z0-9_-]+\.html(\?[\w%=&.-]*)?$/i.test(value) ? value : 'index.html';
}
function goToLogin(message) {
  if (message) Store.flash(message);
  const here = location.pathname.split('/').pop() + location.search;
  const next = /^(login|register)\.html/.test(here) ? '' : `?next=${encodeURIComponent(here)}`;
  location.replace(`login.html${next}`);
}

/* -------------------------------- API client ------------------------------ */
class ApiError extends Error {
  constructor(message, status, fields) { super(message); this.status = status; this.fields = fields || {}; }
}

async function api(path, { method = 'GET', body, signal, silent401 = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = Store.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  if (signal) signal.addEventListener('abort', () => ctrl.abort());

  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal });
  } catch (err) {
    if (signal && signal.aborted) throw err; // caller cancelled on purpose
    throw new ApiError(ctrl.signal.aborted ? 'The request timed out. Check your connection and try again.' : "Can't reach the server. Check your connection and try again.", 0);
  } finally { clearTimeout(timer); }

  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body */ }

  if (!res.ok) {
    if (res.status === 401 && token && !silent401) { // session revoked or expired
      Store.clear();
      goToLogin('Your session has ended. Please log in again.');
    }
    throw new ApiError((data && data.message) || `Something went wrong (${res.status})`, res.status, data && data.errors);
  }
  return data;
}

/* ----------------------------- Endpoint helpers ---------------------------- */
const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => v !== undefined && v !== '' && p.set(k, v)); const s = p.toString(); return s ? `?${s}` : ''; };
const enc = encodeURIComponent;
const Api = {
  register: (b) => api('/auth/register', { method: 'POST', body: b, silent401: true }),
  login: (b) => api('/auth/login', { method: 'POST', body: b, silent401: true }),
  me: () => api('/auth/me'),
  logout: () => api('/auth/logout', { method: 'POST', silent401: true }),
  logoutAll: () => api('/auth/logout-all', { method: 'POST' }),
  changePassword: (b) => api('/auth/password', { method: 'PUT', body: b }),
  deleteAccount: (password) => api('/users/me', { method: 'DELETE', body: { password } }),

  feed: (feed, page) => api(`/posts${qs({ feed, page })}`),
  saved: (page) => api(`/posts/saved${qs({ page })}`),
  trending: () => api('/posts/trending'),
  post: (id) => api(`/posts/${id}`),
  createPost: (b) => api('/posts', { method: 'POST', body: b }),
  updatePost: (id, b) => api(`/posts/${id}`, { method: 'PUT', body: b }),
  deletePost: (id) => api(`/posts/${id}`, { method: 'DELETE' }),
  like: (id, on) => api(`/posts/${id}/like`, { method: on ? 'POST' : 'DELETE' }),
  save: (id, on) => api(`/posts/${id}/save`, { method: on ? 'POST' : 'DELETE' }),
  comments: (id, page) => api(`/posts/${id}/comments${qs({ page })}`),
  addComment: (id, text) => api(`/posts/${id}/comments`, { method: 'POST', body: { text } }),
  editComment: (id, text) => api(`/comments/${id}`, { method: 'PUT', body: { text } }),
  deleteComment: (id) => api(`/comments/${id}`, { method: 'DELETE' }),
  upload: (dataUrl) => api('/media', { method: 'POST', body: { dataUrl } }),

  profile: (u) => api(`/users/${enc(u)}`),
  userPosts: (u, page, media) => api(`/users/${enc(u)}/posts${qs({ page, media: media ? 'true' : '' })}`),
  followers: (u, page) => api(`/users/${enc(u)}/followers${qs({ page })}`),
  following: (u, page) => api(`/users/${enc(u)}/following${qs({ page })}`),
  follow: (u, on) => api(`/users/${enc(u)}/follow`, { method: on ? 'POST' : 'DELETE' }),
  updateProfile: (b) => api('/users/profile', { method: 'PUT', body: b }),
  suggestions: () => api('/users/suggestions'),
  search: (q, type, page, signal) => api(`/search${qs({ q, type, page })}`, { signal }),

  notifications: (page, unread) => api(`/notifications${qs({ page, unread: unread ? 'true' : '' })}`),
  unreadCount: () => api('/notifications/unread-count'),
  markRead: (id) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => api('/notifications/read-all', { method: 'POST' }),
  clearNotifications: () => api('/notifications', { method: 'DELETE' }),
};

/* --------------------------------- Helpers -------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
/** Builds an element from an HTML string (trusted templates only — always esc() user data). */
function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}
const debounce = (fn, ms = 250) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

function timeAgo(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
const fullDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const formatCount = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n || 0));
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
function hueFor(str = '') { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }

/** Resolves an image reference to a safe URL (our uploads or http/https only). */
function mediaUrl(src) {
  if (!src) return '';
  if (/^\/api\/media\/[a-f0-9]{24}$/i.test(src)) return API_ORIGIN + src;
  try { const u = new URL(src); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch (_) { return ''; }
}

/** Avatar markup: gradient initials that stay visible if the photo is missing or fails to load. */
function avatar(user, size = 'md') {
  const u = user || {};
  const src = mediaUrl(u.profileImage);
  return `<span class="avatar av-${size}" style="--h:${hueFor(u.username || u.name)}"><span class="av-ini" aria-hidden="true">${esc(initials(u.name))}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" data-fallback="avatar">` : ''}</span>`;
}

const URL_RE = /https?:\/\/[^\s<]+[^\s<.,;:!?)"'\]]/g;
const TAG_RE = /(^|[^\p{L}\p{N}_&/#])#([\p{L}\p{N}_]{1,30})/gu;
const MENTION_RE = /(^|[^\p{L}\p{N}_&/@.])@([a-zA-Z0-9_]{3,30})/gu;
/** Escapes user text, then turns URLs, #hashtags and @mentions into links. Safe against XSS. */
function richText(text) {
  const decorate = (seg) => esc(seg)
    .replace(TAG_RE, (_, pre, t) => `${pre}<a class="tag" href="search.html?q=${enc('#' + t)}">#${t}</a>`)
    .replace(MENTION_RE, (_, pre, u) => `${pre}<a class="mention" href="profile.html?username=${enc(u.toLowerCase())}">@${u}</a>`);
  let out = '', last = 0;
  for (const m of text.matchAll(URL_RE)) {
    out += decorate(text.slice(last, m.index));
    out += `<a href="${esc(m[0])}" target="_blank" rel="noopener noreferrer nofollow">${esc(m[0].replace(/^https?:\/\//, '').slice(0, 44))}${m[0].length > 51 ? '…' : ''}</a>`;
    last = m.index + m[0].length;
  }
  return out + decorate(text.slice(last));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {
    const ta = Object.assign(document.createElement('textarea'), { value: text, style: 'position:fixed;opacity:0' });
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}
const postUrl = (id) => new URL(`post.html?id=${id}`, location.href).href;

/** Image fallbacks without inline handlers (CSP-safe): a broken avatar simply reveals the initials. */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.dataset.fallback === 'avatar') img.remove();
  else if (img.dataset.fallback === 'media') {
    const box = img.closest('.post-media, .grid-item');
    if (box) { box.classList.add('is-broken'); box.innerHTML = '<span class="media-fallback">Image unavailable</span>'; }
  }
}, true);

/* ---------------------------------- Theme --------------------------------- */
const Theme = {
  get pref() { return localStorage.getItem('msm_theme') || 'system'; },
  get resolved() { return document.documentElement.dataset.theme; },
  set(pref) {
    try { localStorage.setItem('msm_theme', pref); } catch (_) {}
    const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePref = pref;
    document.dispatchEvent(new CustomEvent('msm:theme', { detail: pref }));
  },
  toggle() { this.set(this.resolved === 'dark' ? 'light' : 'dark'); },
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (Theme.pref === 'system') Theme.set('system'); });

/* ---------------------------------- Toasts -------------------------------- */
const Toast = {
  show(message, type = 'success', { duration = 3800, action } = {}) {
    let box = $('#toasts');
    if (!box) {
      box = html('<div id="toasts" class="toasts" role="region" aria-label="Notifications" aria-live="polite"></div>');
      document.body.appendChild(box);
    }
    while (box.children.length >= 3) box.firstElementChild.remove();
    const icon = { success: 'check-circle', error: 'alert', info: 'info' }[type] || 'info';
    const el = html(`<div class="toast toast-${type}" role="${type === 'error' ? 'alert' : 'status'}"><span class="toast-ic">${Icons.svg(icon)}</span><span class="toast-msg">${esc(message)}</span>${action ? `<button class="toast-action" type="button">${esc(action.label)}</button>` : ''}<button class="toast-x" type="button" aria-label="Dismiss">${Icons.svg('x', 16)}</button></div>`);
    const close = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 220); };
    $('.toast-x', el).onclick = close;
    if (action) $('.toast-action', el).onclick = () => { action.onClick(); close(); };
    box.appendChild(el);
    if (duration) setTimeout(close, duration);
    return close;
  },
  success: (m, o) => Toast.show(m, 'success', o),
  error: (m, o) => Toast.show(m, 'error', { duration: 5200, ...o }),
  info: (m, o) => Toast.show(m, 'info', o),
};

/* --------------------------------- Icons ---------------------------------- */
const Icons = {
  paths: {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/>',
    bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2A6.5 6.5 0 0 1 21.5 20"/>',
    'user-plus': '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    heart: '<path d="M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8 2.7c0 6.1-8 11-8 11z"/>',
    comment: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.5-5.3A8.5 8.5 0 1 1 21 12z"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8M12 16v5"/>',
    logout: '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    'arrow-left': '<path d="M19 12H5M11 5l-7 7 7 7"/>',
    hash: '<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.7A16.6 16.6 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    flame: '<path d="M12 22c4 0 7-2.8 7-7 0-3-1.7-5-3.3-6.5C14.5 7.4 14 5.5 14 3c-3 1.5-5 4.7-5 8-1-.5-1.6-1.4-2-2.5C5.6 10 5 12 5 15c0 4.2 3 7 7 7z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z"/>',
  },
  /** Returns an inline SVG string. `filled` icons (liked heart, saved bookmark) fill with currentColor. */
  svg(name, size = 20, { filled = false, cls = '' } = {}) {
    return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${this.paths[name] || ''}</svg>`;
  },
};
const icon = (n, s, o) => Icons.svg(n, s, o);
