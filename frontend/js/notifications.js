/** Notifications page. */
(async () => {
  const { main } = await App.boot({ page: 'notifications', title: 'Notifications' });
  let unreadOnly = false, list = null;
  main.innerHTML = `<div class="page-head"><div class="page-head-row"><h1 class="page-title">Notifications</h1><div class="head-actions"><button class="btn btn-soft btn-sm" type="button" id="read-all">Mark all read</button><button class="btn btn-ghost btn-sm" type="button" id="clear-all">Clear all</button></div></div>
    <div class="tabs" role="tablist" aria-label="Filter"><button class="tab" role="tab" data-f="all" aria-selected="true">All</button><button class="tab" role="tab" data-f="unread" aria-selected="false" tabindex="-1">Unread</button></div></div><div class="card notif-list" id="notif-list"></div>`;

  function load() {
    if (list) list.destroy();
    list = createList({
      container: $('#notif-list', main),
      fetch: async (page) => { const r = await Api.notifications(page, unreadOnly); Notifs.setCount(r.unreadCount); return { items: r.notifications, hasMore: r.hasMore }; },
      render: (n) => notificationItem(n), skeleton: Skeleton.user, skeletonCount: 5,
      empty: unreadOnly ? { icon: 'check-circle', title: 'No unread notifications', text: 'You’re all caught up.' } : { icon: 'bell', title: 'No notifications yet', text: 'When someone likes or comments on your posts, or follows you, it will show up here.' },
      errorTitle: "Couldn't load notifications",
    });
    list.load();
  }
  $('.tabs', main).addEventListener('click', (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    unreadOnly = t.dataset.f === 'unread';
    $$('.tab', main).forEach((b) => { b.setAttribute('aria-selected', b === t); b.tabIndex = b === t ? 0 : -1; });
    load();
  });
  $('#read-all', main).onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { await Api.markAllRead(); Notifs.setCount(0); load(); Toast.success('All caught up'); } catch (ex) { Toast.error(ex.message); }
    e.currentTarget.disabled = false;
  };
  $('#clear-all', main).onclick = async () => {
    if (!(await confirmDialog({ title: 'Clear all notifications?', message: 'This removes every notification. It can’t be undone.', confirmText: 'Clear all', danger: true }))) return;
    try { await Api.clearNotifications(); Notifs.setCount(0); load(); Toast.success('Notifications cleared'); } catch (ex) { Toast.error(ex.message); }
  };
  load();
})();
