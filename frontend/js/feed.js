/** Home feed: For you / Following / Latest, composer, infinite scroll. */
(async () => {
  const { main } = await App.boot({ page: 'home', title: 'Home' });
  const TABS = [['foryou', 'For you'], ['following', 'Following'], ['latest', 'Latest']];
  const EMPTY = {
    foryou: { icon: 'flame', title: 'Nothing here yet', text: 'Be the first to post, or follow people to shape this feed.', action: { label: 'Create a post', onClick: () => Composer.openModal() } },
    following: { icon: 'users', title: 'Your Following feed is empty', text: 'Follow people and their posts will show up here.', action: { label: 'Find people', href: 'search.html' } },
    latest: { icon: 'flame', title: 'No posts yet', text: 'Share the first one.', action: { label: 'Create a post', onClick: () => Composer.openModal() } },
  };
  let tab = sessionStorage.getItem('msm_feed_tab');
  if (!TABS.some(([k]) => k === tab)) tab = 'foryou';

  main.innerHTML = `<div class="page-head"><h1 class="page-title">Home</h1><div class="tabs" role="tablist" aria-label="Choose a feed">${TABS.map(([k, l]) => `<button class="tab" role="tab" id="tab-${k}" data-tab="${k}" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}">${l}</button>`).join('')}</div></div>
    <div class="composer-slot"></div><div id="feed" role="tabpanel" aria-live="polite"></div>`;
  $('.composer-slot', main).appendChild(Composer.create({ placeholder: `What's on your mind, ${(App.user.name || '').split(' ')[0]}?` }));

  let list = null;
  function load() {
    if (list) list.destroy();
    $('#feed', main).setAttribute('aria-labelledby', `tab-${tab}`);
    list = createList({
      container: $('#feed', main),
      fetch: async (page) => { const r = await Api.feed(tab, page); return { items: r.posts, hasMore: r.hasMore }; },
      render: (p) => PostCard.create(p, { onRemove: (c) => list.removed(c) }),
      empty: EMPTY[tab], errorTitle: "Couldn't load your feed",
    });
    list.load();
  }
  function select(k, focus) {
    if (k === tab && list) return;
    tab = k; sessionStorage.setItem('msm_feed_tab', k);
    $$('.tab', main).forEach((t) => { const on = t.dataset.tab === k; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    load();
  }
  const tabs = $('.tabs', main);
  tabs.addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) select(t.dataset.tab); });
  tabs.addEventListener('keydown', (e) => {
    const i = TABS.findIndex(([k]) => k === tab);
    if (e.key === 'ArrowRight') select(TABS[(i + 1) % 3][0], true);
    if (e.key === 'ArrowLeft') select(TABS[(i + 2) % 3][0], true);
  });
  document.addEventListener('msm:posted', (e) => { if (list) list.prepend(PostCard.create(e.detail, { onRemove: (c) => list.removed(c) })); });
  load();
})();
