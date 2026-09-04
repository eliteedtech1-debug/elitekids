/**
 * uploadMediaFile — one-call helper for teacher uploads to the media
 * pipeline (B2 in production, local disk when B2 is unconfigured).
 *
 * Backend semantics (backend/src/routes/media.js + media.service.js):
 *   POST /media/upload (multipart 'file', staff-gated)
 *     → { success, mode:'local', url }                      (local mode)
 *     → { success, mode:'b2', jobId, status:'queued' }      (B2 mode)
 *   GET /media/upload-status/:jobId (B2 mode)
 *     → { success, data: { jobId, status: queued|processing|completed|failed,
 *                          result?: { url, key, ... }, error? } }
 *
 * Resolves with the playable URL on success; rejects with a friendly
 * message otherwise.
 */
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const STATUS_POLL_MS = 1000;
const STATUS_MAX_POLLS = 60; // 60s ceiling for a small audio file

export async function uploadMediaFile(
  file: Blob,
  filename: string,
  onStage?: (stage: 'uploading' | 'processing') => void
): Promise<string> {
  const fd = new FormData();
  fd.append('file', file, filename);
  onStage?.('uploading');
  const res = await apiClient.post(ENDPOINTS.MEDIA.UPLOAD, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const data = res?.data;
  if (!data?.success) {
    throw new Error(data?.message || 'Upload failed. Check your connection and try again.');
  }
  if (data.mode === 'local' && data.url) return data.url as string;

  const jobId = data.jobId as string | undefined;
  if (!jobId) throw new Error('Upload accepted but no tracking id was returned.');

  onStage?.('processing');
  for (let i = 0; i < STATUS_MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, STATUS_POLL_MS));
    const st = await apiClient
      .get(ENDPOINTS.MEDIA.UPLOAD_STATUS(jobId))
      .catch(() => null);
    const job = st?.data?.data;
    if (job?.status === 'completed') {
      const url = job.result?.url;
      if (url) return url as string;
      throw new Error('Upload finished but no file URL was returned.');
    }
    if (job?.status === 'failed') {
      throw new Error(job.error || 'The file could not be stored. Try again.');
    }
  }
  throw new Error('The upload is taking longer than expected. Try again shortly.');
}
