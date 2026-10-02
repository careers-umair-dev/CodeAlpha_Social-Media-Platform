/**
 * components.js — Composer, Comments and PostCard (used across pages).
 */
'use strict';

/* --------------------------------- Images --------------------------------- */
const readAsDataURL = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read that file.')); r.readAsDataURL(file); });
const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file doesn't look like a valid image.")); i.src = src; });

/** Validates and downsizes an image in the browser so uploads are fast and small. Returns a data URL. */
async function processImage(file, { maxDim = 1600 } = {}) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Please choose a JPG, PNG, WebP or GIF image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is over 15 MB. Choose a smaller one.');
  const LIMIT = 2.4 * 1024 * 1024;
  if (file.type === 'image/gif') {
    if (file.size > LIMIT) throw new Error('GIFs must be under 2.4 MB.');
    return readAsDataURL(file);
  }
  const img = await loadImage(await readAsDataURL(file));
  const base = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  for (const [quality, shrink] of [[0.86, 1], [0.75, 0.8], [0.65, 0.6]]) {
    canvas.width = Math.max(1, Math.round(img.width * base * shrink));
    canvas.height = Math.max(1, Math.round(img.height * base * shrink));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', quality);
    if (out.length * 0.75 < LIMIT) return out;
  }
  throw new Error('That image is too large to upload.');
}

/* --------------------------------- Lightbox -------------------------------- */
function openLightbox(src, alt = 'Image') {
  const content = html(`<div class="lightbox"><img src="${esc(src)}" alt="${esc(alt)}"><button class="lightbox-x btn-icon" type="button" data-close aria-label="Close image">${icon('x', 22)}</button></div>`);
  Modal.open({ content, size: 'lightbox', hideHeader: true, className: 'modal-lightbox' });
}

/* -------------------------------- Char counter ----------------------------- */
const RING = 2 * Math.PI * 10;
function counterMarkup() {
  return `<span class="counter" aria-live="off"><svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle class="ring-bg" cx="13" cy="13" r="10"/><circle class="ring-fg" cx="13" cy="13" r="10" stroke-dasharray="${RING}" stroke-dashoffset="${RING}" transform="rotate(-90 13 13)"/></svg><span class="counter-num"></span></span>`;
}
function paintCounter(root, len, max) {
  const fg = $('.ring-fg', root), num = $('.counter-num', root);
  fg.style.strokeDashoffset = RING * (1 - Math.min(1, len / max));
  const left = max - len;
  root.classList.toggle('warn', left <= 50 && left >= 0);
  root.classList.toggle('over', left < 0);
  num.textContent = left <= 50 ? String(left) : '';
  root.setAttribute('aria-label', left < 0 ? `${-left} characters over the limit` : `${left} characters left`);
}
const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 320)}px`; };

/* --------------------------------- Composer -------------------------------- */
const Composer = {
  MAX: 500,
  create({ placeholder = "What's on your mind?", onPosted, autofocus = false, plain = false } = {}) {
    const me = Store.user || {};
    const form = html(`<form class="composer ${plain ? '' : 'card'}" novalidate>
      <div class="composer-row">
        ${avatar(me, 'md')}
        <div class="composer-main">
          <textarea rows="2" name="content" placeholder="${esc(placeholder)}" aria-label="Post text" ${autofocus ? 'autofocus' : ''}></textarea>
          <div class="composer-preview hidden"><img alt="Selected image preview"><button class="preview-x" type="button" aria-label="Remove image">${icon('x', 16)}</button></div>
          <p class="field-error" role="alert"></p>
          <div class="composer-bar">
            <div class="composer-tools"><button class="btn-icon tool" type="button" aria-label="Add an image" title="Add an image">${icon('image', 20)}</button><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></div>
            <div class="composer-end">${counterMarkup()}<button class="btn btn-primary btn-sm" type="submit" disabled>Post</button></div>
          </div>
        </div>
      </div></form>`);
    const ta = $('textarea', form), file = $('input[type=file]', form), preview = $('.composer-preview', form);
    const previewImg = $('img', preview), submit = $('button[type=submit]', form), err = $('.field-error', form), counter = $('.counter', form);
    let image = null, busy = false;

    const sync = () => {
      const len = ta.value.trim().length;
      paintCounter(counter, ta.value.length, Composer.MAX);
      submit.disabled = busy || ta.value.length > Composer.MAX || (!len && !image);
      autosize(ta);
    };
    const setImage = (dataUrl) => {
      image = dataUrl;
      preview.classList.toggle('hidden', !dataUrl);
      if (dataUrl) previewImg.src = dataUrl; else previewImg.removeAttribute('src');
      sync();
    };
    const setError = (m) => { err.textContent = m || ''; };

    ta.addEventListener('input', () => { setError(''); sync(); });
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !submit.disabled) form.requestSubmit(); });
    $('.tool', form).onclick = () => file.click();
    $('.preview-x', form).onclick = () => { file.value = ''; setImage(null); };
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      setError('');
      try { setImage(await processImage(f)); } catch (e) { setError(e.message); file.value = ''; }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      const content = ta.value.trim();
      busy = true; submit.disabled = true; setError('');
      form.classList.add('is-busy');
      try {
        submit.textContent = image ? 'Uploading…' : 'Posting…';
        let imageUrl = '';
        if (image) imageUrl = (await Api.upload(image)).url;
        submit.textContent = 'Posting…';
        const { post } = await Api.createPost({ content, image: imageUrl });
        ta.value = ''; file.value = ''; setImage(null);
        Toast.success('Post published');
        document.dispatchEvent(new CustomEvent('msm:posted', { detail: post }));
        if (onPosted) onPosted(post);
      } catch (ex) {
        setError((ex.fields && (ex.fields.content || ex.fields.image)) || ex.message);
        Toast.error(ex.message);
      } finally {
        busy = false; form.classList.remove('is-busy'); submit.textContent = 'Post'; sync();
      }
    });
    sync();
    return form;
  },
  openModal() {
    const c = Composer.create({ plain: true, autofocus: true, placeholder: "What's happening?", onPosted: () => m.close() });
    const m = Modal.open({ title: 'Create post', content: c, size: 'md', className: 'modal-compose' });
    return m;
  },
};

/* --------------------------------- Comments -------------------------------- */
const Comments = {
  MAX: 300,
  /** Renders the comment thread + form inside `container`. onCount(n) is called whenever the total changes. */
  mount(container, post, { onCount, autofocus = false } = {}) {
    const me = Store.user || {};
    const isPostOwner = me._id === post.author._id;
    container.innerHTML = `<form class="comment-form" novalidate>${avatar(me, 'sm')}<div class="comment-input-wrap"><input type="text" placeholder="Write a comment…" aria-label="Write a comment" maxlength="${Comments.MAX}" autocomplete="off"><button class="btn btn-primary btn-sm" type="submit" disabled>Reply</button></div></form><div class="comment-error field-error" role="alert"></div><div class="comment-list"></div><div class="comment-foot"></div>`;
    const form = $('.comment-form', container), input = $('input', form), send = $('button', form);
    const list = $('.comment-list', container), foot = $('.comment-foot', container), errEl = $('.comment-error', container);
    let page = 1, loading = false;

    const empty = () => { if (!list.children.length && !foot.querySelector('button')) list.innerHTML = '<p class="comments-empty">No comments yet. Start the conversation.</p>'; };

    function commentEl(c) {
      const mine = me._id === c.author._id;
      const el = html(`<div class="comment" data-id="${c._id}">
        <a href="profile.html?username=${enc(c.author.username)}" aria-label="${esc(c.author.name)}'s profile">${avatar(c.author, 'sm')}</a>
        <div class="comment-main"><div class="comment-bubble">
          <div class="comment-top"><a class="comment-name" href="profile.html?username=${enc(c.author.username)}">${esc(c.author.name)}</a><time datetime="${c.createdAt}" title="${esc(fullDate(c.createdAt))}">${timeAgo(c.createdAt)}</time><span class="edited">${c.editedAt ? 'edited' : ''}</span></div>
          <div class="comment-text">${richText(c.text)}</div></div></div>
        ${mine || isPostOwner ? `<button class="btn-icon btn-icon-sm comment-more" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Comment options">${icon('more', 18)}</button>` : ''}</div>`);
      const more = $('.comment-more', el);
      if (more) more.onclick = () => Popover.menu(more, [
        mine && { label: 'Edit', icon: 'edit', onClick: () => startEdit() },
        { label: 'Delete', icon: 'trash', danger: true, onClick: () => remove() },
      ]);

      function startEdit() {
        const textEl = $('.comment-text', el);
        const box = html(`<form class="comment-edit"><input type="text" maxlength="${Comments.MAX}" value="${esc(c.text)}" aria-label="Edit comment"><button class="btn btn-primary btn-sm" type="submit">Save</button><button class="btn btn-ghost btn-sm" type="button">Cancel</button></form>`);
        const inp = $('input', box);
        textEl.replaceWith(box); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
        const cancel = () => box.replaceWith(textEl);
        $('.btn-ghost', box).onclick = cancel;
        inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } });
        box.addEventListener('submit', async (e) => {
          e.preventDefault();
          const text = inp.value.trim();
          if (!text) return Toast.error('Comment cannot be empty.');
          if (text === c.text) return cancel();
          const btn = $('.btn-primary', box); btn.disabled = true; btn.textContent = 'Saving…';
          try {
            const res = await Api.editComment(c._id, text);
            c.text = res.comment.text; c.editedAt = res.comment.editedAt;
            textEl.innerHTML = richText(c.text); $('.edited', el).textContent = 'edited';
            box.replaceWith(textEl); Toast.success('Comment updated');
          } catch (ex) { Toast.error(ex.message); btn.disabled = false; btn.textContent = 'Save'; }
        });
      }
      async function remove() {
        if (!(await confirmDialog({ title: 'Delete comment?', message: 'This comment will be permanently removed.', confirmText: 'Delete', danger: true }))) return;
        try {
          const res = await Api.deleteComment(c._id);
          el.classList.add('removing'); setTimeout(() => { el.remove(); empty(); }, 200);
          if (onCount) onCount(res.commentsCount);
          Toast.success('Comment deleted');
        } catch (ex) { Toast.error(ex.message); }
      }
      return el;
    }

    async function load() {
      if (loading) return; loading = true;
      if (page === 1) list.innerHTML = Skeleton.repeat(Skeleton.user, 2);
      foot.replaceChildren();
      try {
        const res = await Api.comments(post._id, page);
        if (page === 1) list.replaceChildren();
        res.comments.forEach((c) => list.appendChild(commentEl(c)));
        if (res.hasMore) {
          const b = html('<button class="btn btn-ghost btn-sm" type="button">Show more comments</button>');
          b.onclick = () => { page += 1; load(); };
          foot.appendChild(b);
        }
        page === 1 && empty();
      } catch (ex) {
        list.replaceChildren(stateBlock({ icon: 'alert', tone: 'error', title: "Couldn't load comments", text: ex.message, action: { label: 'Try again', primary: false, onClick: () => { page = 1; loading = false; load(); } } }));
      } finally { loading = false; }
    }

    input.addEventListener('input', () => { errEl.textContent = ''; send.disabled = !input.value.trim(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      send.disabled = true; send.textContent = 'Posting…'; input.disabled = true;
      try {
        const res = await Api.addComment(post._id, text);
        const emptyMsg = $('.comments-empty', list); if (emptyMsg) emptyMsg.remove();
        const el = commentEl(res.comment); el.classList.add('entering');
        list.prepend(el);
        input.value = '';
        if (onCount) onCount(res.commentsCount);
      } catch (ex) { errEl.textContent = (ex.fields && ex.fields.text) || ex.message; Toast.error(ex.message); }
      finally { input.disabled = false; send.textContent = 'Reply'; send.disabled = !input.value.trim(); input.focus(); }
    });

    load();
    if (autofocus) input.focus({ preventScroll: true });
  },
};

/* ---------------------------------- PostCard ------------------------------- */
async function copyPostLink(id) {
  if (await copyText(postUrl(id))) Toast.success('Post link copied');
  else Toast.error("Couldn't copy the link. Copy it from the address bar instead.");
}

const PostCard = {
  /**
   * opts: { onRemove(card), onUnsave(card), commentsOpen, showFollow }
   */
  create(post, opts = {}) {
    const me = Store.user || {};
    const isOwn = me._id === post.author._id;
    const showFollow = opts.showFollow !== false && !isOwn;
    const card = html(`<article class="card post" data-id="${post._id}" aria-label="Post by ${esc(post.author.name)}">
      <header class="post-head">
        <a class="post-avatar" href="profile.html?username=${enc(post.author.username)}" aria-label="${esc(post.author.name)}'s profile">${avatar(post.author, 'md')}</a>
        <div class="post-who">
          <div class="post-name-row"><a class="post-name" href="profile.html?username=${enc(post.author.username)}">${esc(post.author.name)}</a></div>
          <div class="post-sub"><span>@${esc(post.author.username)}</span><span class="dot" aria-hidden="true"></span><a class="post-time" href="post.html?id=${post._id}"><time datetime="${post.createdAt}" title="${esc(fullDate(post.createdAt))}">${timeAgo(post.createdAt)}</time></a><span class="edited"></span></div>
        </div>
        <button class="btn-icon post-more" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Post options">${icon('more')}</button>
      </header>
      <div class="post-text"></div>
      <div class="post-edit-slot"></div>
      <div class="post-media-slot"></div>
      <footer class="post-actions">
        <button class="act act-like" type="button" aria-pressed="false"><span class="act-ic"></span><span class="act-n"></span></button>
        <button class="act act-comment" type="button" aria-expanded="false"><span class="act-ic">${icon('comment')}</span><span class="act-n"></span></button>
        <button class="act act-share" type="button" aria-label="Share post"><span class="act-ic">${icon('share')}</span></button>
        <button class="act act-save" type="button" aria-pressed="false"><span class="act-ic"></span></button>
      </footer>
      <section class="post-comments hidden" aria-label="Comments"></section>
    </article>`);

    const $t = (s) => $(s, card);
    const textEl = $t('.post-text'), mediaSlot = $t('.post-media-slot'), editSlot = $t('.post-edit-slot');
    const likeBtn = $t('.act-like'), commentBtn = $t('.act-comment'), saveBtn = $t('.act-save'), commentsBox = $t('.post-comments');

    if (showFollow) $t('.post-name-row').appendChild(followButton({ username: post.author.username, isFollowing: post.isFollowingAuthor }, { small: true }));

    function paintBody() {
      textEl.innerHTML = richText(post.content);
      textEl.classList.toggle('hidden', !post.content);
      $t('.post-sub .edited').textContent = post.editedAt ? '· edited' : '';
      if (post.image) {
        const src = mediaUrl(post.image);
        mediaSlot.innerHTML = `<button class="post-media" type="button" aria-label="View image full size"><img src="${esc(src)}" alt="Image attached by ${esc(post.author.name)}" loading="lazy" decoding="async" data-fallback="media"></button>`;
        $('.post-media', mediaSlot).onclick = () => openLightbox(src, `Image by ${post.author.name}`);
      } else mediaSlot.replaceChildren();
    }
    function paintActions() {
      likeBtn.classList.toggle('on', post.likedByCurrentUser);
      likeBtn.setAttribute('aria-pressed', String(post.likedByCurrentUser));
      likeBtn.setAttribute('aria-label', `${post.likedByCurrentUser ? 'Unlike' : 'Like'}, ${post.likesCount} likes`);
      $('.act-ic', likeBtn).innerHTML = icon('heart', 20, { filled: post.likedByCurrentUser });
      $('.act-n', likeBtn).textContent = post.likesCount ? formatCount(post.likesCount) : '';
      $('.act-n', commentBtn).textContent = post.commentsCount ? formatCount(post.commentsCount) : '';
      commentBtn.setAttribute('aria-label', `Comments, ${post.commentsCount}`);
      saveBtn.classList.toggle('on', post.savedByCurrentUser);
      saveBtn.setAttribute('aria-pressed', String(post.savedByCurrentUser));
      saveBtn.setAttribute('aria-label', post.savedByCurrentUser ? 'Remove from saved' : 'Save post');
      $('.act-ic', saveBtn).innerHTML = icon('bookmark', 20, { filled: post.savedByCurrentUser });
    }
    const pop = (btn) => { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); };

    /* like (optimistic, rolls back on failure) */
    let likeBusy = false;
    likeBtn.onclick = async () => {
      if (likeBusy) return; likeBusy = true;
      const next = !post.likedByCurrentUser;
      post.likedByCurrentUser = next; post.likesCount += next ? 1 : -1; paintActions(); if (next) pop(likeBtn);
      try { const r = await Api.like(post._id, next); post.likesCount = r.likesCount; paintActions(); }
      catch (e) { post.likedByCurrentUser = !next; post.likesCount += next ? -1 : 1; paintActions(); Toast.error(e.message); }
      finally { likeBusy = false; }
    };

    /* save / unsave */
    let saveBusy = false;
    async function toggleSave() {
      if (saveBusy) return; saveBusy = true;
      const next = !post.savedByCurrentUser;
      post.savedByCurrentUser = next; paintActions(); if (next) pop(saveBtn);
      try {
        await Api.save(post._id, next);
        if (next) Toast.success('Saved to bookmarks', { action: { label: 'View', onClick: () => { location.href = 'saved.html'; } } });
        else { Toast.info('Removed from saved'); if (opts.onUnsave) opts.onUnsave(card); }
      } catch (e) { post.savedByCurrentUser = !next; paintActions(); Toast.error(e.message); }
      finally { saveBusy = false; }
    }
    saveBtn.onclick = toggleSave;

    /* comments */
    let commentsMounted = false;
    function toggleComments(force) {
      const open = force !== undefined ? force : commentsBox.classList.contains('hidden');
      commentsBox.classList.toggle('hidden', !open);
      commentBtn.setAttribute('aria-expanded', String(open));
      if (open && !commentsMounted) {
        commentsMounted = true;
        Comments.mount(commentsBox, post, { autofocus: true, onCount: (n) => { post.commentsCount = n; paintActions(); } });
      }
    }
    commentBtn.onclick = () => toggleComments();

    /* share */
    $t('.act-share').onclick = async () => {
      if (navigator.share) { try { await navigator.share({ title: `${post.author.name} on MiniSocial`, url: postUrl(post._id) }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      copyPostLink(post._id);
    };

    /* edit */
    function startEdit() {
      textEl.classList.add('hidden'); mediaSlot.classList.add('hidden');
      let removeImage = false;
      const form = html(`<form class="post-edit" novalidate><textarea rows="3" aria-label="Edit post text">${esc(post.content)}</textarea>${post.image ? `<label class="check"><input type="checkbox"> Remove image</label>` : ''}<p class="field-error" role="alert"></p><div class="post-edit-bar">${counterMarkup()}<span class="spacer"></span><button class="btn btn-ghost btn-sm" type="button" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" type="submit">Save</button></div></form>`);
      editSlot.replaceChildren(form);
      const ta = $('textarea', form), err = $('.field-error', form), counter = $('.counter', form);
      const cb = $('input[type=checkbox]', form);
      const upd = () => { paintCounter(counter, ta.value.length, Composer.MAX); autosize(ta); };
      ta.addEventListener('input', () => { err.textContent = ''; upd(); }); upd(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      if (cb) cb.onchange = () => { removeImage = cb.checked; };
      const stop = () => { editSlot.replaceChildren(); textEl.classList.toggle('hidden', !post.content); mediaSlot.classList.remove('hidden'); };
      $('[data-cancel]', form).onclick = stop;
      ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); stop(); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') form.requestSubmit(); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = ta.value.trim();
        const willHaveImage = post.image && !removeImage;
        if (!content && !willHaveImage) { err.textContent = 'Write something or keep the image.'; return; }
        if (ta.value.length > Composer.MAX) { err.textContent = `Posts cannot exceed ${Composer.MAX} characters.`; return; }
        const btn = $('.btn-primary', form); btn.disabled = true; btn.textContent = 'Saving…';
        try {
          const res = await Api.updatePost(post._id, { content, ...(removeImage ? { image: '' } : {}) });
          Object.assign(post, { content: res.post.content, image: res.post.image, hashtags: res.post.hashtags, editedAt: res.post.editedAt });
          stop(); paintBody(); Toast.success('Post updated');
        } catch (ex) { err.textContent = (ex.fields && ex.fields.content) || ex.message; btn.disabled = false; btn.textContent = 'Save'; }
      });
    }

    async function remove() {
      if (!(await confirmDialog({ title: 'Delete this post?', message: 'This will permanently remove the post, its comments and likes. This can’t be undone.', confirmText: 'Delete post', danger: true }))) return;
      try {
        await Api.deletePost(post._id);
        Toast.success('Post deleted');
        document.dispatchEvent(new CustomEvent('msm:post-deleted', { detail: post._id }));
        if (opts.onRemove) opts.onRemove(card); else { card.classList.add('removing'); setTimeout(() => card.remove(), 220); }
      } catch (e) { Toast.error(e.message); }
    }

    /* options menu */
    const moreBtn = $t('.post-more');
    moreBtn.onclick = () => {
      const followBtn = $(`[data-follow-user="${CSS.escape(post.author.username)}"]`, card);
      const following = followBtn ? followBtn.classList.contains('is-following') : post.isFollowingAuthor;
      Popover.menu(moreBtn, [
        isOwn && { label: 'Edit post', icon: 'edit', onClick: startEdit },
        { label: post.savedByCurrentUser ? 'Remove from saved' : 'Save post', icon: 'bookmark', onClick: toggleSave },
        { label: 'Copy link', icon: 'link', onClick: () => copyPostLink(post._id) },
        !isOwn && { label: `${following ? 'Unfollow' : 'Follow'} @${post.author.username}`, icon: following ? 'users' : 'user-plus', onClick: () => followBtn && followBtn.click() },
        isOwn && { divider: true },
        isOwn && { label: 'Delete post', icon: 'trash', danger: true, onClick: remove },
      ], { label: 'Post options' });
    };

    paintBody(); paintActions();
    if (opts.commentsOpen) toggleComments(true);
    card._toggleComments = toggleComments;
    return card;
  },
};
