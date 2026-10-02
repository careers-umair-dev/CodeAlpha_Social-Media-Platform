/** Single post page (also the target of shared links and notifications). */
(async () => {
  const { main } = await App.boot({ page: 'post', title: 'Post' });
  const id = new URLSearchParams(location.search).get('id') || '';
  main.innerHTML = `<div class="page-head page-head-back"><a class="btn-icon" href="index.html" aria-label="Back to home" id="back">${icon('arrow-left')}</a><h1 class="page-title">Post</h1></div><div id="post-slot">${Skeleton.post()}</div>`;
  $('#back', main).addEventListener('click', (e) => { if (history.length > 1 && document.referrer.startsWith(location.origin)) { e.preventDefault(); history.back(); } });
  const slot = $('#post-slot', main);
  try {
    if (!/^[a-f0-9]{24}$/i.test(id)) throw Object.assign(new Error('That link looks incomplete.'), { status: 404 });
    const { post } = await Api.post(id);
    document.title = `${post.author.name}: “${(post.content || 'Photo').slice(0, 40)}” · MiniSocial`;
    slot.replaceChildren(PostCard.create(post, { commentsOpen: true, onRemove: () => { location.href = 'index.html'; } }));
  } catch (e) {
    slot.replaceChildren(stateBlock(e.status === 404
      ? { icon: 'search', title: 'This post isn’t available', text: 'It may have been deleted, or the link is wrong.', action: { label: 'Go to your feed', href: 'index.html' } }
      : { icon: 'alert', tone: 'error', title: "Couldn't load this post", text: e.message, action: { label: 'Try again', primary: false, onClick: () => location.reload() } }));
  }
})();
