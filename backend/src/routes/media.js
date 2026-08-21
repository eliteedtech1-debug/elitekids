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

  // GET /media/puzzle/:filename — serve puzzle piece images
  app.get('/media/puzzle/:filename', (req, res) => {
    const { splitImage, PUZZLE_DIR, ensureDir } = require('../media/puzzle-splitter');
    const filePath = path.join(PUZZLE_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Puzzle piece not found' });
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(filePath);
  });

  // POST /media/puzzle-split — staff uploads image, engine splits at all difficulty levels
  const puzzleUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only images allowed'), false);
    },
  });
  app.post('/media/puzzle-split', auth, staffOnly, puzzleUpload.single('image'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
      const { splitAllLevels, PUZZLE_DIR: PUZZLE_DIR_LOCAL, ensureDir: ensureDirLocal } = require('../media/puzzle-splitter');
      const { v4: uuidv4 } = require('uuid');
      const puzzleId = uuidv4();

      ensureDirLocal(PUZZLE_DIR_LOCAL);
      const tmpPath = path.join(PUZZLE_DIR_LOCAL, `${puzzleId}-upload.tmp`);
      fs.writeFileSync(tmpPath, req.file.buffer);

      const result = await splitAllLevels(tmpPath, puzzleId);
      fs.unlinkSync(tmpPath); // cleanup temp

      return res.json({ success: true, data: result });
    } catch (err) {
      console.error('puzzle-split error:', err.message);
      return res.status(500).json({ success: false, message: err.message || 'Split failed' });
    }
  });

  // POST /media/save-opensource — download an open-source asset (e.g. Twemoji) and save to our bucket
  app.post('/media/save-opensource', auth, staffOnly, async (req, res) => {
    try {
      const { url, label, category } = req.body;
      if (!url) return res.status(400).json({ success: false, message: 'Missing url' });

      // Only allow trusted open-source CDNs
      const ALLOWED_ORIGINS = [
        'cdn.jsdelivr.net',
        'twemoji.maxcdn.com',
        'cdnjs.cloudflare.com',
        'fonts.gstatic.com',
      ];
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid URL' });
      }
      if (!ALLOWED_ORIGINS.some((o) => parsedUrl.hostname.includes(o))) {
        return res.status(400).json({ success: false, message: 'URL domain not in allowlist' });
      }

      // Fetch the asset
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        return res.status(502).json({ success: false, message: `Upstream returned ${response.status}` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) {
        return res.status(502).json({ success: false, message: 'Empty response from upstream' });
      }

      // Determine extension from content-type or URL
      const ct = response.headers.get('content-type') || '';
      let ext = 'png';
      if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
      else if (ct.includes('webp')) ext = 'webp';
      else if (ct.includes('gif')) ext = 'gif';
      else if (ct.includes('svg')) ext = 'svg';
      else if (ct.includes('mp3')) ext = 'mp3';
      else if (ct.includes('wav')) ext = 'wav';
      else if (ct.includes('ogg')) ext = 'ogg';

      // Build a deterministic key from the source URL (dedup)
      const { createHash } = require('crypto');
      const hash = createHash('md5').update(url).digest('hex').slice(0, 12);
      const safeLabel = (label || 'asset').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      const cat = (category || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
      const key = `opensource/${cat}/${safeLabel}-${hash}.${ext}`;

      // Save via the media pipeline
      const { mediaPublicUrl } = require('../media/media-pipeline');
      const { b2Upload, isB2Configured } = require('../storage/b2');

      if (isB2Configured()) {
        await b2Upload('media', key, buffer, ct || `image/${ext}`);
        return res.json({ success: true, data: { key, url: mediaPublicUrl(key), sourceUrl: url, size: buffer.length } });
      }

      // Local fallback
      const { storageDir } = require('../media/media-pipeline');
      await fs.promises.mkdir(path.join(storageDir(), 'opensource', cat), { recursive: true });
      await fs.promises.writeFile(path.join(storageDir(), key), buffer);
      return res.json({ success: true, data: { key, url: `${process.env.MEDIA_PUBLIC_BASE_URL || 'http://127.0.0.1:34600'}/media/${key}`, sourceUrl: url, size: buffer.length } });
    } catch (err) {
      console.error('media/save-opensource error:', err.message);
      return res.status(500).json({ success: false, message: err.message || 'Failed to save asset' });
    }
  });

  // POST /media/save-opensource-batch — save multiple assets at once (rate-limited)
  app.post('/media/save-opensource-batch', auth, staffOnly, async (req, res) => {
    try {
      const { assets } = req.body; // [{ url, label, category }]
      if (!Array.isArray(assets) || assets.length === 0) {
        return res.status(400).json({ success: false, message: 'Missing assets array' });
      }
      if (assets.length > 20) {
        return res.status(400).json({ success: false, message: 'Max 20 assets per batch' });
      }

      const results = [];
      for (const asset of assets) {
        try {
          // Reuse the single-save logic via internal fetch simulation
          const ctrl = new AbortController();
          const tm = setTimeout(() => ctrl.abort(), 10000);
          let resp;
          try {
            resp = await fetch(asset.url, { signal: ctrl.signal });
          } finally {
            clearTimeout(tm);
          }
          if (!resp.ok) { results.push({ url: asset.url, success: false, error: `HTTP ${resp.status}` }); continue; }

          const buf = Buffer.from(await resp.arrayBuffer());
          const ct = resp.headers.get('content-type') || '';
          let ext = 'png';
          if (ct.includes('jpeg')) ext = 'jpg'; else if (ct.includes('webp')) ext = 'webp';
          else if (ct.includes('gif')) ext = 'gif'; else if (ct.includes('mp3')) ext = 'mp3';

          const { createHash } = require('crypto');
          const hash = createHash('md5').update(asset.url).digest('hex').slice(0, 12);
          const safeLabel = (asset.label || 'asset').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
          const cat = (asset.category || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
          const key = `opensource/${cat}/${safeLabel}-${hash}.${ext}`;

          const { b2Upload, isB2Configured } = require('../storage/b2');
          const { mediaPublicUrl } = require('../media/media-pipeline');

          if (isB2Configured()) {
            await b2Upload('media', key, buf, ct || `image/${ext}`);
            results.push({ url: asset.url, success: true, key, storedUrl: mediaPublicUrl(key) });
          } else {
            const { storageDir } = require('../media/media-pipeline');
            await fs.promises.mkdir(path.join(storageDir(), 'opensource', cat), { recursive: true });
            await fs.promises.writeFile(path.join(storageDir(), key), buf);
            results.push({ url: asset.url, success: true, key, storedUrl: `${process.env.MEDIA_PUBLIC_BASE_URL || 'http://127.0.0.1:34600'}/media/${key}` });
          }
        } catch (e) {
          results.push({ url: asset.url, success: false, error: e.message });
        }
      }
      return res.json({ success: true, data: results });
    } catch (err) {
      console.error('media/save-opensource-batch error:', err.message);
      return res.status(500).json({ success: false, message: err.message || 'Batch save failed' });
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
