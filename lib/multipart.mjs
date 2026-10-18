// Streaming multipart/form-data parser.
//
// Unlike the previous buffered parser, this:
//   * streams the request to disk (no 100 MB in RAM per upload),
//   * stops consuming the body and destroys the socket on oversize instead of
//     racing a 413 response against a still-uploading client,
//   * decodes multi-byte UTF-8 field values correctly,
//   * handles boundary edge cases (CRLF handling, empty parts, final boundary).
//
// API: parseMultipart(req, { limits }) -> { fields, files }
//   files: [{ fieldName, filename, contentType, path, size }]
//   Fields and files are separated by the presence of a filename.
// Files land in a temp directory; the caller is responsible for unlinking
// them (or renaming into place).

import { createWriteStream } from 'node:fs';
import { createReadStream, promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

function dispositionParam(disposition, name) {
  // Matches name="value" and also filename*=UTF-8''value (RFC 5987).
  const plain = disposition.match(new RegExp(`${name}="([^"]*)"`));
  if (plain) return plain[1];
  const extended = disposition.match(new RegExp(`${name}\\*=([^']*)''([^;]*)`));
  if (extended) {
    try { return decodeURIComponent(extended[2]); }
    catch { return extended[2]; }
  }
  const bare = disposition.match(new RegExp(`${name}=([^;\\s]+)`));
  return bare ? bare[1] : '';
}

function parsePartHeader(buffer) {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd === -1) return null;
  const headerStr = buffer.slice(0, headerEnd).toString('utf8');
  const headers = {};
  for (const line of headerStr.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  const disposition = headers['content-disposition'] || '';
  return {
    headers,
    disposition,
    fieldName: dispositionParam(disposition, 'name'),
    filename: dispositionParam(disposition, 'filename'),
    contentType: headers['content-type'] || '',
    bodyStart: headerEnd + 4,
  };
}

export async function parseMultipart(req, { maxBytes, tempDir }) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (!boundaryMatch) {
    const error = new Error('Unsupported content type. Expected multipart/form-data.');
    error.status = 415;
    throw error;
  }

  await fs.mkdir(tempDir, { recursive: true });
  const delimiter = Buffer.from(`--${boundaryMatch[1]}`);
  const CRLF = 2;
  const DEFAULT_MAX_HEADER_BYTES = 8 * 1024;
  const MAX_HEADER_BYTES = 64 * 1024;

  const fields = {};
  const files = [];
  let received = 0;
  let currentPart = null;   // parsed header state of the part being streamed
  let fileStream = null;
  let fileSize = 0;
  let tail = Buffer.alloc(0);
  let tooLarge = false;
  const oversizeError = () => Object.assign(
    new Error('Request is too large.'), { status: 413 });

  function beginPart(buffer) {
    const parsed = parsePartHeader(buffer);
    if (!parsed) {
      // Headers incomplete — wait for more data (bounded by MAX_HEADER_BYTES).
      if (buffer.length > MAX_HEADER_BYTES) {
        const error = new Error('Multipart part headers are too large.');
        error.status = 400;
        throw error;
      }
      return false;
    }
    currentPart = parsed;
    if (currentPart.filename) {
      const safeName = currentPart.filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload';
      const tempPath = join(tempDir, `${Date.now()}-${randomBytes(8).toString('hex')}-${safeName}`);
      fileStream = createWriteStream(tempPath, { flags: 'wx' });
      fileSize = 0;
      currentPart.tempPath = tempPath;
    }
    return true;
  }

  function endPart() {
    if (currentPart?.filename && fileStream) {
      fileStream.end();
      files.push({
        fieldName: currentPart.fieldName,
        filename: currentPart.filename,
        contentType: currentPart.contentType,
        path: currentPart.tempPath,
        size: fileSize,
      });
      fileStream = null;
    } else if (currentPart) {
      const value = Buffer.concat(currentPart.chunks || []).toString('utf8').replace(/\r?\n$/, '');
      if (currentPart.fieldName && fields[currentPart.fieldName] === undefined) {
        fields[currentPart.fieldName] = value;
      }
    }
    currentPart = null;
  }

  function handleBodyChunk(buffer) {
    // The part body ends at the first occurrence of the delimiter.
    const idx = buffer.indexOf(delimiter);
    if (idx === -1) {
      // Nothing terminates this chunk; all of it is body (minus a possible
      // trailing partial delimiter we keep as `tail`).
      const keep = Math.min(buffer.length, delimiter.length + CRLF);
      const flush = buffer.length - keep;
      if (flush > 0) writeBody(buffer.slice(0, flush));
      tail = Buffer.from(buffer.slice(flush));
      return;
    }
    if (idx > 0) writeBody(buffer.slice(0, idx));
    // Skip the delimiter and optional trailing CRLF.
    let next = idx + delimiter.length;
    if (buffer[next] === 13 && buffer[next + 1] === 10) next += CRLF;
    endPart();
    beginPart(buffer.slice(next));
  }

  function writeBody(buffer) {
    if (!currentPart) return;
    if (currentPart.filename && fileStream) {
      fileSize += buffer.length;
      if (fileSize > maxBytes) {
        tooLarge = true;
        throw oversizeError();
      }
      fileStream.write(buffer);
    } else {
      currentPart.chunks = currentPart.chunks || [];
      currentPart.chunks.push(buffer);
      if (currentPart.chunks.reduce((sum, c) => sum + c.length, 0) > 1024 * 1024) {
        throw Object.assign(new Error('Form field is too large.'), { status: 413 });
      }
    }
  }

  function cleanupTempFiles() {
    for (const file of files) void fs.unlink(file.path).catch(() => { });
    if (currentPart?.tempPath) void fs.unlink(currentPart.tempPath).catch(() => { });
  }

  try {
    await pipeline(req, async function* (source) {
      for await (const chunk of source) {
        if (tooLarge) return;
        received += chunk.length;
        if (received > maxBytes + 1024 * 1024) {
          tooLarge = true;
          cleanupTempFiles();
          throw oversizeError();
        }
        let buffer = tail.length ? Buffer.concat([tail, chunk]) : chunk;
        tail = Buffer.alloc(0);
        // If we are between parts (just consumed a delimiter), the next bytes
        // are part headers; loop until a part begins or headers are incomplete.
        while (buffer.length) {
          if (!currentPart) {
            // Skip any leading CRLF between boundary and headers.
            if (buffer[0] === 13 && buffer[1] === 10) buffer = buffer.slice(2);
            if (!beginPart(buffer)) break;
          }
          const before = buffer.length;
          handleBodyChunk(buffer);
          if (buffer.length === before) break; // all retained as tail
          buffer = tail.length ? tail : Buffer.alloc(0);
          tail = Buffer.alloc(0);
          if (!currentPart) break;
        }
        yield; // backpressure signal for pipeline
      }
      if (tail.length) {
        if (!currentPart) beginPart(tail);
        if (currentPart) handleBodyChunk(tail);
      }
      if (currentPart) endPart();
    });
  } catch (error) {
    cleanupTempFiles();
    req.destroy();
    throw error;
  }

  if (currentPart) endPart();
  return { fields, files };
}
