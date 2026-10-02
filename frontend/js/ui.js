/**
 * ui.js — reusable interface primitives: modal, popover menu, confirm dialog,
 * skeleton/empty/error states, infinite list, follow button.
 */
'use strict';

/* ---------------------------------- Modal --------------------------------- */
const Modal = (() => {
  const stack = [];
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function open({ title = '', content, size = 'md', className = '', onClose, closeLabel = 'Close', hideHeader = false } = {}) {
    const opener = document.activeElement;
    const id = `m${Math.random().toString(36).slice(2, 8)}`;
    const overlay = html(`<div class="overlay"><div class="modal modal-${size} ${className}" role="dialog" aria-modal="true" ${title ? `aria-labelledby="${id}-t"` : 'aria-label="Dialog"'}>
      ${hideHeader ? '' : `<header class="modal-head"><h2 id="${id}-t" class="modal-title">${esc(title)}</h2><button class="btn-icon" type="button" data-close aria-label="${esc(closeLabel)}">${icon('x')}</button></header>`}
      <div class="modal-body"></div></div></div>`);
    const dialog = $('.modal', overlay);
    const body = $('.modal-body', overlay);
    if (typeof content === 'string') body.innerHTML = content; else if (content) body.appendChild(content);

    let closed = false;
    const close = (result) => {
      if (closed) return; closed = true;
      stack.splice(stack.indexOf(handle), 1);
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), 180);
      if (!stack.length) document.documentElement.classList.remove('modal-open');
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
      if (onClose) onClose(result);
    };
    const handle = { el: dialog, body, close, overlay };

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    overlay.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') { // keep focus inside the dialog
        const items = $$(FOCUSABLE, dialog).filter((n) => n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    document.body.appendChild(overlay);
    document.documentElement.classList.add('modal-open');
    stack.push(handle);
    const autofocus = $('[autofocus]', dialog) || $$(FOCUSABLE, dialog).find((n) => !n.hasAttribute('data-close')) || $('[data-close]', dialog) || dialog;
    if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
    requestAnimationFrame(() => autofocus.focus({ preventScroll: true }));
    return handle;
  }
  return { open, get count() { return stack.length; } };
})();

/** Promise-based confirmation dialog: resolves true when confirmed. */
function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const content = html(`<div class="confirm"><p>${esc(message)}</p><div class="modal-actions"><button class="btn btn-ghost" type="button" data-close>${esc(cancelText)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>${esc(confirmText)}</button></div></div>`);
    let answer = false;
    const m = Modal.open({ title, content, size: 'sm', onClose: () => resolve(answer) });
    $('[data-ok]', content).onclick = () => { answer = true; m.close(); };
    $('[data-ok]', content).focus();
  });
}

/* ------------------------------ Popover / Menu ----------------------------- */
const Popover = (() => {
  let current = null;
  function close() { if (current) { current.close(); current = null; } }

  /** Opens `content` anchored to an element. On narrow screens it becomes a bottom sheet. */
  function open(anchor, content, { align = 'end', className = '', label = 'Menu' } = {}) {
    close();
    const sheet = window.innerWidth < 560;
    const pop = html(`<div class="popover ${sheet ? 'is-sheet' : ''} ${className}" role="dialog" aria-label="${esc(label)}"></div>`);
    pop.appendChild(content);
    const backdrop = sheet ? html('<div class="sheet-backdrop"></div>') : null;
    if (backdrop) document.body.appendChild(backdrop);
    document.body.appendChild(pop);

    const place = () => {
      if (sheet) return;
      const r = anchor.getBoundingClientRect();
      const w = pop.offsetWidth, h = pop.offsetHeight;
      let left = align === 'end' ? r.right - w : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      let top = r.bottom + 8, origin = 'top';
      if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) { top = r.top - h - 8; origin = 'bottom'; }
      pop.style.left = `${left}px`; pop.style.top = `${top}px`;
      pop.style.transformOrigin = `${origin} ${align === 'end' ? 'right' : 'left'}`;
    };
    place();
    anchor.setAttribute('aria-expanded', 'true');

    let done = false;
    const teardown = () => {
      if (done) return; done = true;
      anchor.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
      pop.classList.add('leaving'); if (backdrop) backdrop.classList.add('leaving');
      setTimeout(() => { pop.remove(); if (backdrop) backdrop.remove(); }, 140);
    };
    const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
    // Follow the anchor while scrolling; only dismiss once the anchor leaves the screen.
    const onScroll = (e) => {
      if (sheet || pop.contains(e.target)) return;
      const r = anchor.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) close(); else place();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus({ preventScroll: true }); }
      const items = $$('[role=menuitem]', pop);
      if (items.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    if (backdrop) backdrop.addEventListener('click', close);
    current = { close: teardown, pop };
    return { close, pop };
  }

  /** items: [{label, icon, onClick, danger, href}] or {divider:true} or {header:'html'} */
  function menu(anchor, items, opts = {}) {
    const list = html('<div class="menu" role="menu"></div>');
    items.filter(Boolean).forEach((it) => {
      if (it.divider) return list.appendChild(html('<div class="menu-sep" role="separator"></div>'));
      if (it.header) return list.appendChild(html(`<div class="menu-header">${it.header}</div>`));
      const el = html(`<${it.href ? 'a' : 'button'} class="menu-item ${it.danger ? 'danger' : ''}" role="menuitem" ${it.href ? `href="${esc(it.href)}"` : 'type="button"'}>${it.icon ? icon(it.icon, 18) : ''}<span>${esc(it.label)}</span>${it.trailing ? `<span class="menu-trail">${it.trailing}</span>` : ''}</${it.href ? 'a' : 'button'}>`);
      el.addEventListener('click', () => { close(); if (it.onClick) it.onClick(); });
      list.appendChild(el);
    });
    const p = open(anchor, list, opts);
    const first = $('[role=menuitem]', list); if (first) first.focus({ preventScroll: true });
    return p;
  }
  return { open, menu, close };
})();

/* ------------------------- Skeletons and state blocks ---------------------- */
const Skeleton = {
  post: () => `<div class="card post skeleton-card" aria-hidden="true"><div class="post-head"><span class="sk sk-circle"></span><div class="sk-col"><span class="sk sk-line w40"></span><span class="sk sk-line w25"></span></div></div><span class="sk sk-line w95"></span><span class="sk sk-line w80"></span><span class="sk sk-block"></span></div>`,
  user: () => `<div class="user-row skeleton-card" aria-hidden="true"><span class="sk sk-circle"></span><div class="sk-col"><span class="sk sk-line w40"></span><span class="sk sk-line w60"></span></div></div>`,
  repeat: (fn, n) => Array.from({ length: n }, fn).join(''),
};

/** Empty and error placeholders: say what happened and what to do next. */
function stateBlock({ icon: ic = 'info', title, text = '', action, tone = 'neutral' }) {
  const el = html(`<div class="state state-${tone}" role="${tone === 'error' ? 'alert' : 'status'}"><div class="state-ic">${icon(ic, 26)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`);
  if (action) {
    const a = html(`<${action.href ? 'a' : 'button'} class="btn ${action.primary === false ? 'btn-soft' : 'btn-primary'}" ${action.href ? `href="${esc(action.href)}"` : 'type="button"'}>${esc(action.label)}</${action.href ? 'a' : 'button'}>`);
    if (action.onClick) a.onclick = action.onClick;
    el.appendChild(a);
  }
  return el;
}

/* ------------------------------- Infinite list ----------------------------- */
/**
 * Paginated list with skeleton loading, empty state, error+retry and infinite scroll.
 * fetch(page) -> { items, hasMore }.  render(item) -> Element.
 */
function createList({ container, fetch, render, empty, skeleton = () => Skeleton.post(), skeletonCount = 3, errorTitle = "Couldn't load this" }) {
  let page = 1, loading = false, hasMore = false, token = 0, count = 0;
  const wrap = html('<div class="list"></div>');
  const items = html('<div class="list-items"></div>');
  const foot = html('<div class="list-foot"></div>');
  wrap.append(items, foot);
  container.replaceChildren(wrap);

  const io = 'IntersectionObserver' in window ? new IntersectionObserver((e) => { if (e[0].isIntersecting && hasMore && !loading) load(); }, { rootMargin: '500px' }) : null;
  if (io) io.observe(foot);

  const showEmpty = () => { foot.replaceChildren(stateBlock(typeof empty === 'function' ? empty() : empty)); };
  function setFoot() {
    foot.replaceChildren();
    if (hasMore) {
      const b = html('<button class="btn btn-soft load-more" type="button">Load more</button>');
      b.onclick = () => load();
      foot.appendChild(b);
    } else if (!count) showEmpty();
  }

  async function load(reset = false) {
    if (loading && !reset) return;
    const mine = ++token; loading = true;
    if (reset) { page = 1; count = 0; hasMore = false; items.replaceChildren(); }
    if (page === 1) foot.innerHTML = Skeleton.repeat(skeleton, skeletonCount);
    else foot.innerHTML = '<div class="spinner-row"><span class="spinner"></span></div>';
    try {
      const res = await fetch(page);
      if (mine !== token) return;
      res.items.forEach((it) => { const el = render(it); if (el) { items.appendChild(el); count++; } });
      hasMore = !!res.hasMore; page += 1; loading = false;
      setFoot();
    } catch (err) {
      if (mine !== token) return;
      loading = false; hasMore = false;
      foot.replaceChildren(stateBlock({ icon: 'alert', tone: 'error', title: errorTitle, text: err.message, action: { label: 'Try again', primary: false, onClick: () => load(page === 1) } }));
    }
  }

  return {
    load: () => load(true),
    prepend(el) { items.prepend(el); count++; if (!hasMore) foot.replaceChildren(); },
    /** Call after an item element was removed by the caller. */
    removed(el) { el.classList.add('removing'); setTimeout(() => { el.remove(); count = Math.max(0, count - 1); if (!count && !hasMore) showEmpty(); }, 220); },
    destroy() { token++; if (io) io.disconnect(); },
    items,
  };
}

/* ------------------------------- Follow button ----------------------------- */
function followButton(user, { small = true } = {}) {
  const btn = html(`<button class="btn follow-btn ${small ? 'btn-sm' : ''}" type="button" data-follow-user="${esc(user.username)}"></button>`);
  let following = !!user.isFollowing, busy = false;
  const paint = () => {
    btn.classList.toggle('is-following', following);
    btn.setAttribute('aria-pressed', String(following));
    btn.setAttribute('aria-label', `${following ? 'Unfollow' : 'Follow'} @${user.username}`);
    btn.innerHTML = following
      ? `<span class="fb-on">${icon('check', 16)}<span>Following</span></span><span class="fb-off">Unfollow</span>`
      : `${icon('plus', 16)}<span>Follow</span>`;
  };
  btn._set = (v) => { following = v; user.isFollowing = v; paint(); };
  btn.addEventListener('click', async () => {
    if (busy) return;
    busy = true; btn.disabled = true;
    const next = !following;
    btn._set(next); // optimistic
    btn.classList.add('pulse'); setTimeout(() => btn.classList.remove('pulse'), 400);
    try {
      const res = await Api.follow(user.username, next);
      document.dispatchEvent(new CustomEvent('msm:follow', { detail: { username: user.username, following: next, followersCount: res.followersCount, followingCount: res.followingCount } }));
      const me = Store.user; if (me) { me.followingCount = res.followingCount; Store.setUser(me); }
    } catch (err) {
      btn._set(!next); Toast.error(err.message);
    } finally { busy = false; btn.disabled = false; }
  });
  paint();
  return btn;
}
// Keep every follow button for the same person in sync (feed, suggestions, profile…)
document.addEventListener('msm:follow', (e) => {
  $$(`[data-follow-user="${CSS.escape(e.detail.username)}"]`).forEach((b) => b._set && b._set(e.detail.following));
});

/** A compact person row (search results, suggestions, follower lists). */
function userRow(user, { showBio = true } = {}) {
  const me = Store.user;
  const isSelf = me && me._id === user._id;
  const row = html(`<div class="user-row"><a class="user-link" href="profile.html?username=${enc(user.username)}">${avatar(user, 'md')}<span class="user-meta"><strong>${esc(user.name)}</strong><span class="muted">@${esc(user.username)}</span>${showBio && user.bio ? `<span class="user-bio">${esc(user.bio)}</span>` : ''}</span></a></div>`);
  if (!isSelf) row.appendChild(followButton(user));
  return row;
}
