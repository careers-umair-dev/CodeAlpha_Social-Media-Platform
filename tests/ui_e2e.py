# Browser end-to-end test (Playwright). Start the app first: cd backend && RATE_LIMIT_DISABLED=true npm start
import asyncio, time, io, traceback
from PIL import Image
from playwright.async_api import async_playwright, expect
BASE='http://localhost:5000'
run=str(int(time.time()))[-6:]
A=dict(name='Ada Lovelace',u='ada_'+run,e=f'ada{run}@t.dev',p='Passw0rd1')
B=dict(name='Ben Turing',u='ben_'+run,e=f'ben{run}@t.dev',p='Passw0rd2')
# test images
img=Image.new('RGB',(1800,1200)); 
for x in range(0,1800,6):
    for y in range(0,1200,6): img.paste((x%255,y%255,(x+y)%255),(x,y,x+6,y+6))
img.save('/tmp/test1.jpg','JPEG'); Image.new('RGB',(400,400),(200,80,120)).save('/tmp/avatar.png')
open('/tmp/notimage.jpg','wb').write(b'this is not an image')
results=[]; errs=[]
async def step(name, fn):
    try: await fn(); results.append((True,name)); print('  ✓',name)
    except Exception as ex:
        results.append((False,name)); print('  ✗',name,'->',str(ex).split('\n')[0][:220])
        try: await fn.__globals__['cur'].screenshot(path=f'/tmp/shots/FAIL-{len(results)}.png')
        except Exception: pass
async def register(ctx,u):
    page=await ctx.new_page()
    page.on('console', lambda m: errs.append(f'[{u["u"]}] {m.type}: {m.text} @ {page.url}') if m.type=='error' else None)
    page.on('pageerror', lambda e: errs.append(f'[{u["u"]}] PAGEERROR {e}'))
    await page.goto(BASE+'/register.html')
    await page.fill('#name',u['name']); await page.fill('#username',u['u']); await page.fill('#email',u['e'])
    await page.fill('#password',u['p']); await page.fill('#confirmPassword',u['p'])
    await page.click('button[type=submit]'); await page.wait_for_url('**/index.html'); await page.wait_for_selector('.composer')
    return page
async def main():
    global cur
    async with async_playwright() as p:
        br=await p.chromium.launch()
        ca=await br.new_context(viewport={'width':1366,'height':860}); cb=await br.new_context(viewport={'width':1366,'height':860})
        await ca.grant_permissions(['clipboard-read','clipboard-write'])
        print('AUTH')
        pg=await ca.new_page(); cur=pg
        pg.on('console', lambda m: errs.append(f'[anon] {m.type}: {m.text}') if m.type=='error' and 'status of 401' not in m.text else None)
        async def reg_validation():
            await pg.goto(BASE+'/register.html'); await pg.click('button[type=submit]')
            await expect(pg.locator('[data-error-for=name]')).to_have_text('Please enter your name.')
            await pg.fill('#name','X'); await pg.fill('#username','ab'); await pg.fill('#email','nope'); await pg.fill('#password','abc'); await pg.fill('#confirmPassword','zzz')
            await pg.click('button[type=submit]')
            for f in ['username','email','password','confirmPassword']:
                assert (await pg.locator(f'[data-error-for={f}]').inner_text()).strip(), f
        await step('register form shows inline validation errors', reg_validation)
        async def login_bad():
            await pg.goto(BASE+'/login.html'); await pg.fill('#emailOrUsername','nobody'); await pg.fill('#password','Wrongpass1'); await pg.click('button[type=submit]')
            await expect(pg.locator('.form-alert')).to_contain_text('Incorrect')
        await step('login with wrong credentials shows friendly error', login_bad)
        async def pw_toggle():
            await pg.fill('#password','secret12'); await pg.click('[data-toggle-pw=password]')
            assert await pg.get_attribute('#password','type')=='text'
        await step('password visibility toggle works', pw_toggle)
        pa=await register(ca,A); cur=pa
        await step('A registered via UI and landed on feed', lambda: expect(pa.locator('.page-title')).to_have_text('Home'))
        pb=await register(cb,B)

        print('POSTS')
        async def counter():
            ta=pa.locator('.composer textarea').first
            await ta.fill('x'*460); await expect(pa.locator('.composer .counter-num').first).to_have_text('40')
            await ta.fill('x'*501); await expect(pa.locator('.composer button[type=submit]').first).to_be_disabled()
            assert 'over' in (await pa.locator('.composer .counter').first.get_attribute('class'))
            await ta.fill('')
            await expect(pa.locator('.composer button[type=submit]').first).to_be_disabled()
        await step('character counter, over-limit + empty disable Post', counter)
        async def text_post():
            await pa.locator('.composer textarea').first.fill('Hello from Ada! #premium #launch')
            await pa.locator('.composer button[type=submit]').first.click()
            await expect(pa.locator('.post').first.locator('.post-text')).to_contain_text('Hello from Ada')
            await expect(pa.locator('.toast-success')).to_contain_text('Post published')
            await expect(pa.locator('.post').first.locator('a.tag').first).to_have_text('#premium')
        await step('create text post (prepended, toast, hashtag link)', text_post)
        async def bad_image():
            await pa.click('.top-post'); await pa.wait_for_selector('.modal-compose')
            await pa.set_input_files('.modal-compose input[type=file]','/tmp/notimage.jpg')
            await expect(pa.locator('.modal-compose .field-error')).not_to_be_empty()
            await pa.keyboard.press('Escape'); await expect(pa.locator('.modal-compose')).to_have_count(0)
        await step('invalid image rejected; Esc closes modal', bad_image)
        async def image_post():
            await pa.click('.top-post'); await pa.wait_for_selector('.modal-compose')
            await pa.set_input_files('.modal-compose input[type=file]','/tmp/test1.jpg')
            await expect(pa.locator('.modal-compose .composer-preview img')).to_be_visible()
            await pa.click('.modal-compose .preview-x'); await expect(pa.locator('.modal-compose .composer-preview')).to_be_hidden()
            await pa.set_input_files('.modal-compose input[type=file]','/tmp/test1.jpg')
            await pa.locator('.modal-compose textarea').fill('A picture post')
            await pa.click('.modal-compose button[type=submit]')
            await expect(pa.locator('.modal-compose')).to_have_count(0, timeout=10000)
            im=pa.locator('.post').first.locator('.post-media img'); await expect(im).to_be_visible()
            await pa.wait_for_function("document.querySelector('.post .post-media img').naturalWidth>0")
        await step('image post: preview, remove, re-add, upload, renders', image_post)
        async def lightbox():
            await pa.locator('.post').first.locator('.post-media').click(); await expect(pa.locator('.lightbox img')).to_be_visible()
            await pa.keyboard.press('Escape'); await expect(pa.locator('.lightbox')).to_have_count(0)
        await step('lightbox opens on image click and closes with Esc', lightbox)
        async def edit_post():
            post=pa.locator('.post').nth(1)  # text post
            await post.locator('.post-more').click(); await pa.get_by_role('menuitem',name='Edit post').click()
            ta=post.locator('.post-edit textarea'); await ta.fill('Edited by Ada #edited'); await post.locator('.post-edit button[type=submit]').click()
            await expect(post.locator('.post-text')).to_contain_text('Edited by Ada'); await expect(post.locator('.post-sub .edited')).to_have_text('· edited')
        await step('edit own post inline (shows edited)', edit_post)
        async def menu_other():
            await pb.reload(); await pb.wait_for_selector('.post')
            first=pb.locator('.post').first; await first.locator('.post-more').click()
            items=await pb.locator('[role=menuitem]').all_inner_texts()
            assert not any('Delete' in i or 'Edit' in i for i in items), items
            await pb.keyboard.press('Escape')
        await step("other users don't get edit/delete options", menu_other)

        print('SOCIAL')
        async def follow_via_profile():
            await pb.goto(f'{BASE}/profile.html?username={A["u"]}'); await pb.wait_for_selector('.profile-name')
            await expect(pb.locator('#s-followers')).to_have_text('0')
            await pb.locator('.profile-actions .follow-btn').click()
            await expect(pb.locator('#s-followers')).to_have_text('1'); await expect(pb.locator('.profile-actions .follow-btn')).to_have_class(__import__('re').compile('is-following'))
        await step('B follows A from profile (button + count update)', follow_via_profile)
        async def like_comment():
            await pb.goto(f'{BASE}/index.html'); await pb.click('#tab-latest'); await pb.wait_for_selector('.post')
            post=pb.locator('.post',has_text='A picture post').first
            await post.locator('.act-like').click(); await expect(post.locator('.act-like')).to_have_class(__import__('re').compile(r'\bon\b'))
            await expect(post.locator('.act-like .act-n')).to_have_text('1')
            await post.locator('.act-comment').click(); await post.locator('.comment-input-wrap input').fill('Great photo!'); await post.locator('.comment-form button').click()
            await expect(post.locator('.comment-text')).to_have_text('Great photo!'); await expect(post.locator('.act-comment .act-n')).to_have_text('1')
        await step('B likes (optimistic) and comments on A’s post', like_comment)
        async def like_persist():
            await pb.reload(); await pb.click('#tab-latest'); post=pb.locator('.post',has_text='A picture post').first
            await expect(post.locator('.act-like')).to_have_class(__import__('re').compile(r'\bon\b')); await expect(post.locator('.act-comment .act-n')).to_have_text('1')
        await step('like + comment count persist after reload (MongoDB sync)', like_persist)
        async def unlike():
            post=pb.locator('.post',has_text='A picture post').first
            await post.locator('.act-like').click(); await expect(post.locator('.act-like .act-n')).to_have_count(1) ; await expect(post.locator('.act-like')).not_to_have_class(__import__('re').compile(r'\bon\b'))
            await post.locator('.act-like').click()
        await step('unlike then like again', unlike)
        async def comment_edit_delete():
            post=pb.locator('.post',has_text='A picture post').first
            await post.locator('.act-comment').click(); await post.locator('.comment-more').wait_for()
            await post.locator('.comment-more').click(); await pb.get_by_role('menuitem',name='Edit').click()
            await post.locator('.comment-edit input').fill('Great photo, edited'); await post.locator('.comment-edit button[type=submit]').click()
            await expect(post.locator('.comment-text')).to_have_text('Great photo, edited'); await expect(post.locator('.comment .edited')).to_have_text('edited')
            await post.locator('.comment-more').click(); await pb.get_by_role('menuitem',name='Delete').click()
            await pb.locator('.modal [data-ok]').click(); await expect(post.locator('.comment')).to_have_count(0)
            await expect(post.locator('.act-comment .act-n')).to_have_count(1); 
            await post.locator('.comment-input-wrap input').fill('Final comment'); await post.locator('.comment-form button').click(); await expect(post.locator('.comment-text')).to_have_text('Final comment')
        await step('B edits and deletes own comment (confirm dialog), adds another', comment_edit_delete)
        async def save_flow():
            post=pb.locator('.post',has_text='A picture post').first
            await post.locator('.act-save').click(); await expect(post.locator('.act-save')).to_have_class(__import__('re').compile(r'\bon\b'))
            await pb.goto(BASE+'/saved.html'); await expect(pb.locator('.post',has_text='A picture post')).to_have_count(1)
            await pb.locator('.post .act-save').first.click(); await expect(pb.locator('.post')).to_have_count(0); await expect(pb.locator('.state h3')).to_have_text('No saved posts yet')
        await step('save → appears in Saved; unsave removes it; empty state', save_flow)
        async def share():
            await pb.goto(BASE+'/index.html'); await pb.click('#tab-latest'); await pb.wait_for_selector('.post')
            await pb.evaluate("navigator.share = undefined"); await pb.locator('.act-share').first.click(); await expect(pb.locator('.toast')).to_contain_text('link copied')
        await step('share copies link with toast', share)
        async def post_page():
            await pb.goto(BASE+'/index.html'); await pb.click('#tab-latest'); await pb.wait_for_selector('.post')
            await pb.locator('.post-time').first.click(); await pb.wait_for_url('**/post.html?id=*'); await expect(pb.locator('.post')).to_have_count(1)
            await pb.goto(BASE+'/post.html?id=aaaaaaaaaaaaaaaaaaaaaaaa'); await expect(pb.locator('.state h3')).to_contain_text('isn’t available')
        await step('post permalink page + not-found state', post_page)

        print('NOTIFICATIONS')
        async def notif_badge():
            cur_=pa; await pa.goto(BASE+'/index.html'); await pa.wait_for_selector('.post')
            badge=pa.locator('#bell-btn [data-badge]'); await expect(badge).to_be_visible(); n=int(await badge.inner_text()); assert n>=3, n
        await step('A sees unread badge (follow + like + comments)', notif_badge)
        async def notif_panel():
            await pa.click('#bell-btn'); await pa.wait_for_selector('.notif-panel .notif')
            texts=await pa.locator('.notif-panel .notif-line').all_inner_texts()
            assert any('following' in t for t in texts) and any('liked' in t for t in texts) and any('commented' in t for t in texts), texts
            await pa.screenshot(path='/tmp/shots/10-notif-panel.png')
            await pa.click('[data-readall]'); await expect(pa.locator('#bell-btn [data-badge]')).to_be_hidden()
            await pa.keyboard.press('Escape')
        await step('notification dropdown lists all 3 types; mark all read clears badge', notif_panel)
        async def notif_page():
            await pa.goto(BASE+'/notifications.html'); await pa.wait_for_selector('.notif')
            assert await pa.locator('.notif.unread').count()==0
            await pa.click('[data-f=unread]'); await expect(pa.locator('.state h3')).to_have_text('No unread notifications')
            await pa.click('[data-f=all]'); await pa.wait_for_selector('.notif')
            await pa.locator('.notif',has_text='liked').first.click(); await pa.wait_for_url('**/post.html?id=*')
        await step('notifications page: filters, read state, click opens the post', notif_page)
        async def unread_click():
            await pb.goto(BASE+'/index.html'); await pa.goto(BASE+'/index.html')
            post=pb.locator('.post',has_text='A picture post').first
            await pb.click('#tab-latest'); post=pb.locator('.post',has_text='A picture post').first; await post.locator('.act-like').click() # unlike (was liked)
            await post.locator('.act-like').click() # like again -> fresh notification for A
            await pa.wait_for_timeout(300); await pa.goto(BASE+'/notifications.html'); await pa.wait_for_selector('.notif.unread')
            await pa.locator('.notif.unread').first.click(); await pa.wait_for_url('**/post.html?id=*')
            await pa.goto(BASE+'/notifications.html'); await pa.wait_for_selector('.notif'); assert await pa.locator('.notif.unread').count()==0
        await step('clicking an unread notification marks it read', unread_click)

        print('SEARCH')
        async def topsearch():
            await pb.goto(BASE+'/index.html'); await pb.keyboard.press('/'); await pb.keyboard.type(A['u'][:8])
            await pb.wait_for_selector('.tsearch-pop .ts-item'); await pb.screenshot(path='/tmp/shots/11-topsearch.png')
            await pb.keyboard.press('ArrowDown'); await pb.keyboard.press('Enter'); await pb.wait_for_url('**/profile.html?username=*')
        await step('"/" focuses search; dropdown w/ keyboard nav opens profile', topsearch)
        async def search_page():
            await pb.goto(f'{BASE}/search.html'); await expect(pb.locator('.idle')).to_be_visible()
            await pb.fill('#q','Ada'); await pb.wait_for_selector('.people-card .user-row'); await pb.wait_for_selector('.post')
            await pb.click('[data-t=users]'); await expect(pb.locator('.post')).to_have_count(0)
            await pb.click('[data-t=posts]'); await pb.wait_for_selector('.post'); await expect(pb.locator('.people-card')).to_have_count(0)
            await pb.click('[data-t=all]'); await pb.fill('#q','#premium'); await pb.wait_for_selector('.post a.tag')
            await pb.fill('#q','zzzzqqqq'); await expect(pb.locator('.state h3')).to_contain_text('No results')
            await pb.fill('#q','a'); await expect(pb.locator('.hint')).to_contain_text('at least 2')
        await step('search page: idle, people+posts, tabs, #hashtag, empty, too short', search_page)

        print('PROFILE')
        async def edit_profile():
            await pa.goto(f'{BASE}/profile.html?username={A["u"]}'); await pa.wait_for_selector('.profile-name')
            assert await pa.locator('.profile-actions .follow-btn').count()==0
            await pa.get_by_role('button',name='Edit profile').click(); await pa.wait_for_selector('.modal form')
            await pa.fill('#ep-name',''); await pa.click('.modal button[type=submit]'); await expect(pa.locator('[data-error-for=name]')).to_have_text('Name cannot be empty.')
            await pa.fill('#ep-name','Ada King'); await pa.fill('#ep-bio','Mathematician. Loves #code'); 
            await pa.set_input_files('.modal input[type=file]','/tmp/avatar.png'); await pa.wait_for_selector('.avatar-edit-preview img')
            await pa.click('.modal button[type=submit]'); await expect(pa.locator('.modal')).to_have_count(0,timeout=10000)
            await expect(pa.locator('#p-name')).to_have_text('Ada King'); await expect(pa.locator('#p-bio')).to_contain_text('Mathematician')
            await pa.wait_for_function("document.querySelector('#p-avatar img') && document.querySelector('#p-avatar img').naturalWidth>0")
        await step('edit profile: validation, name/bio/avatar save, UI updates', edit_profile)
        async def profile_persist():
            await pa.reload(); await expect(pa.locator('#p-name')).to_have_text('Ada King')
            await expect(pa.locator('#user-btn img')).to_be_visible()
            await expect(pa.locator('#s-posts')).to_have_text('2')
        await step('profile changes persist after reload; counts correct', profile_persist)
        async def tabs_media():
            await pa.click('[data-t=media]'); await pa.wait_for_selector('.grid-item'); assert await pa.locator('.grid-item').count()==1
            await pa.screenshot(path='/tmp/shots/12-profile-media.png'); await pa.click('[data-t=posts]'); await pa.wait_for_selector('.post')
        await step('profile Media grid tab and Posts tab', tabs_media)
        async def follow_lists():
            await pb.goto(f'{BASE}/profile.html?username={A["u"]}'); await pb.wait_for_selector('.profile-name')
            await pb.click('[data-list=followers]'); await pb.wait_for_selector('.modal .user-row'); await expect(pb.locator('.modal .user-row')).to_have_count(1)
            await pb.keyboard.press('Escape')
            await pb.locator('.profile-actions .follow-btn').click(); await expect(pb.locator('#s-followers')).to_have_text('0')
            await expect(pb.locator('.profile-actions .follow-btn')).not_to_have_class(__import__('re').compile('is-following'))
            await pb.locator('.profile-actions .follow-btn').click(); await expect(pb.locator('#s-followers')).to_have_text('1')
        await step('followers modal; unfollow/follow toggles count', follow_lists)
        async def nonexistent():
            await pb.goto(BASE+'/profile.html?username=ghost_nobody'); await expect(pb.locator('.state h3')).to_contain_text('doesn’t exist')
        await step('unknown profile shows not-found state', nonexistent)
        async def feeds():
            await pb.goto(BASE+'/index.html'); await pb.wait_for_selector('.post')
            await pb.click('#tab-following'); await pb.wait_for_selector('.post'); names=await pb.locator('.post .post-name').all_inner_texts()
            assert all(n in ('Ada King','Ben Turing') for n in names), names
            await pb.keyboard.press('ArrowRight') if False else None
        await step('Following feed only shows followed users (+self)', feeds)

        print('SETTINGS / THEME')
        async def theme():
            await pa.goto(BASE+'/index.html'); await pa.wait_for_selector('.composer')
            assert await pa.evaluate("document.documentElement.dataset.theme")=='light'
            await pa.click('#theme-btn'); assert await pa.evaluate("document.documentElement.dataset.theme")=='dark'
            await pa.reload(); assert await pa.evaluate("document.documentElement.dataset.theme")=='dark'
            await pa.wait_for_selector('.post'); await pa.screenshot(path='/tmp/shots/13-dark-home.png')
        await step('dark mode toggle persists across reload', theme)
        async def settings():
            await pa.goto(BASE+'/settings.html'); await pa.wait_for_selector('.theme-opt')
            await pa.screenshot(path='/tmp/shots/14-settings-dark.png')
            await pa.click('[data-theme-opt=light]'); assert await pa.evaluate("document.documentElement.dataset.theme")=='light'
            await expect(pa.locator('[data-theme-opt=light]')).to_have_attribute('aria-checked','true')
            await pa.click('[data-theme-opt=system]'); assert await pa.evaluate("localStorage.getItem('msm_theme')")=='system'
            await pa.click('[data-theme-opt=light]')
        await step('settings theme picker (light/dark/system) persists', settings)
        async def pwchange():
            await pa.fill('#pw-cur','wrong'); await pa.fill('#pw-new','NewPassw0rd9'); await pa.fill('#pw-conf','NewPassw0rd9'); await pa.click('#pw-form button[type=submit]')
            await expect(pa.locator('[data-error-for=currentPassword]')).to_contain_text('incorrect')
            await pa.fill('#pw-conf','mismatch'); await pa.click('#pw-form button[type=submit]'); await expect(pa.locator('[data-error-for=confirm]')).to_contain_text('match')
            await pa.fill('#pw-cur',A['p']); await pa.fill('#pw-conf','NewPassw0rd9'); await pa.click('#pw-form button[type=submit]')
            await expect(pa.locator('.toast-success')).to_contain_text('Password updated'); A['p']='NewPassw0rd9'
        await step('change password: server + client validation, success toast', pwchange)

        print('DELETE / LOGOUT / PROTECTED')
        async def delete_post():
            await pa.goto(BASE+'/index.html'); await pa.click('#tab-latest'); await pa.wait_for_selector('.post')
            post=pa.locator('.post',has_text='A picture post').first
            await post.locator('.post-more').click(); await pa.get_by_role('menuitem',name='Delete post').click()
            await expect(pa.locator('.modal-title')).to_have_text('Delete this post?')
            await pa.get_by_role('button',name='Cancel').click(); await expect(post).to_be_visible()
            await post.locator('.post-more').click(); await pa.get_by_role('menuitem',name='Delete post').click(); await pa.locator('.modal [data-ok]').click()
            await expect(pa.locator('.post',has_text='A picture post')).to_have_count(0); await expect(pa.locator('.toast-success').last).to_contain_text('deleted')
        await step('delete post: confirm dialog (cancel keeps, confirm removes)', delete_post)
        async def focus_trap():
            await pa.click('.side-post'); await pa.wait_for_selector('.modal-compose')
            for _ in range(8): await pa.keyboard.press('Tab')
            inside=await pa.evaluate("document.querySelector('.modal').contains(document.activeElement)"); assert inside
            await pa.keyboard.press('Escape'); await expect(pa.locator('.modal')).to_have_count(0)
        await step('modal traps keyboard focus and Esc closes', focus_trap)
        async def logout():
            await pa.click('#user-btn'); await pa.get_by_role('menuitem',name='Log out').click(); await pa.wait_for_url('**/login.html*')
            assert await pa.evaluate("localStorage.getItem('msm_token')") is None
            await pa.goto(BASE+'/settings.html'); await pa.wait_for_url('**/login.html?next=settings.html')
        await step('logout clears session; protected page redirects with ?next', logout)
        async def relogin():
            await pa.fill('#emailOrUsername',A['u']); await pa.fill('#password',A['p']); await pa.click('button[type=submit]'); await pa.wait_for_url('**/settings.html')
        await step('login honors ?next and new password works', relogin)
        async def revoked():
            tok=await pa.evaluate("localStorage.getItem('msm_token')"); await pa.click('#logout-all'); await pa.locator('.modal [data-ok]').click(); await pa.wait_for_url('**/login.html*')
            r=await pa.request.get(BASE+'/api/auth/me',headers={'Authorization':'Bearer '+tok}); assert r.status==401
        await step('"log out everywhere" revokes the token server-side', revoked)
        await pa.fill('#emailOrUsername',A['u']); await pa.fill('#password',A['p']); await pa.click('button[type=submit]'); await pa.wait_for_url('**/index.html')
        async def expired_session():
            await pa.evaluate("localStorage.setItem('msm_token','bad.token.value')"); await pa.goto(BASE+'/index.html'); await pa.wait_for_url('**/login.html*'); await expect(pa.locator('.toast')).to_contain_text('session')
        await step('invalid/expired token → redirect to login with message', expired_session)
        async def delete_account():
            await pb.goto(BASE+'/settings.html'); await pb.click('#delete-btn'); await pb.fill('#del-pw','wrongpass'); await pb.click('.modal button[type=submit]')
            await expect(pb.locator('.modal .field-error')).to_contain_text('incorrect'); await pb.fill('#del-pw',B['p']); await pb.click('.modal button[type=submit]'); await pb.wait_for_url('**/login.html*')
            r=await pb.request.post(BASE+'/api/auth/login',data={'emailOrUsername':B['u'],'password':B['p']}); assert r.status==401
        await step('delete account requires password, removes the user', delete_account)
        print('\nCONSOLE ERRORS:', errs or 'none')
        ok=sum(1 for r in results if r[0]); print(f'\n{ok} passed, {len(results)-ok} failed')
        await br.close()
asyncio.run(main())
