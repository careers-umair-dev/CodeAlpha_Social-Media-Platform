/** Saved posts (bookmarks). */
(async () => {
  const { main } = await App.boot({ page: 'saved', title: 'Saved' });
  main.innerHTML = `<div class="page-head"><h1 class="page-title">Saved</h1><p class="page-sub">Posts you bookmarked. Only you can see this.</p></div><div id="saved"></div>`;
  const list = createList({
    container: $('#saved', main),
    fetch: async (page) => { const r = await Api.saved(page); return { items: r.posts, hasMore: r.hasMore }; },
    render: (p) => PostCard.create(p, { onUnsave: (c) => list.removed(c), onRemove: (c) => list.removed(c) }),
    empty: { icon: 'bookmark', title: 'No saved posts yet', text: 'Tap the bookmark on any post to keep it here for later.', action: { label: 'Browse your feed', href: 'index.html' } },
    errorTitle: "Couldn't load saved posts",
  });
  list.load();
})();
