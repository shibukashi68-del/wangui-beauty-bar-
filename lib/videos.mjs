// Video library service: validation, upload persistence, deletion.
//
// Owns all video-domain rules (file type, size, department, caption) and the
// serialised catalogue/file mutations. Route handlers stay thin: they parse
// the multipart request and delegate here. All persistence flows through a
// serial queue so read-modify-write sequences stay atomic — same pattern as
// BookingStore.

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { VideoCatalogue, VIDEO_DEPTS } from './static.mjs';
import { createSerialQueue } from './serial-queue.mjs';
import { badRequest, conflict, tooLarge } from './errors.mjs';

const MP4_EXTENSION = '.mp4';
const MAX_CAPTION_LENGTH = 200;
const FTYP_OFFSET_START = 4;
const FTYP_OFFSET_END = 8;
const MP4_MAGIC_HEADER_BYTES = 12;

export function defaultVideoUploadLimit() {
  return 100 * 1024 * 1024;
}

export function createVideoCatalogue({ root, env = process.env }) {
  const configured = Number(env.MAX_VIDEO_UPLOAD_BYTES);
  return new VideoCatalogue({
    dir: resolve(root, env.VIDEO_STORAGE_DIR || 'video'),
    cataloguePath: resolve(root, env.VIDEO_CATALOGUE_PATH || 'css/videos.json'),
    maxUploadBytes: Number.isSafeInteger(configured) && configured > 0
      ? configured
      : defaultVideoUploadLimit(),
  });
}

/** Validates an uploaded file's magic bytes — ISO base media files carry 'ftyp'. */
async function isMp4File(path) {
  const handle = await fs.open(path, 'r');
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(MP4_MAGIC_HEADER_BYTES), 0, MP4_MAGIC_HEADER_BYTES, 0);
    return bytesRead >= MP4_MAGIC_HEADER_BYTES
      && buffer.toString('ascii', FTYP_OFFSET_START, FTYP_OFFSET_END) === 'ftyp';
  } finally {
    await handle.close();
  }
}

export class VideoLibrary {
  /** @param {{ catalogue: VideoCatalogue, tempDir: string }} options */
  constructor({ catalogue, tempDir }) {
    this.catalogue = catalogue;
    this.tempDir = tempDir;
    this.enqueue = createSerialQueue();
  }

  list() {
    return this.catalogue.load();
  }

  /** Serialised read-modify-write: rename the file into place, then update the catalogue. */
  save({ file, safeName, dept, caption }) {
    return this.enqueue(async () => {
      const videos = await this.catalogue.load();
      if (videos.some((video) => video.file === safeName)) return false;
      await fs.mkdir(this.catalogue.dir, { recursive: true });
      const destPath = resolve(this.catalogue.dir, safeName);
      try {
        await fs.rename(file.path, destPath);
      } catch (error) {
        if (error.code === 'EEXIST') return false;
        throw error;
      }
      videos.push({ file: safeName, dept, caption });
      try {
        await this.catalogue.save(videos);
      } catch (error) {
        await fs.unlink(destPath).catch(() => { });
        throw error;
      }
      return true;
    });
  }

  /** Serialised read-modify-write: update the catalogue, then remove the file. */
  delete(filename) {
    return this.enqueue(async () => {
      const videos = await this.catalogue.load();
      if (!videos.some((video) => video.file === filename)) return false;
      const updatedVideos = videos.filter((video) => video.file !== filename);
      await this.catalogue.save(updatedVideos);
      try {
        await fs.unlink(resolve(this.catalogue.dir, filename));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          await this.catalogue.save(videos);
          throw error;
        }
      }
      return true;
    });
  }

  /** Removes a temp upload file left behind by a failed or rejected request. */
  async discardTempUpload(file) {
    if (file.path.startsWith(this.tempDir)) {
      await fs.unlink(file.path).catch(() => { });
    }
  }

  /** Validates the parsed upload; throws typed HttpErrors on any rule violation. */
  validateUpload({ file, fields }) {
    if (!file) throw badRequest('No video file provided.');
    if (!file.filename.toLowerCase().endsWith(MP4_EXTENSION)) {
      throw badRequest('Only .mp4 video files are accepted.');
    }
    if (file.size > this.catalogue.maxUploadBytes) {
      throw tooLarge(`Video upload is too large. The maximum file size is ${this.catalogue.label}.`);
    }
    const dept = fields.dept || '';
    if (!VIDEO_DEPTS.includes(dept)) {
      throw badRequest('Choose a valid department.');
    }
    const caption = fields.caption || file.filename;
    if (caption.length > MAX_CAPTION_LENGTH) {
      throw badRequest('Caption must be 200 characters or fewer.');
    }
    const safeName = this.catalogue.saveName(file.filename);
    if (!safeName.toLowerCase().endsWith(MP4_EXTENSION)) {
      throw badRequest('Use a filename containing only standard letters, numbers, dots, underscores, or hyphens.');
    }
    return { dept, caption, safeName };
  }

  /**
   * Full upload pipeline: validate fields/file, sniff MP4 magic bytes, then
   * persist. Always cleans the temp file, whether it succeeds or throws.
   */
  async acceptUpload({ file, fields }) {
    const validated = this.validateUpload({ file, fields });
    try {
      if (!(await isMp4File(file.path))) {
        throw badRequest('The uploaded file does not appear to be a valid MP4 video.');
      }
      const saved = await this.save({
        file, safeName: validated.safeName, dept: validated.dept, caption: validated.caption,
      });
      if (!saved) {
        throw conflict('A video with that filename already exists. Rename the file and try again.');
      }
      return { file: validated.safeName, dept: validated.dept, caption: validated.caption };
    } finally {
      await this.discardTempUpload(file);
    }
  }

  /** Sanitises an untrusted filename from a URL path. */
  static sanitiseFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '');
  }

  /** Serialised delete; returns false when the name is not in the catalogue. */
  async remove(sanitisedName) {
    return this.delete(sanitisedName);
  }
}
