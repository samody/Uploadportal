require('dotenv').config({ path: '.env' });

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '100', 10) * 1024 * 1024;

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Storage ──────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ───────────────────────────────────────────────────────────────────
function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function uniqueCode(table, column, len = 6) {
  let code;
  let tries = 0;
  do {
    code = randomCode(len);
    tries++;
    if (tries > 20) code = randomCode(8);
  } while (db.prepare(`SELECT 1 FROM ${table} WHERE ${column}=?`).get(code));
  return code;
}

function isExpired(expires_at) {
  if (!expires_at) return false;
  return new Date(expires_at) < new Date();
}

// ── Admin Auth ────────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const sid = req.headers['x-session-id'];
  if (!sid) return res.status(401).json({ error: 'Unauthorized' });
  const session = db.prepare('SELECT * FROM admin_sessions WHERE id=?').get(sid);
  if (!session || isExpired(session.expires_at)) {
    if (session) db.prepare('DELETE FROM admin_sessions WHERE id=?').run(sid);
    return res.status(401).json({ error: 'Session expired' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const sid = uuidv4();
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8 hours
  db.prepare('INSERT INTO admin_sessions (id, expires_at) VALUES (?,?)').run(sid, expires);
  res.json({ sessionId: sid });
});

// POST /api/admin/logout
app.post('/api/admin/logout', adminAuth, (req, res) => {
  db.prepare('DELETE FROM admin_sessions WHERE id=?').run(req.headers['x-session-id']);
  res.json({ ok: true });
});

// ── Upload Links ──────────────────────────────────────────────────────────────

// GET /api/admin/upload-links
app.get('/api/admin/upload-links', adminAuth, (req, res) => {
  const links = db.prepare('SELECT * FROM upload_links ORDER BY created_at DESC').all();
  res.json(links);
});

// POST /api/admin/upload-links
app.post('/api/admin/upload-links', adminAuth, (req, res) => {
  const { label = '', max_files = null, expires_in_hours = null } = req.body;
  const token = uuidv4();
  const code = uniqueCode('upload_links', 'code');
  const expires_at = expires_in_hours
    ? new Date(Date.now() + expires_in_hours * 3600 * 1000).toISOString()
    : null;

  db.prepare(
    'INSERT INTO upload_links (token,code,label,max_files,expires_at) VALUES (?,?,?,?,?)'
  ).run(token, code, label, max_files, expires_at);

  const link = db.prepare('SELECT * FROM upload_links WHERE token=?').get(token);
  res.json(link);
});

// POST /api/admin/upload-links/:id/revoke — disable, keep the row and its history
app.post('/api/admin/upload-links/:id/revoke', adminAuth, (req, res) => {
  const info = db.prepare('UPDATE upload_links SET active=0 WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// DELETE /api/admin/upload-links/:id — remove the row.
// files.upload_link_id is ON DELETE SET NULL, so uploaded files survive.
app.delete('/api/admin/upload-links/:id', adminAuth, (req, res) => {
  const info = db.prepare('DELETE FROM upload_links WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Files ─────────────────────────────────────────────────────────────────────

// GET /api/admin/files
app.get('/api/admin/files', adminAuth, (req, res) => {
  const files = db.prepare(`
    SELECT f.*, ul.label as upload_label, ul.code as upload_code
    FROM files f
    LEFT JOIN upload_links ul ON ul.id = f.upload_link_id
    ORDER BY f.uploaded_at DESC
  `).all();
  res.json(files);
});

// POST /api/admin/files — upload straight into the library, no upload link needed.
// adminAuth runs BEFORE multer so an unauthenticated request never writes to disk.
app.post('/api/admin/files', adminAuth, upload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const insertFile = db.prepare(
    'INSERT INTO files (original_name,stored_name,size,mimetype,upload_link_id) VALUES (?,?,?,?,NULL)'
  );
  const uploaded = [];

  const txn = db.transaction(() => {
    for (const f of req.files) {
      const info = insertFile.run(f.originalname, f.filename, f.size, f.mimetype);
      uploaded.push({ id: info.lastInsertRowid, name: f.originalname, size: f.size });
    }
  });
  txn();

  res.json({ ok: true, files: uploaded });
});

// GET /api/admin/files/:id/download
app.get('/api/admin/files/:id/download', adminAuth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(UPLOADS_DIR, file.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server' });

  res.download(filePath, file.original_name);
});

// DELETE /api/admin/files/:id
app.delete('/api/admin/files/:id', adminAuth, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(UPLOADS_DIR, file.stored_name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM files WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Share Links ───────────────────────────────────────────────────────────────

// GET /api/admin/share-links
app.get('/api/admin/share-links', adminAuth, (req, res) => {
  const links = db.prepare(`
    SELECT sl.*, f.original_name, f.size
    FROM share_links sl
    JOIN files f ON f.id = sl.file_id
    ORDER BY sl.created_at DESC
  `).all();
  res.json(links);
});

// POST /api/admin/share-links
app.post('/api/admin/share-links', adminAuth, (req, res) => {
  const { file_id, label = '', expires_in_hours = null } = req.body;
  if (!file_id) return res.status(400).json({ error: 'file_id required' });

  const file = db.prepare('SELECT id FROM files WHERE id=?').get(file_id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const token = uuidv4();
  const code = uniqueCode('share_links', 'code');
  const expires_at = expires_in_hours
    ? new Date(Date.now() + expires_in_hours * 3600 * 1000).toISOString()
    : null;

  db.prepare(
    'INSERT INTO share_links (token,code,file_id,label,expires_at) VALUES (?,?,?,?,?)'
  ).run(token, code, file_id, label, expires_at);

  const sl = db.prepare(`
    SELECT sl.*, f.original_name, f.size
    FROM share_links sl JOIN files f ON f.id=sl.file_id WHERE sl.token=?
  `).get(token);
  res.json(sl);
});

// POST /api/admin/share-links/:id/revoke — disable, keep the row and its counts
app.post('/api/admin/share-links/:id/revoke', adminAuth, (req, res) => {
  const info = db.prepare('UPDATE share_links SET active=0 WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// DELETE /api/admin/share-links/:id — remove the row. The file itself is untouched.
app.delete('/api/admin/share-links/:id', adminAuth, (req, res) => {
  const info = db.prepare('DELETE FROM share_links WHERE id=?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC UPLOAD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Resolve upload link by token or code
function resolveUploadLink(token, code) {
  if (token) return db.prepare('SELECT * FROM upload_links WHERE token=? AND active=1').get(token);
  if (code)  return db.prepare('SELECT * FROM upload_links WHERE code=? AND active=1').get(code.toUpperCase());
  return null;
}

// GET /api/upload/verify?token=&code=
app.get('/api/upload/verify', (req, res) => {
  const { token, code } = req.query;
  const link = resolveUploadLink(token, code);
  if (!link) return res.status(404).json({ error: 'Invalid link or code' });
  if (isExpired(link.expires_at)) return res.status(410).json({ error: 'This upload link has expired' });
  if (link.max_files !== null && link.files_uploaded >= link.max_files)
    return res.status(410).json({ error: 'Upload limit reached for this link' });
  res.json({ label: link.label, max_files: link.max_files, files_uploaded: link.files_uploaded });
});

// POST /api/upload?token=&code=
app.post('/api/upload', upload.array('files', 20), (req, res) => {
  const { token, code } = req.query;
  const link = resolveUploadLink(token, code);

  if (!link) {
    req.files?.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(404).json({ error: 'Invalid link or code' });
  }
  if (isExpired(link.expires_at)) {
    req.files?.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(410).json({ error: 'Upload link has expired' });
  }
  if (link.max_files !== null && link.files_uploaded >= link.max_files) {
    req.files?.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(410).json({ error: 'Upload limit reached' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const insertFile = db.prepare(
    'INSERT INTO files (original_name,stored_name,size,mimetype,upload_link_id) VALUES (?,?,?,?,?)'
  );
  const uploaded = [];

  const txn = db.transaction(() => {
    for (const f of req.files) {
      const info = insertFile.run(f.originalname, f.filename, f.size, f.mimetype, link.id);
      uploaded.push({ id: info.lastInsertRowid, name: f.originalname, size: f.size });
    }
    db.prepare('UPDATE upload_links SET files_uploaded=files_uploaded+? WHERE id=?')
      .run(req.files.length, link.id);
  });
  txn();

  res.json({ ok: true, files: uploaded });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC SHARE / DOWNLOAD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

function resolveShareLink(token, code) {
  if (token) return db.prepare(`
    SELECT sl.*, f.original_name, f.stored_name, f.size, f.mimetype
    FROM share_links sl JOIN files f ON f.id=sl.file_id
    WHERE sl.token=? AND sl.active=1`).get(token);
  if (code) return db.prepare(`
    SELECT sl.*, f.original_name, f.stored_name, f.size, f.mimetype
    FROM share_links sl JOIN files f ON f.id=sl.file_id
    WHERE sl.code=? AND sl.active=1`).get(code.toUpperCase());
  return null;
}

// GET /api/share/verify?token=&code=
app.get('/api/share/verify', (req, res) => {
  const { token, code } = req.query;
  const sl = resolveShareLink(token, code);
  if (!sl) return res.status(404).json({ error: 'Invalid link or code' });
  if (isExpired(sl.expires_at)) return res.status(410).json({ error: 'This share link has expired' });
  res.json({
    label: sl.label,
    original_name: sl.original_name,
    size: sl.size,
    download_count: sl.download_count,
  });
});

// GET /api/share/download?token=&code=
app.get('/api/share/download', (req, res) => {
  const { token, code } = req.query;
  const sl = resolveShareLink(token, code);
  if (!sl) return res.status(404).json({ error: 'Invalid link or code' });
  if (isExpired(sl.expires_at)) return res.status(410).json({ error: 'Share link has expired' });

  const filePath = path.join(UPLOADS_DIR, sl.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server' });

  db.prepare('UPDATE share_links SET download_count=download_count+1 WHERE id=?').run(sl.id);
  res.download(filePath, sl.original_name);
});

// GET /api/resolve-code?code=XXXXXX  — determines if code is upload or share
app.get('/api/resolve-code', (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Code required' });
  const upper = code.toUpperCase();

  const uploadLink = db.prepare('SELECT * FROM upload_links WHERE code=? AND active=1').get(upper);
  if (uploadLink && !isExpired(uploadLink.expires_at) &&
      !(uploadLink.max_files !== null && uploadLink.files_uploaded >= uploadLink.max_files)) {
    return res.json({ type: 'upload', code: upper });
  }

  const shareLink = db.prepare('SELECT * FROM share_links WHERE code=? AND active=1').get(upper);
  if (shareLink && !isExpired(shareLink.expires_at)) {
    return res.json({ type: 'share', code: upper });
  }

  return res.status(404).json({ error: 'Invalid or expired access code' });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('/admin*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/upload*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'upload.html')));
app.get('/share*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'share.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`File Share Portal running on http://localhost:${PORT}`);
  console.log(`Admin portal: http://localhost:${PORT}/admin`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
