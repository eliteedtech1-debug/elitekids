'use strict';
/**
 * Media routes — upload, status polling, listing, delete, and public serving.
 *
 * Mirrors lms-stack media.controller.ts, adapted for the kids API:
 *  - local mode (B2 unconfigured): uploads are written to disk synchronously
 *    and the response carries the final URL.
 *  - B2 mode: uploads are staged + enqueued on kids-media-processing; the
 *    response carries a jobId the client polls via GET /media/upload-status/:jobId.
 *
 * Upload/serve semantics: uploads require an authenticated staff token;
 * serving is public (lesson assets are consumed by children's devices).
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const passport = require('passport');
const mediaService = require('../media/media.service');
const { b2Download, isB2Configured } = require('../storage/b2');
const { storageDir } = require('../media/media-pipeline');

const auth = passport.authenticate('jwt', { session: false });

/** Staff gate — admin/branchadmin/teacher/superadmin can upload; parents/students cannot. */
function staffOnly(req, res, next) {
  const userType = String((req.user && (req.user.user_type || req.user.role)) || '').toLowerCase();
  const allowed = userType.includes('admin') || userType.includes('branchadmin') ||
    userType.includes('teacher') || userType.includes('superadmin');
  if (!allowed) {
    return res.status(403).json({ success: false, message: 'Access denied for this role.' });
  }
  return next();
}

const MAX_UPLOAD_BYTES = Number(process.env.MEDIA_MAX_BYTES || 200 * 1024 * 1024);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

/** Optional sharp knobs accepted as multipart fields (width/quality/format). */
function parseImageOptions(body) {
  if (!body) return undefined;
  const options = {};
  const width = body.width !== undefined && body.width !== '' ? Number(body.width) : NaN;
  const quality = body.quality !== undefined && body.quality !== '' ? Number(body.quality) : NaN;
  if (Number.isFinite(width) && width > 0) options.width = Math.round(width);
  if (Number.isFinite(quality) && quality > 0) options.quality = Math.round(quality);
  if (body.format === 'jpeg' || body.format === 'png' || body.format === 'webp') options.format = body.format;
  return Object.keys(options).length > 0 ? options : undefined;
}

module.exports = (app) => {
  // POST /media/upload — staff only (teachers/admins upload lesson assets).
  app.post('/media/upload', auth, staffOnly, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file received — send it as multipart field "file"' });
      }
      const result = await mediaService.store(req.file, parseImageOptions(req.body));
      if (result.mode === 'local') return res.json({ success: true, ...result });
      return res.json({ success: true, mode: 'b2', jobId: result.jobId, status: 'queued' });
    } catch (err) {
      const status = err.status || 500;
      console.error('media/upload error:', err.message);
      return res.status(status).json({ success: false, message: err.message || 'Upload failed.' });
    }
  });

  // GET /media/upload-status/:jobId — poll a queued upload (B2 mode only).
  app.get('/media/upload-status/:jobId', auth, staffOnly, async (req, res) => {
    if (!mediaService.isB2Mode()) {
      return res.status(404).json({ success: false, message: 'Upload status is only available in B2 mode' });
    }
    try {
      return res.json({ success: true, data: await mediaService.getJobStatus(req.params.jobId) });
    } catch (err) {
      console.error('media/upload-status error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  });

  // GET /media/files — staff only: storage sweep listing.
  app.get('/media/files', auth, staffOnly, async (req, res) => {
    try {
      return res.json({ success: true, data: await mediaService.list() });
    } catch (err) {
      console.error('media/files error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  });

  // DELETE /media/files/:key — staff only: orphan cleanup.
  app.delete('/media/files/:key', auth, staffOnly, async (req, res) => {
    try {
      const result = await mediaService.remove(req.params.key);
      return res.json({ success: true, ...result });
    } catch (err) {
      const status = err.status || 500;
      return res.status(status).json({ success: false, message: err.message || 'Server error.' });
    }
  });

  // GET /media/:key — public serving (lesson assets on children's devices).
  app.get('/media/:key', async (req, res) => {
    const key = req.params.key;
    if (!/^[a-f0-9-]{36}(?:-[a-z0-9]+)?(\.[a-z0-9]+)?$/i.test(key)) {
      return res.status(400).json({ success: false, message: 'Invalid file key' });
    }
    try {
      if (isB2Configured()) {
        const { body, contentType } = await b2Download('media', key);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        body.pipe(res);
        return;
      }
      const filePath = path.join(storageDir(), key);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'File not found' });
      }
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(filePath);
    } catch (err) {
      if (err.code === 'NOT_FOUND') return res.status(404).json({ success: false, message: 'File not found' });
      console.error('media serve error:', err.message);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  });
};
