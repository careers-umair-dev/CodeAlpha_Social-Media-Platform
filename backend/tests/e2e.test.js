/**
 * End-to-end API test. Requires the server to be running (npm start) against a THROWAWAY database.
 *   BASE_URL=http://localhost:5000/api node tests/e2e.test.js
 * Set RATE_LIMIT_DISABLED=true on the server while testing.
 */
const BASE = process.env.BASE_URL || 'http://localhost:5000/api';
const run = Date.now().toString(36);
let passed = 0, failed = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* binary */ }
  return { status: res.status, data, res };
}
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const section = (t) => console.log(`\n${t}`);

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

(async () => {
  const A = { name: 'Alice Test', username: `alice_${run}`, email: `alice_${run}@test.dev`, password: 'Passw0rdA1' };
  const B = { name: 'Bob Test', username: `bob_${run}`, email: `bob_${run}@test.dev`, password: 'Passw0rdB2' };
  let r;

  section('Registration & validation');
  r = await call('POST', '/auth/register', { body: { name: '', username: 'x', email: 'bad', password: '123' } });
  check('rejects invalid input with 422 + field errors', r.status === 422 && r.data.errors.username && r.data.errors.email && r.data.errors.password && r.data.errors.name, r.data);
  r = await call('POST', '/auth/register', { body: { ...A, password: 'allletters' } });
  check('rejects password without a number', r.status === 422 && r.data.errors.password);
  r = await call('POST', '/auth/register', { body: { ...A, username: 'admin' } });
  check('rejects reserved username', r.status === 422 && r.data.errors.username);
  r = await call('POST', '/auth/register', { body: { ...A, username: { $ne: '' } } });
  check('rejects NoSQL-injection object as username', r.status === 422, r.data);
  r = await call('POST', '/auth/register', { body: A });
  check('registers Alice (201, token, no password in response)', r.status === 201 && r.data.token && !JSON.stringify(r.data).includes('password'), r.data);
  const ta = r.data.token; const alice = r.data.user;
  r = await call('POST', '/auth/register', { body: A });
  check('duplicate email/username → 409', r.status === 409);
  r = await call('POST', '/auth/register', { body: B });
  const tb = r.data.token; const bob = r.data.user;
  check('registers Bob', r.status === 201);

  section('Login / session / protected routes');
  r = await call('POST', '/auth/login', { body: { emailOrUsername: A.username, password: 'wrongpass1' } });
  check('wrong password → 401 generic message', r.status === 401 && /incorrect/i.test(r.data.message));
  r = await call('POST', '/auth/login', { body: { emailOrUsername: { $gt: '' }, password: { $gt: '' } } });
  check('login rejects operator-injection payload', r.status === 422 || r.status === 401, r.status);
  r = await call('POST', '/auth/login', { body: { emailOrUsername: A.email.toUpperCase(), password: A.password } });
  check('login by email (case-insensitive)', r.status === 200 && r.data.token);
  r = await call('GET', '/auth/me');
  check('/auth/me without token → 401', r.status === 401);
  r = await call('GET', '/auth/me', { token: 'garbage.token.here' });
  check('/auth/me with bad token → 401', r.status === 401);
  r = await call('GET', '/auth/me', { token: ta });
  check('/auth/me with token → user', r.status === 200 && r.data.user.username === A.username);
  for (const [m, p] of [['POST', '/posts'], ['GET', '/posts/saved'], ['GET', '/notifications'], ['PUT', '/users/profile'], ['POST', `/users/${B.username}/follow`], ['GET', '/users/suggestions'], ['POST', '/media']]) {
    r = await call(m, p);
    check(`${m} ${p} requires auth`, r.status === 401);
  }
  r = await call('POST', '/auth/logout');
  check('logout endpoint OK', r.status === 200);

  section('Media upload');
  r = await call('POST', '/media', { token: ta, body: { dataUrl: 'data:image/png;base64,AAAA' } });
  check('rejects fake image bytes', r.status === 422, r.data);
  r = await call('POST', '/media', { token: ta, body: { dataUrl: 'data:text/html;base64,PGh0bWw+' } });
  check('rejects non-image mime', r.status === 422);
  r = await call('POST', '/media', { token: ta, body: { dataUrl: PNG } });
  check('uploads a valid PNG', r.status === 201 && /^\/api\/media\/[a-f0-9]{24}$/.test(r.data.url), r.data);
  const img1 = r.data.url;
  const served = await fetch(BASE.replace(/\/api$/, '') + img1);
  check('media is served with image content-type + nosniff', served.status === 200 && served.headers.get('content-type') === 'image/png' && served.headers.get('x-content-type-options') === 'nosniff');

  section('Posts: create / validate / edit / delete / ownership');
  r = await call('POST', '/posts', { token: ta, body: { content: '   ' } });
  check('empty post rejected', r.status === 422);
  r = await call('POST', '/posts', { token: ta, body: { content: 'x'.repeat(501) } });
  check('501-char post rejected', r.status === 422);
  r = await call('POST', '/posts', { token: ta, body: { content: `Hello world #Premium #launch_${run}` } });
  check('creates text post with hashtags', r.status === 201 && r.data.post.hashtags.includes('premium') && r.data.post.author.username === A.username, r.data);
  const p1 = r.data.post._id;
  r = await call('POST', '/posts', { token: ta, body: { content: 'With a picture', image: img1 } });
  check('creates image post', r.status === 201 && r.data.post.image === img1);
  const p2 = r.data.post._id;
  r = await call('POST', '/posts', { token: tb, body: { content: 'stealing', image: img1 } });
  check("cannot attach another user's upload", r.status === 422);
  r = await call('POST', '/posts', { token: ta, body: { image: img1 } });
  check('an upload cannot be attached to a second post', r.status === 422, r.data);
  r = await call('POST', '/posts', { token: tb, body: { content: `Bob's post about #premium` } });
  const pb = r.data.post._id;
  r = await call('PUT', `/posts/${p1}`, { token: tb, body: { content: 'hacked' } });
  check("editing someone else's post → 403", r.status === 403);
  r = await call('DELETE', `/posts/${p1}`, { token: tb });
  check("deleting someone else's post → 403", r.status === 403);
  r = await call('PUT', `/posts/${p1}`, { token: ta, body: { content: `Edited text #edited` } });
  check('owner can edit (editedAt set, hashtags refreshed)', r.status === 200 && r.data.post.editedAt && r.data.post.hashtags.join() === 'edited', r.data);
  r = await call('PUT', `/posts/${p2}`, { token: ta, body: { image: '' } });
  check('owner can remove image', r.status === 200 && r.data.post.image === '');
  const gone = await fetch(BASE.replace(/\/api$/, '') + img1);
  check('removed image is deleted from storage', gone.status === 404);
  r = await call('GET', '/posts/not-an-id');
  check('malformed id → 400', r.status === 400);
  r = await call('GET', '/posts/aaaaaaaaaaaaaaaaaaaaaaaa');
  check('unknown id → 404', r.status === 404);

  section('Likes (idempotent) & notifications');
  r = await call('POST', `/posts/${pb}/like`, { token: ta });
  check('Alice likes Bob’s post', r.status === 200 && r.data.liked && r.data.likesCount === 1);
  r = await call('POST', `/posts/${pb}/like`, { token: ta });
  check('double-like does not double count', r.data.likesCount === 1);
  r = await call('GET', '/notifications', { token: tb });
  check('Bob got a like notification (unread)', r.data.unreadCount === 1 && r.data.notifications[0].type === 'like' && r.data.notifications[0].actor.username === A.username && r.data.notifications[0].read === false, r.data);
  r = await call('POST', `/posts/${pb}/like`, { token: tb });
  r = await call('GET', '/notifications/unread-count', { token: tb });
  check('self-like creates no notification', r.data.unreadCount === 1);
  r = await call('DELETE', `/posts/${pb}/like`, { token: tb });
  r = await call('DELETE', `/posts/${pb}/like`, { token: ta });
  check('unlike works', r.status === 200 && r.data.likesCount === 0 && r.data.liked === false);
  r = await call('DELETE', `/posts/${pb}/like`, { token: ta });
  check('double-unlike does not go negative', r.data.likesCount === 0);
  r = await call('GET', '/notifications/unread-count', { token: tb });
  check('unlike removes the notification', r.data.unreadCount === 0);
  await call('POST', `/posts/${pb}/like`, { token: ta });

  section('Comments: add / edit / delete / permissions');
  r = await call('POST', `/posts/${pb}/comments`, { token: ta, body: { text: '' } });
  check('empty comment rejected', r.status === 422);
  r = await call('POST', `/posts/${pb}/comments`, { token: ta, body: { text: 'Nice one!' } });
  check('adds comment, count = 1', r.status === 201 && r.data.commentsCount === 1);
  const c1 = r.data.comment._id;
  r = await call('POST', `/posts/${pb}/comments`, { token: ta, body: { text: 'Second' } });
  const c2 = r.data.comment._id;
  r = await call('PUT', `/comments/${c1}`, { token: tb, body: { text: 'hack' } });
  check("cannot edit others' comment → 403", r.status === 403);
  r = await call('PUT', `/comments/${c1}`, { token: ta, body: { text: 'Nice one, edited' } });
  check('author can edit comment', r.status === 200 && r.data.comment.editedAt && r.data.comment.text === 'Nice one, edited');
  r = await call('GET', `/posts/${pb}/comments`);
  check('lists comments newest first (public)', r.status === 200 && r.data.comments.length === 2 && r.data.comments[0]._id === c2);
  r = await call('DELETE', `/comments/${c1}`, { token: tb });
  check('post owner can delete a comment on their post', r.status === 200 && r.data.commentsCount === 1);
  r = await call('POST', `/posts/${p1}/comments`, { token: tb, body: { text: 'other' } });
  const cx = r.data.comment._id;
  r = await call('DELETE', `/comments/${cx}`, { token: tb });
  check('comment author can delete own comment', r.status === 200 && r.data.commentsCount === 0);
  r = await call('GET', '/notifications', { token: tb });
  const types = r.data.notifications.map((n) => n.type).sort().join();
  check('Bob has like + comment notifications', types === 'comment,like', types);
  check('comment notification has preview text', r.data.notifications.find((n) => n.type === 'comment').text === 'Second', r.data.notifications);

  section('Follow / unfollow & counts');
  r = await call('POST', `/users/${B.username}/follow`, { token: tb });
  check('cannot follow yourself', r.status === 400);
  r = await call('POST', `/users/${B.username}/follow`, { token: ta });
  check('Alice follows Bob', r.status === 200 && r.data.followersCount === 1 && r.data.followingCount === 1);
  r = await call('POST', `/users/${B.username}/follow`, { token: ta });
  check('re-follow is idempotent (counts unchanged)', r.status === 200 && r.data.followersCount === 1);
  r = await call('GET', `/users/${B.username}`, { token: ta });
  check('profile shows isFollowing + postsCount, hides email', r.data.isFollowing === true && r.data.user.postsCount === 1 && r.data.user.email === undefined, r.data);
  r = await call('GET', `/users/${A.username}`, { token: ta });
  check('own profile flagged isOwnProfile & includes email', r.data.isOwnProfile === true && r.data.user.email === A.email);
  r = await call('GET', `/users/${B.username}/followers`, { token: ta });
  check('followers list', r.data.users.length === 1 && r.data.users[0].username === A.username);
  r = await call('GET', `/users/${A.username}/following`);
  check('following list (anonymous)', r.data.users.length === 1 && r.data.users[0].username === B.username);
  r = await call('GET', '/notifications', { token: tb });
  check('Bob got a follow notification', r.data.notifications.some((n) => n.type === 'follow'));
  r = await call('GET', '/users/suggestions', { token: ta });
  check('suggestions exclude self and followed', !r.data.users.some((u) => u.username === A.username || u.username === B.username));
  r = await call('GET', '/posts?feed=following', { token: ta });
  const ids = r.data.posts.map((p) => p._id);
  check('Following feed = Bob + own posts only', ids.includes(pb) && ids.includes(p1) && r.data.posts.every((p) => [A.username, B.username].includes(p.author.username)));
  r = await call('GET', '/posts?feed=following');
  check('Following feed requires auth', r.status === 401);
  r = await call('GET', '/posts?feed=foryou', { token: ta });
  check('For You feed returns posts', r.status === 200 && r.data.posts.length >= 2 && r.data.feed === 'foryou');
  r = await call('GET', '/posts?feed=latest&limit=2');
  check('Latest feed paginates with hasMore', r.data.posts.length === 2 && r.data.hasMore === true);
  r = await call('GET', '/posts?feed=latest&limit=2&page=2', { token: ta });
  check('page 2 works', r.status === 200 && r.data.posts.length >= 1);
  r = await call('DELETE', `/users/${B.username}/follow`, { token: ta });
  check('Alice unfollows Bob (counts back to 0)', r.status === 200 && r.data.followersCount === 0 && r.data.followingCount === 0);
  r = await call('DELETE', `/users/${B.username}/follow`, { token: ta });
  check('double-unfollow stays at 0', r.data.followersCount === 0);
  r = await call('GET', '/notifications', { token: tb });
  check('unfollow removes follow notification', !r.data.notifications.some((n) => n.type === 'follow'));
  await call('POST', `/users/${B.username}/follow`, { token: ta });

  section('Notifications read state');
  r = await call('GET', '/notifications', { token: tb });
  const unreadBefore = r.data.unreadCount;
  const first = r.data.notifications[0]._id;
  check('has unread notifications', unreadBefore >= 3, unreadBefore);
  r = await call('PATCH', `/notifications/${first}/read`, { token: tb });
  check('mark one read', r.status === 200 && r.data.unreadCount === unreadBefore - 1);
  r = await call('PATCH', `/notifications/${first}/read`, { token: ta });
  check("cannot mark someone else's notification", r.status === 404);
  r = await call('POST', '/notifications/read-all', { token: tb });
  r = await call('GET', '/notifications/unread-count', { token: tb });
  check('mark all read → 0', r.data.unreadCount === 0);

  section('Save / unsave');
  r = await call('POST', `/posts/${pb}/save`, { token: ta });
  check('saves post', r.status === 200 && r.data.saved === true);
  await call('POST', `/posts/${pb}/save`, { token: ta });
  r = await call('GET', '/posts/saved', { token: ta });
  check('saved list has it once, flagged saved', r.data.posts.length === 1 && r.data.posts[0]._id === pb && r.data.posts[0].savedByCurrentUser === true, r.data);
  r = await call('GET', '/posts/saved', { token: tb });
  check("saved list is per-user (Bob's is empty)", r.data.posts.length === 0);
  r = await call('DELETE', `/posts/${pb}/save`, { token: ta });
  r = await call('GET', '/posts/saved', { token: ta });
  check('unsave removes it', r.data.posts.length === 0);
  await call('POST', `/posts/${pb}/save`, { token: ta });

  section('Search & trending');
  r = await call('GET', '/search?q=a');
  check('short query rejected', r.status === 422);
  r = await call('GET', `/search?q=${encodeURIComponent(A.username)}`, { token: tb });
  check('finds users by username', r.data.users.some((u) => u.username === A.username));
  r = await call('GET', `/search?q=${encodeURIComponent("Bob's post")}`);
  check('finds posts by text', r.data.posts.some((p) => p._id === pb));
  r = await call('GET', `/search?q=${encodeURIComponent('#premium')}`);
  check('hashtag search', r.data.posts.length >= 1 && r.data.posts.every((p) => p.hashtags.includes('premium')), r.data.posts.map((p) => p.hashtags));
  r = await call('GET', `/search?q=${encodeURIComponent('.*')}`);
  check('regex characters are escaped (no match-all)', (r.data.posts || []).length === 0 && (r.data.users || []).length === 0);
  r = await call('GET', '/posts/trending');
  check('trending hashtags aggregate', r.status === 200 && r.data.tags.some((t) => t.tag === 'premium'), r.data);

  section('Profile update');
  r = await call('PUT', '/users/profile', { token: ta, body: { name: ' ', bio: 'x'.repeat(161) } });
  check('invalid profile → 422 with field errors', r.status === 422 && r.data.errors.name && r.data.errors.bio);
  r = await call('PUT', '/users/profile', { token: ta, body: { profileImage: 'javascript:alert(1)' } });
  check('javascript: avatar URL rejected', r.status === 422);
  r = await call('POST', '/media', { token: ta, body: { dataUrl: PNG } });
  const av = r.data.url;
  r = await call('PUT', '/users/profile', { token: ta, body: { name: 'Alice Updated', bio: 'Hello there', profileImage: av } });
  check('updates name/bio/avatar', r.status === 200 && r.data.user.name === 'Alice Updated' && r.data.user.profileImage === av);
  r = await call('PUT', '/users/profile', { token: ta, body: { username: 'hijack', email: 'x@y.zz', followersCount: 999 } });
  r = await call('GET', '/auth/me', { token: ta });
  check('mass-assignment blocked (username/email/counts unchanged)', r.data.user.username === A.username && r.data.user.email === A.email && r.data.user.followersCount === 0);
  r = await call('GET', `/users/${B.username}/posts?media=true`);
  check('user posts endpoint (media filter)', r.status === 200 && r.data.posts.length === 0);
  r = await call('GET', `/users/${A.username}/posts`);
  check('user posts endpoint', r.data.posts.length === 2, r.data.posts.length);

  section('Password change & session revocation');
  r = await call('PUT', '/auth/password', { token: ta, body: { currentPassword: 'nope', newPassword: 'NewPassw0rd9' } });
  check('wrong current password rejected', r.status === 422 && r.data.errors.currentPassword);
  r = await call('PUT', '/auth/password', { token: ta, body: { currentPassword: A.password, newPassword: 'short' } });
  check('weak new password rejected', r.status === 422);
  r = await call('PUT', '/auth/password', { token: ta, body: { currentPassword: A.password, newPassword: 'NewPassw0rd9' } });
  check('password changed, fresh token issued', r.status === 200 && r.data.token);
  const ta2 = r.data.token;
  r = await call('GET', '/auth/me', { token: ta });
  check('OLD token is revoked after password change', r.status === 401);
  r = await call('GET', '/auth/me', { token: ta2 });
  check('new token works', r.status === 200);
  r = await call('POST', '/auth/login', { body: { emailOrUsername: A.username, password: 'NewPassw0rd9' } });
  check('can log in with new password', r.status === 200);
  const ta3 = r.data.token;
  await call('POST', '/auth/logout-all', { token: ta3 });
  r = await call('GET', '/auth/me', { token: ta3 });
  check('logout-all revokes every token', r.status === 401);
  r = await call('POST', '/auth/login', { body: { emailOrUsername: A.username, password: 'NewPassw0rd9' } });
  const ta4 = r.data.token;

  section('Delete post / account cascade');
  r = await call('DELETE', `/posts/${p2}`, { token: ta4 });
  check('owner deletes post', r.status === 200);
  r = await call('GET', `/posts/${p2}`);
  check('deleted post → 404', r.status === 404);
  r = await call('DELETE', '/users/me', { token: ta4, body: { password: 'wrong' } });
  check('account deletion needs correct password', r.status === 422);
  r = await call('DELETE', '/users/me', { token: ta4, body: { password: 'NewPassw0rd9' } });
  check('deletes account', r.status === 200);
  r = await call('GET', `/users/${A.username}`);
  check('deleted user gone', r.status === 404);
  r = await call('GET', `/users/${B.username}`, { token: tb });
  check("Bob's follower count corrected after Alice left", r.data.user.followersCount === 0, r.data.user);
  r = await call('GET', `/posts/${pb}`, { token: tb });
  check("Alice's like/comments removed from Bob's post", r.data.post.likesCount === 0 && r.data.post.commentsCount === 0, r.data.post);
  r = await call('GET', '/notifications', { token: tb });
  check("Alice's notifications purged", r.data.notifications.length === 0, r.data.notifications.length);

  section('Error handling');
  r = await call('GET', '/nope');
  check('unknown API route → JSON 404', r.status === 404 && r.data.success === false);
  const bad = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  check('malformed JSON → 400 JSON (no stack trace)', bad.status === 400 && !(await bad.text()).includes('at '));

  await call('DELETE', '/users/me', { token: tb, body: { password: B.password } });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Test crashed:', e); process.exit(2); });
