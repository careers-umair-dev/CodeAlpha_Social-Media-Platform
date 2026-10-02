/**
 * layout.js — application shell: top bar (search, notifications, account), side navigation,
 * mobile bottom bar and the discovery rail. Every authenticated page calls App.boot().
 */
'use strict';

async function logout() {
  try { await Api.logout(); } catch (_) { /* server is stateless; clearing locally is what matters */ }
  Store.clear();
  Store.flash('You have been logged out.', 'info');
  location.replace('login.html');
}

/* ------------------------------- Notifications ----------------------------- */
const Notifs = {
  count: 0,
  timer: null,
  setCount(n) {
    this.count = Math.max(0, n | 0);
    $$('[data-badge]').forEach((b) => {
      b.textContent = this.count > 99 ? '99+' : String(this.count);
      b.classList.toggle('hidden', !this.count);
    });
    $$('[data-notif-link]').forEach((a) => a.setAttribute('aria-label', this.count ? `Notifications, ${this.count} unread` : 'Notifications'));
    document.title = document.title.replace(/^\(\d+\+?\)\s/, '');
    if (this.count) document.title = `(${this.count > 99 ? '99+' : this.count}) ${document.title}`;
  },
  async refresh() {
    try { this.setCount((await Api.unreadCount()).unreadCount); } catch (_) { /* transient; try again next tick */ }
  },
  start() {
    this.refresh();
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (!document.hidden) this.refresh(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
  },
};

const NOTIF_TEXT = { like: 'liked your post', comment: 'commented on your post', follow: 'started following you' };
const NOTIF_ICON = { like: 'heart', comment: 'comment', follow: 'user-plus' };

function notificationItem(n, { onRead } = {}) {
  const href = n.post ? `post.html?id=${n.post._id}` : `profile.html?username=${enc(n.actor.username)}`;
  const quote = n.type === 'comment' && n.text ? n.text : n.post ? (n.post.content || (n.post.image ? 'Photo' : '')) : '';
  const el = html(`<a class="notif ${n.read ? '' : 'unread'}" href="${href}">
    <span class="notif-av">${avatar(n.actor, 'md')}<span class="notif-type nt-${n.type}">${icon(NOTIF_ICON[n.type], 12, { filled: n.type === 'like' })}</span></span>
    <span class="notif-body"><span class="notif-line"><strong>${esc(n.actor.name)}</strong> ${NOTIF_TEXT[n.type]}</span>${quote ? `<span class="notif-quote">${n.type === 'comment' ? '“' + esc(quote) + '”' : esc(quote)}</span>` : ''}<time datetime="${n.createdAt}" title="${esc(fullDate(n.createdAt))}">${timeAgo(n.createdAt)}</time></span>
    ${n.read ? '' : '<span class="notif-dot" role="img" aria-label="Unread"></span>'}</a>`);
  el.addEventListener('click', async (e) => {
    if (n.read || e.metaKey || e.ctrlKey || e.button) return;
    e.preventDefault();
    n.read = true;
    try { await Promise.race([Api.markRead(n._id).then((r) => Notifs.setCount(r.unreadCount)), new Promise((r) => setTimeout(r, 700))]); } catch (_) {}
    if (onRead) onRead(n);
    location.href = href;
  });
  return el;
}

function openNotificationPanel(anchor) {
  const panel = html(`<div class="notif-panel"><div class="notif-head"><h2>Notifications</h2><button class="btn btn-ghost btn-sm" type="button" data-readall>Mark all read</button></div><div class="notif-scroll"></div><a class="notif-foot" href="notifications.html">See all notifications</a></div>`);
  const scroll = $('.notif-scroll', panel), readAll = $('[data-readall]', panel);
  scroll.innerHTML = Skeleton.repeat(Skeleton.user, 3);
  Popover.open(anchor, panel, { className: 'notif-pop', label: 'Notifications' });
  readAll.onclick = async () => {
    readAll.disabled = true;
    try { await Api.markAllRead(); Notifs.setCount(0); $$('.notif.unread', panel).forEach((n) => { n.classList.remove('unread'); const d = $('.notif-dot', n); if (d) d.remove(); }); }
    catch (e) { Toast.error(e.message); } finally { readAll.disabled = false; }
  };
  Api.notifications(1).then((res) => {
    Notifs.setCount(res.unreadCount);
    readAll.disabled = !res.unreadCount;
    if (!res.notifications.length) { scroll.replaceChildren(stateBlock({ icon: 'bell', title: 'You’re all caught up', text: 'Likes, comments and new followers will show up here.' })); return; }
    scroll.replaceChildren(...res.notifications.slice(0, 8).map((n) => notificationItem(n)));
  }).catch((e) => scroll.replaceChildren(stateBlock({ icon: 'alert', tone: 'error', title: "Couldn't load notifications", text: e.message })));
}

/* --------------------------------- Rail ----------------------------------- */
function mountRail(el) {
  el.innerHTML = `<section class="card rail-card"><h2 class="rail-title">Trending topics</h2><div data-trending>${Skeleton.repeat(Skeleton.user, 2)}</div></section>
    <section class="card rail-card"><h2 class="rail-title">Who to follow</h2><div data-people>${Skeleton.repeat(Skeleton.user, 3)}</div></section>
    <p class="rail-foot">MiniSocial · ${new Date().getFullYear()}</p>`;
  const tr = $('[data-trending]', el), pe = $('[data-people]', el);
  Api.trending().then(({ tags }) => {
    tr.innerHTML = tags.length
      ? tags.map((t) => `<a class="trend" href="search.html?q=${enc('#' + t.tag)}"><span class="trend-tag">#${esc(t.tag)}</span><span class="muted">${t.count} ${t.count === 1 ? 'post' : 'posts'}</span></a>`).join('')
      : '<p class="rail-empty">No topics yet. Add a #hashtag to your next post to start one.</p>';
  }).catch(() => { tr.innerHTML = '<p class="rail-empty">Couldn’t load topics right now.</p>'; });
  const loadPeople = () => Api.suggestions().then(({ users }) => {
    pe.replaceChildren(...(users.length ? users.map((u) => userRow(u, { showBio: false })) : [html('<p class="rail-empty">You’re following everyone. Nice!</p>')]));
  }).catch((e) => { pe.replaceChildren(stateBlock({ icon: 'alert', tone: 'error', title: "Couldn't load suggestions", text: '', action: { label: 'Retry', primary: false, onClick: loadPeople } })); });
  loadPeople();
}

/* --------------------------------- Search --------------------------------- */
function mountTopSearch(root) {
  const input = $('input', root), pop = $('.tsearch-pop', root);
  let ctrl = null, active = -1;
  const items = () => $$('.ts-item', pop);
  const hide = () => { pop.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); active = -1; };
  const go = (q) => { location.href = `search.html?q=${enc(q)}`; };
  const mark = (i) => { items().forEach((el, n) => el.setAttribute('aria-selected', String(n === i))); active = i; if (i >= 0) input.setAttribute('aria-activedescendant', items()[i].id); else input.removeAttribute('aria-activedescendant'); };

  const show = async () => {
    const q = input.value.trim();
    if (q.length < 2) return hide();
    pop.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true');
    const postRow = `<a class="ts-item ts-all" role="option" id="ts-all" href="search.html?q=${enc(q)}">${icon('search', 18)}<span>Search for <strong>${esc(q)}</strong></span></a>`;
    if (q.startsWith('#')) { pop.innerHTML = postRow; return; }
    pop.innerHTML = `<div class="ts-loading">${Skeleton.user()}</div>`;
    if (ctrl) ctrl.abort(); ctrl = new AbortController();
    try {
      const { users } = await Api.search(q, 'users', 1, ctrl.signal);
      if (input.value.trim() !== q) return;
      pop.innerHTML = users.slice(0, 5).map((u, i) => `<a class="ts-item" role="option" id="ts-${i}" href="profile.html?username=${enc(u.username)}">${avatar(u, 'sm')}<span class="ts-meta"><strong>${esc(u.name)}</strong><span class="muted">@${esc(u.username)}</span></span></a>`).join('') + postRow;
      active = -1;
    } catch (e) { if (e.name !== 'AbortError') pop.innerHTML = `<div class="ts-msg">${esc(e.message)}</div>`; }
  };
  const run = debounce(show, 220);
  input.addEventListener('input', run);
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) show(); });
  input.addEventListener('keydown', (e) => {
    const n = items().length;
    if (e.key === 'ArrowDown' && n) { e.preventDefault(); mark((active + 1) % n); }
    else if (e.key === 'ArrowUp' && n) { e.preventDefault(); mark((active - 1 + n) % n); }
    else if (e.key === 'Escape') { hide(); input.blur(); }
    else if (e.key === 'Enter') { e.preventDefault(); const q = input.value.trim(); if (active >= 0) items()[active].click(); else if (q.length >= 2) go(q); }
  });
  document.addEventListener('mousedown', (e) => { if (!root.contains(e.target)) hide(); });
  // "/" focuses search like most modern apps
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable && !Modal.count) { e.preventDefault(); input.focus(); }
  });
}

/* ---------------------------------- Shell --------------------------------- */
const App = {
  user: null,

  async boot({ page, rail = true, title } = {}) {
    if (!Store.token) { goToLogin(); return new Promise(() => {}); } // stop the page script while redirecting
    let me = Store.user;
    const root = $('#app');
    App.user = me;
    if (title) document.title = `${title} · MiniSocial`;

    const links = [
      ['home', 'Home', 'index.html', 'home'],
      ['search', 'Explore', 'search.html', 'search'],
      ['notifications', 'Notifications', 'notifications.html', 'bell'],
      ['saved', 'Saved', 'saved.html', 'bookmark'],
      ['profile', 'Profile', `profile.html?username=${me ? enc(me.username) : ''}`, 'user'],
      ['settings', 'Settings', 'settings.html', 'settings'],
    ];
    const navLink = ([key, label, href, ic]) => `<a class="nav-item ${page === key ? 'active' : ''}" href="${href}" ${page === key ? 'aria-current="page"' : ''} ${key === 'notifications' ? 'data-notif-link' : ''}><span class="nav-ic">${icon(ic, 22)}${key === 'notifications' ? '<span class="badge hidden" data-badge></span>' : ''}</span><span class="nav-label">${label}</span></a>`;

    root.innerHTML = `<a class="skip-link" href="#main">Skip to content</a>
    <header class="topbar"><div class="topbar-in">
      <a class="brand" href="index.html" aria-label="MiniSocial home"><span class="brand-mark"><img src="favicon.svg" alt="" width="34" height="34"></span><span class="brand-name">MiniSocial</span></a>
      <div class="tsearch" role="search"><span class="tsearch-ic">${icon('search', 18)}</span><input type="search" placeholder="Search people and posts  ( / )" aria-label="Search people and posts" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="ts-pop" aria-autocomplete="list"><div id="ts-pop" class="tsearch-pop hidden" role="listbox" aria-label="Search suggestions"></div></div>
      <div class="top-actions">
        <a class="btn-icon top-search-link" href="search.html" aria-label="Search">${icon('search')}</a>
        <button class="btn btn-primary btn-sm top-post" type="button" data-compose>${icon('plus', 18)}<span>Post</span></button>
        <button class="btn-icon" type="button" id="theme-btn"></button>
        <button class="btn-icon bell-btn" type="button" id="bell-btn" aria-haspopup="dialog" aria-expanded="false" data-notif-link aria-label="Notifications">${icon('bell')}<span class="badge hidden" data-badge></span></button>
        <button class="avatar-btn" type="button" id="user-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Account menu"></button>
      </div></div></header>
    <div class="layout ${rail ? '' : 'no-rail'}">
      <aside class="sidenav" aria-label="Main navigation"><nav>${links.map(navLink).join('')}</nav><button class="btn btn-primary btn-block side-post" type="button" data-compose>${icon('plus', 18)}<span>New post</span></button></aside>
      <main id="main" class="content" tabindex="-1"></main>
      ${rail ? '<aside class="rail" aria-label="Discover"></aside>' : ''}
    </div>
    <nav class="bottomnav" aria-label="Primary">
      <a class="bn ${page === 'home' ? 'active' : ''}" href="index.html" aria-label="Home">${icon('home', 24)}</a>
      <a class="bn ${page === 'search' ? 'active' : ''}" href="search.html" aria-label="Explore">${icon('search', 24)}</a>
      <button class="bn bn-create" type="button" data-compose aria-label="Create post">${icon('plus', 24)}</button>
      <a class="bn ${page === 'notifications' ? 'active' : ''}" href="notifications.html" data-notif-link aria-label="Notifications"><span class="nav-ic">${icon('bell', 24)}<span class="badge hidden" data-badge></span></span></a>
      <a class="bn ${page === 'profile' ? 'active' : ''}" href="${links[4][2]}" aria-label="Profile">${icon('user', 24)}</a>
    </nav>`;

    const paintUser = () => {
      const u = Store.user || {};
      $('#user-btn').innerHTML = avatar(u, 'sm');
      $$('a[href^="profile.html?username="]', $('.sidenav')).forEach((a) => { a.href = `profile.html?username=${enc(u.username || '')}`; });
    };
    const paintTheme = () => {
      const dark = Theme.resolved === 'dark', b = $('#theme-btn');
      b.innerHTML = icon(dark ? 'sun' : 'moon'); b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); b.title = dark ? 'Light mode' : 'Dark mode';
    };
    paintUser(); paintTheme();
    document.addEventListener('msm:theme', paintTheme);
    document.addEventListener('msm:user', paintUser);

    $('#theme-btn').onclick = () => Theme.toggle();
    $$('[data-compose]').forEach((b) => { b.onclick = () => Composer.openModal(); });
    $('#bell-btn').onclick = () => openNotificationPanel($('#bell-btn'));
    $('#user-btn').onclick = () => {
      const u = Store.user || {}, dark = Theme.resolved === 'dark';
      Popover.menu($('#user-btn'), [
        { header: `<a class="menu-user" href="profile.html?username=${enc(u.username || '')}">${avatar(u, 'md')}<span><strong>${esc(u.name)}</strong><span class="muted">@${esc(u.username)}</span></span></a>` },
        { divider: true },
        { label: 'Your profile', icon: 'user', href: `profile.html?username=${enc(u.username || '')}` },
        { label: 'Saved posts', icon: 'bookmark', href: 'saved.html' },
        { label: 'Settings', icon: 'settings', href: 'settings.html' },
        { label: dark ? 'Light mode' : 'Dark mode', icon: dark ? 'sun' : 'moon', onClick: () => Theme.toggle() },
        { divider: true },
        { label: 'Log out', icon: 'logout', danger: true, onClick: logout },
      ], { label: 'Account menu' });
    };
    mountTopSearch($('.tsearch'));
    if (rail) mountRail($('.rail'));
    Notifs.start();

    const flash = Store.takeFlash(); if (flash) Toast.show(flash.message, flash.type);

    // Refresh the profile from the server (validates the session, keeps counts fresh)
    Api.me().then(({ user }) => { Store.setUser(user); App.user = user; document.dispatchEvent(new CustomEvent('msm:user', { detail: user })); }).catch(() => {});
    if (!me) { me = (await Api.me()).user; Store.setUser(me); App.user = me; paintUser(); }

    return { main: $('#main'), user: me };
  },
};
