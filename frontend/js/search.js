/** Search: people, posts and #hashtags with live results. */
(async () => {
  const { main } = await App.boot({ page: 'search', title: 'Explore', rail: false });
  const params = new URLSearchParams(location.search);
  let type = ['users', 'posts'].includes(params.get('type')) ? params.get('type') : 'all';
  let seq = 0, postList = null;

  main.innerHTML = `<div class="page-head"><h1 class="page-title">Explore</h1>
    <form class="search-box" role="search" novalidate>${icon('search', 20)}<input type="search" id="q" placeholder="Search people, posts or #hashtags" aria-label="Search" autocomplete="off" maxlength="60" autofocus><button class="btn-icon btn-icon-sm hidden" type="button" id="clear" aria-label="Clear search">${icon('x', 18)}</button></form>
    <div class="tabs" role="tablist" aria-label="Result type">${[['all', 'Top'], ['users', 'People'], ['posts', 'Posts']].map(([k, l]) => `<button class="tab" role="tab" data-t="${k}" aria-selected="${k === type}" tabindex="${k === type ? 0 : -1}">${l}</button>`).join('')}</div></div>
    <div id="results" aria-live="polite"></div>`;
  const input = $('#q', main), results = $('#results', main), clearBtn = $('#clear', main);
  input.value = params.get('q') || '';

  function idle() {
    results.innerHTML = '';
    const box = html(`<div class="idle"><div class="state"><div class="state-ic">${icon('search', 26)}</div><h3>Find people and conversations</h3><p>Type a name, a word from a post, or a #hashtag.</p></div><section class="card idle-card"><h2 class="rail-title">Trending topics</h2><div class="chips" data-trending>${'<span class="sk sk-chip"></span>'.repeat(4)}</div></section><section class="card idle-card"><h2 class="rail-title">People you may like</h2><div data-people>${Skeleton.repeat(Skeleton.user, 3)}</div></section></div>`);
    results.appendChild(box);
    Api.trending().then(({ tags }) => { $('[data-trending]', box).innerHTML = tags.length ? tags.map((t) => `<a class="chip" href="search.html?q=${enc('#' + t.tag)}">#${esc(t.tag)}<span>${t.count}</span></a>`).join('') : '<p class="rail-empty">No topics yet. Add a #hashtag to a post to start one.</p>'; }).catch(() => { $('[data-trending]', box).innerHTML = '<p class="rail-empty">Couldn’t load topics.</p>'; });
    Api.suggestions().then(({ users }) => { $('[data-people]', box).replaceChildren(...(users.length ? users.map((u) => userRow(u)) : [html('<p class="rail-empty">You’re following everyone.</p>')])); }).catch(() => { $('[data-people]', box).innerHTML = '<p class="rail-empty">Couldn’t load suggestions.</p>'; });
  }

  async function run() {
    const q = input.value.trim(), mine = ++seq;
    clearBtn.classList.toggle('hidden', !q);
    history.replaceState(null, '', q ? `?q=${enc(q)}${type !== 'all' ? `&type=${type}` : ''}` : location.pathname);
    if (postList) { postList.destroy(); postList = null; }
    if (q.length < 2) { if (q.length === 1) results.innerHTML = '<p class="hint">Keep typing… at least 2 characters.</p>'; else idle(); return; }

    results.innerHTML = `<div class="results-loading">${Skeleton.repeat(Skeleton.user, 3)}</div>`;
    const wrap = html('<div class="results"></div>');
    const isTag = q.startsWith('#');
    const noResults = { icon: 'search', title: `No results for “${q.length > 30 ? q.slice(0, 30) + '…' : q}”`, text: 'Check the spelling, or try a shorter word or a different #hashtag.' };

    if (type !== 'posts' && !isTag) {
      try {
        const { users } = await Api.search(q, 'users', 1);
        if (mine !== seq) return;
        if (users.length) {
          const sec = html('<section class="card people-card"><h2 class="section-title">People</h2></section>');
          users.slice(0, type === 'users' ? 20 : 4).forEach((u) => sec.appendChild(userRow(u)));
          wrap.appendChild(sec);
        } else if (type === 'users') wrap.appendChild(stateBlock(noResults));
      } catch (e) {
        if (mine !== seq) return;
        wrap.appendChild(stateBlock({ icon: 'alert', tone: 'error', title: "Couldn't search people", text: e.message, action: { label: 'Try again', primary: false, onClick: run } }));
      }
    }
    if (type !== 'users' || isTag) {
      const holder = html('<section class="posts-results"></section>');
      if (wrap.children.length) holder.appendChild(html('<h2 class="section-title plain">Posts</h2>'));
      const listBox = html('<div></div>'); holder.appendChild(listBox); wrap.appendChild(holder);
      results.replaceChildren(wrap);
      postList = createList({
        container: listBox,
        fetch: async (page) => { const r = await Api.search(q, 'posts', page); return { items: r.posts, hasMore: r.hasMore }; },
        render: (p) => PostCard.create(p, { onRemove: (c) => postList.removed(c) }),
        empty: wrap.querySelector('.people-card') ? { icon: 'comment', title: 'No matching posts', text: 'Try a different word or a #hashtag.' } : noResults,
        errorTitle: "Couldn't search posts",
      });
      postList.load();
    } else results.replaceChildren(wrap);
  }

  const debounced = debounce(run, 320);
  input.addEventListener('input', debounced);
  $('form', main).addEventListener('submit', (e) => { e.preventDefault(); debounced.cancel(); run(); });
  clearBtn.onclick = () => { input.value = ''; input.focus(); run(); };
  const tabs = $('.tabs', main);
  tabs.addEventListener('click', (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    type = t.dataset.t;
    $$('.tab', main).forEach((b) => { b.setAttribute('aria-selected', b === t); b.tabIndex = b === t ? 0 : -1; });
    run();
  });
  run();
})();
