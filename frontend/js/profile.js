/** Profile page: header, follow, edit profile, posts + media tabs, follower lists. */
(async () => {
  const params = new URLSearchParams(location.search);
  const meName = (Store.user && Store.user.username) || '';
  const username = (params.get('username') || meName).toLowerCase();
  const { main } = await App.boot({ page: username === meName ? 'profile' : 'profile-other', title: 'Profile' });

  main.innerHTML = `<div class="page-head page-head-back"><a class="btn-icon" href="index.html" aria-label="Back to home" id="back">${icon('arrow-left')}</a><h1 class="page-title" id="head-title">Profile</h1></div>
    <div id="profile-slot"><section class="card profile"><div class="profile-cover sk"></div><div class="profile-body"><span class="sk sk-circle sk-xl"></span><span class="sk sk-line w40"></span><span class="sk sk-line w25"></span><span class="sk sk-line w80"></span></div></section></div><div id="profile-content"></div>`;
  $('#back', main).addEventListener('click', (e) => { if (history.length > 1 && document.referrer.startsWith(location.origin)) { e.preventDefault(); history.back(); } });

  let data;
  try {
    if (!username) throw Object.assign(new Error('No username given.'), { status: 404 });
    data = await Api.profile(username);
  } catch (e) {
    $('#profile-slot', main).replaceChildren(stateBlock(e.status === 404
      ? { icon: 'user', title: 'This account doesn’t exist', text: 'The username may be wrong, or the account was deleted.', action: { label: 'Back to home', href: 'index.html' } }
      : { icon: 'alert', tone: 'error', title: "Couldn't load this profile", text: e.message, action: { label: 'Try again', primary: false, onClick: () => location.reload() } }));
    return;
  }

  const user = data.user, own = data.isOwnProfile;
  document.title = `${user.name} (@${user.username}) · MiniSocial`;
  $('#head-title', main).textContent = user.name;
  const joined = new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const h1 = hueFor(user.username), h2 = (h1 + 55) % 360;

  const slot = $('#profile-slot', main);
  const header = html(`<section class="card profile" aria-label="Profile">
    <div class="profile-cover" style="--h1:${h1};--h2:${h2}"></div>
    <div class="profile-body">
      <div class="profile-top"><div class="profile-avatar" id="p-avatar"></div><div class="profile-actions"></div></div>
      <h2 class="profile-name" id="p-name"></h2>
      <p class="profile-handle">@${esc(user.username)}${data.followsYou ? ' <span class="pill">Follows you</span>' : ''}</p>
      <p class="profile-bio" id="p-bio"></p>
      <p class="profile-meta">${icon('calendar', 16)} Joined ${esc(joined)}</p>
      <div class="profile-stats">
        <div class="stat"><strong id="s-posts">${formatCount(user.postsCount)}</strong><span>Posts</span></div>
        <button class="stat" type="button" data-list="followers"><strong id="s-followers">${formatCount(user.followersCount)}</strong><span>Followers</span></button>
        <button class="stat" type="button" data-list="following"><strong id="s-following">${formatCount(user.followingCount)}</strong><span>Following</span></button>
      </div>
    </div></section>`);
  slot.replaceChildren(header);

  const paintIdentity = () => {
    $('#p-avatar', header).innerHTML = avatar(user, 'xl');
    $('#p-name', header).textContent = user.name;
    const bio = $('#p-bio', header);
    bio.innerHTML = user.bio ? richText(user.bio) : (own ? '<span class="muted">Add a short bio so people know who you are.</span>' : '');
    bio.classList.toggle('hidden', !user.bio && !own);
  };
  paintIdentity();

  const actions = $('.profile-actions', header);
  if (own) {
    const edit = html(`<button class="btn btn-soft" type="button">${icon('edit', 18)}<span>Edit profile</span></button>`);
    edit.onclick = openEditProfile; actions.appendChild(edit);
  } else actions.appendChild(followButton({ username: user.username, isFollowing: data.isFollowing }, { small: false }));

  document.addEventListener('msm:follow', (e) => {
    if (e.detail.username === user.username) $('#s-followers', header).textContent = formatCount(e.detail.followersCount);
    if (own) $('#s-following', header).textContent = formatCount(e.detail.followingCount);
  });
  document.addEventListener('msm:posted', () => { if (own) { user.postsCount += 1; $('#s-posts', header).textContent = formatCount(user.postsCount); } });
  document.addEventListener('msm:post-deleted', () => { if (own) { user.postsCount = Math.max(0, user.postsCount - 1); $('#s-posts', header).textContent = formatCount(user.postsCount); } });

  /* ---- tabs: Posts | Media ---- */
  let tab = 'posts', list = null;
  const content = $('#profile-content', main);
  content.innerHTML = `<div class="tabs tabs-sticky" role="tablist" aria-label="Profile sections"><button class="tab" role="tab" data-t="posts" aria-selected="true">${icon('list', 18)} Posts</button><button class="tab" role="tab" data-t="media" aria-selected="false" tabindex="-1">${icon('grid', 18)} Media</button></div><div id="tab-body"></div>`;
  const body = $('#tab-body', content);

  function loadTab() {
    if (list) list.destroy();
    const media = tab === 'media';
    list = createList({
      container: body,
      fetch: async (page) => { const r = await Api.userPosts(user.username, page, media); return { items: r.posts, hasMore: r.hasMore }; },
      render: media
        ? (p) => html(`<a class="grid-item" href="post.html?id=${p._id}" aria-label="Open photo post${p.content ? ': ' + esc(p.content.slice(0, 60)) : ''}"><img src="${esc(mediaUrl(p.image))}" alt="" loading="lazy" decoding="async" data-fallback="media"></a>`)
        : (p) => PostCard.create(p, { onRemove: (c) => list.removed(c), showFollow: false }),
      skeleton: media ? () => '<span class="sk sk-square"></span>' : undefined, skeletonCount: media ? 6 : 2,
      empty: media
        ? { icon: 'image', title: 'No photos yet', text: own ? 'Posts with an image will appear here.' : `@${user.username} hasn’t shared any photos.` }
        : own ? { icon: 'edit', title: 'You haven’t posted yet', text: 'Share your first thought or photo.', action: { label: 'Create a post', onClick: () => Composer.openModal() } }
              : { icon: 'comment', title: 'No posts yet', text: `@${user.username} hasn’t posted anything.` },
      errorTitle: "Couldn't load posts",
    });
    list.items.parentElement.classList.toggle('grid', media);
    list.load();
  }
  $('.tabs', content).addEventListener('click', (e) => {
    const t = e.target.closest('.tab'); if (!t || t.dataset.t === tab) return;
    tab = t.dataset.t;
    $$('.tab', content).forEach((b) => { b.setAttribute('aria-selected', b === t); b.tabIndex = b === t ? 0 : -1; });
    loadTab();
  });
  document.addEventListener('msm:posted', (e) => { if (own && tab === 'posts' && list) list.prepend(PostCard.create(e.detail, { onRemove: (c) => list.removed(c), showFollow: false })); });
  loadTab();

  /* ---- followers / following ---- */
  header.addEventListener('click', (e) => {
    const b = e.target.closest('[data-list]'); if (!b) return;
    const kind = b.dataset.list, box = html('<div class="follow-list"></div>');
    Modal.open({ title: kind === 'followers' ? 'Followers' : 'Following', content: box, size: 'md' });
    createList({
      container: box,
      fetch: async (page) => { const r = await (kind === 'followers' ? Api.followers : Api.following)(user.username, page); return { items: r.users, hasMore: r.hasMore }; },
      render: (u) => userRow(u), skeleton: Skeleton.user, skeletonCount: 4,
      empty: { icon: 'users', title: kind === 'followers' ? 'No followers yet' : 'Not following anyone yet', text: kind === 'followers' ? 'When people follow this account, they’ll show up here.' : 'Accounts they follow will show up here.' },
    }).load();
  });

  /* ---- edit profile ---- */
  function openEditProfile() {
    let newImage = null, removed = false;
    const form = html(`<form class="form" novalidate>
      <div class="avatar-edit"><div class="avatar-edit-preview"></div><div class="avatar-edit-actions"><button class="btn btn-soft btn-sm" type="button" data-pick>${icon('camera', 18)}<span>Change photo</span></button><button class="btn btn-ghost btn-sm" type="button" data-remove>Remove</button><input type="file" accept="image/jpeg,image/png,image/webp" hidden><p class="hint" id="photo-hint">JPG, PNG or WebP. Cropped to a square.</p></div></div>
      <div class="field"><label for="ep-name">Name</label><input id="ep-name" name="name" type="text" maxlength="50" autocomplete="name" value="${esc(user.name)}" required><p class="field-error" data-error-for="name" role="alert"></p></div>
      <div class="field"><label for="ep-bio">Bio</label><textarea id="ep-bio" name="bio" rows="3" maxlength="160" placeholder="Tell people about yourself">${esc(user.bio)}</textarea><div class="field-foot"><p class="field-error" data-error-for="bio" role="alert"></p><span class="hint" id="bio-count"></span></div></div>
      <p class="field-error form-error" data-error-for="profileImage" role="alert"></p>
      <div class="modal-actions"><button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save changes</button></div></form>`);
    const m = Modal.open({ title: 'Edit profile', content: form, size: 'md' });
    const preview = $('.avatar-edit-preview', form), file = $('input[type=file]', form), bio = $('#ep-bio', form);
    const paintPreview = () => {
      const base = removed ? { ...user, profileImage: '' } : user;
      preview.innerHTML = avatar(base, 'xl');
      if (newImage) { const a = $('.avatar', preview); const img = document.createElement('img'); img.src = newImage; img.alt = ''; a.appendChild(img); }
      $('[data-remove]', form).classList.toggle('hidden', !(newImage || (user.profileImage && !removed)));
    };
    const count = () => { $('#bio-count', form).textContent = `${bio.value.length}/160`; };
    const setErr = (k, msg) => { const el = $(`[data-error-for="${k}"]`, form); if (el) el.textContent = msg || ''; const inp = form.elements[k]; if (inp) inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); };
    paintPreview(); count();
    bio.addEventListener('input', () => { count(); setErr('bio', ''); });
    $('#ep-name', form).addEventListener('input', () => setErr('name', ''));
    $('[data-pick]', form).onclick = () => file.click();
    $('[data-remove]', form).onclick = () => { newImage = null; removed = true; file.value = ''; paintPreview(); };
    file.onchange = async () => {
      if (!file.files[0]) return;
      try { newImage = await processImage(file.files[0], { maxDim: 512 }); removed = false; setErr('profileImage', ''); paintPreview(); }
      catch (ex) { setErr('profileImage', ex.message); file.value = ''; }
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      ['name', 'bio', 'profileImage'].forEach((k) => setErr(k, ''));
      const name = form.elements.name.value.trim();
      if (!name) { setErr('name', 'Name cannot be empty.'); form.elements.name.focus(); return; }
      const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const payload = { name, bio: bio.value.trim() };
        if (newImage) payload.profileImage = (await Api.upload(newImage)).url;
        else if (removed) payload.profileImage = '';
        const res = await Api.updateProfile(payload);
        Object.assign(user, res.user); Store.setUser({ ...Store.user, ...res.user });
        document.dispatchEvent(new CustomEvent('msm:user', { detail: res.user }));
        paintIdentity(); $('#head-title', main).textContent = user.name; document.title = `${user.name} (@${user.username}) · MiniSocial`;
        m.close(); Toast.success('Profile updated');
      } catch (ex) {
        Object.entries(ex.fields || {}).forEach(([k, v]) => setErr(k, v));
        if (!ex.fields || !Object.keys(ex.fields).length) Toast.error(ex.message);
        btn.disabled = false; btn.textContent = 'Save changes';
      }
    });
  }
  if (own && params.get('edit') === '1') openEditProfile();
})();
