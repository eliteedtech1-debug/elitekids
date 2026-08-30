# BRIEF B2-EXEC — FIX MEDIA SAVE-TO-BUCKET (executor: opencode/big-pickle, tmux:b2)

Context: reports/media-b2-test-report.md proved auto-save NEVER uploaded: no B2_* env -> silent local-disk fallback; retrieval 301->404. Env vars NOW EXIST in backend/.env (B2_ENDPOINT/REGION/KEY_ID/APPLICATION_KEY/BUCKET_BOT/DOC/MEDIA). If team-docs/reports/b2-remediation-spec.md exists, honor it; else proceed.

## Deliverables
1. backend/src/storage/s3Client.js implementing supervisor pattern: S3Client(endpoint B2_ENDPOINT, region, credentials from env) + uploadFile/uploadMediaFile/downloadFile/deleteFile/getFileUrl(presigned). npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp in backend/.
2. uploadMediaFile: images -> sharp rotate()->resize(width<=1600)->webp q75 + 300px thumb webp; non-images passthrough. Sync processing (NO BullMQ/Redis yet).
3. Wire routes/media.js save-opensource + game-publish hook: use s3Client when isB2Configured(); DELETE the silent local-disk fallback — missing config must throw at BOOT (loud validation in index.js after env load).
4. Retrieval: buckets are PRIVATE. New GET route returns short-lived presigned URL (or streams); update kids-web media URL builder accordingly.
5. Re-run the original live functional test flow from media-b2-test-report.md until every stage reads PASS; append new section 'RETEST 2026-08-23' to that report.

## Rules
- Creds ONLY via process.env (already in .env). Never hardcode, never log values.
- Restate C1+C2 if models/migrations touched (DEFAULTs mandatory). C4: outputs only in team-docs/.
- NO git commits/pushes. Checkpoint EVERY step to team-docs/reports/b2-progress.md.

## UPDATE (supervisor, 2026-08-23): QUEUE IS MANDATORY
Redis 7.0.15 already runs on this host (127.0.0.1:6379, systemd active). Implement the async path:
6. backend/src/queue/queue.js -> BullMQ 'media-processing' queue (connection 127.0.0.1:6379). npm i bullmq ioredis.
7. backend/src/queue/mediaWorker.js -> Worker per supervisor pattern: sharp resize/thumb for images, passthrough else; attempts:3 exponential backoff; concurrency 5; base64 job data OK for media-size files.
8. save-opensource + publish hook ENQUEUE instead of sync upload; add GET /media/upload-status/:jobId via mediaQueue.getJob().
9. Run worker under pm2 as elite-media-worker (ecosystem entry node src/queue/mediaWorker.js); verify pm2 online + a real enqueue->completed round-trip in retest.
Sync s3Client stays for direct/small ops; queue is the default pipeline route.
