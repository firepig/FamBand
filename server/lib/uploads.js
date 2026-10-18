import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

const MB = 1024 * 1024;

// One entry per kind of upload. `dir` is a folder under public/ served at /<dir>/.
export const UPLOAD_KINDS = {
  photo: { dir: 'photos', maxBytes: 5 * MB },
  avatar: { dir: 'avatars', maxBytes: 2 * MB },
  quest: { dir: 'quests', maxBytes: 5 * MB },
};

export function uploadDir(kind) {
  return path.join(PUBLIC_DIR, UPLOAD_KINDS[kind].dir);
}

export function ensureUploadDirs() {
  for (const kind of Object.keys(UPLOAD_KINDS)) {
    fs.mkdirSync(uploadDir(kind), { recursive: true });
  }
}

// Identify the image type from its leading bytes. We never trust the
// client-supplied MIME type or filename. SVG is deliberately not supported.
function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 6) {
    const head = buf.toString('latin1', 0, 6);
    if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  }
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// Filenames we generate: <uuid>.<ext>. Anything else is rejected, which also
// blocks path traversal when a filename arrives from a client.
const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|webp)$/;

export function isStoredName(name) {
  return typeof name === 'string' && STORED_NAME.test(name);
}

// True when `name` is a well-formed upload filename that exists for `kind`.
export function uploadExists(kind, name) {
  return isStoredName(name) && fs.existsSync(path.join(uploadDir(kind), name));
}

export function deleteUpload(kind, name) {
  if (!isStoredName(name)) return;
  try {
    fs.unlinkSync(path.join(uploadDir(kind), name));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Failed to delete upload:', err.message);
  }
}

// Express middleware: accepts one image in multipart field `field`, validates
// size + content, writes it to disk, and sets req.upload = { kind, filename }.
export function imageUpload(kind, field = 'image') {
  const { maxBytes } = UPLOAD_KINDS[kind];
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5, parts: 8 },
  }).single(field);

  return (req, res, next) => {
    parser(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `Image too large (max ${Math.round(maxBytes / MB)} MB)` });
        }
        return res.status(400).json({ error: 'Invalid upload' });
      }
      if (err) return next(err);
      if (!req.file) return res.status(400).json({ error: 'No image file provided' });

      const ext = sniffImage(req.file.buffer);
      if (!ext) {
        return res.status(415).json({ error: 'Unsupported image type (use JPEG, PNG, GIF or WebP)' });
      }
      const filename = `${uuidv4()}.${ext}`;
      try {
        fs.writeFileSync(path.join(uploadDir(kind), filename), req.file.buffer, { flag: 'wx' });
      } catch (writeErr) {
        return next(writeErr);
      }
      req.upload = { kind, filename };
      next();
    });
  };
}

// Quest images are shared between a template and the chores it generates, so
// the file can only be removed once nothing references it.
export function releaseQuestImage(db, name) {
  if (!name) return;
  const inUse =
    db.prepare('SELECT 1 FROM chores WHERE image = ? LIMIT 1').get(name) ||
    db.prepare('SELECT 1 FROM chore_templates WHERE image = ? LIMIT 1').get(name);
  if (!inUse) deleteUpload('quest', name);
}

// Quest images are uploaded before the quest is saved, so a replaced, removed or
// abandoned picture is never attached to anything. Delete unreferenced files once
// they are old enough that they can't belong to a form that is still open.
export function sweepOrphanQuestImages(db, minAgeMs = 24 * 60 * 60 * 1000) {
  let removed = 0;
  const dir = uploadDir('quest');
  for (const name of fs.readdirSync(dir)) {
    if (!isStoredName(name)) continue;
    try {
      if (Date.now() - fs.statSync(path.join(dir, name)).mtimeMs < minAgeMs) continue;
    } catch { continue; }
    const before = fs.existsSync(path.join(dir, name));
    releaseQuestImage(db, name);
    if (before && !fs.existsSync(path.join(dir, name))) removed++;
  }
  return removed;
}

export const AVATAR_IMG_PREFIX = 'img:';

export function avatarFilename(avatar) {
  return typeof avatar === 'string' && avatar.startsWith(AVATAR_IMG_PREFIX)
    ? avatar.slice(AVATAR_IMG_PREFIX.length)
    : null;
}
