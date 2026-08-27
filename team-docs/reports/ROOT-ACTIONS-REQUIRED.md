# RUN AS ROOT (one-time, via Hostinger panel/root SSH)
# elite-cbt repo: token exposed WORLD-READABLE in git config
git -C /var/www/html/elite-cbt remote set-url origin https://github.com/eliteedtech/exam-app-backend.git
chmod 600 /var/www/html/elite-cbt/.git/config
chown -R dev:dev /var/www/html/elite-cbt   # optional, so dev agents can maintain it
# Then REVOKE all ghp_ PATs at github.com/settings/tokens (they appeared in session logs) and reissue scoped ones.
