# Parent Presence / Shared Children Deploy

2026-09-02T18:56:41Z committed 649f674 + pushed origin main (auto-deploy triggered)
- backend: kids.js/kidsParent.js canonical students.parent_id children, COALESCE(class_code,current_class)+class_name
- backend: e3fLive.js parent WS resolves phone+school_id from parents.user_id (fixes parent live connect)
- frontend: useParentPresence hook + ParentChildren realtime online/offline dots, badge, toasts
- verified: node --check OK, tsc --noEmit clean, vite build OK
- deploy.yml pushes to origin main, systemd restart + nginx rsync

