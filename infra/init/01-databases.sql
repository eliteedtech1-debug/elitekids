-- Local-dev only: ensure the addon databases exist (production already has them).
-- elite-kids writes addon tables to elite_content and the AI DB — never to elite_db.
-- The AI DB is named elite_bot to match the prod server (no elite_ai exists there;
-- see 01-PLANNING/09-DECISIONS-LOG.md DEC-002).
CREATE DATABASE IF NOT EXISTS elite_content CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS elite_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Grant the same app user access to the addon DBs (matches compose env).
GRANT ALL PRIVILEGES ON elite_content.* TO 'elite'@'%';
GRANT ALL PRIVILEGES ON elite_bot.* TO 'elite'@'%';
FLUSH PRIVILEGES;
