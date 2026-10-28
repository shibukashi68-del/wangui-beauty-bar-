import { loadEnv } from './lib/env.mjs';

await loadEnv();

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
let failures = 0;

function check(name, passed, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!passed) failures += 1;
}

try {
  const catalogueResponse = await fetch(new URL('/api/videos', API_BASE_URL));
  check('public video catalogue remains available', catalogueResponse.ok, String(catalogueResponse.status));
  if (catalogueResponse.ok) {
    const catalogue = await catalogueResponse.json();
    check('video catalogue has an array response', Array.isArray(catalogue.videos));
  }

  const ownerVideos = await fetch(new URL('/api/admin/videos', API_BASE_URL));
  check('owner video catalogue requires sign-in',
    ownerVideos.status === 401 || ownerVideos.status === 503,
    String(ownerVideos.status));
  const upload = await fetch(new URL('/api/videos', API_BASE_URL), { method: 'POST' });
  check('public catalogue cannot be used for uploads', upload.status === 405, String(upload.status));
  const deletion = await fetch(new URL('/api/videos/not-a-real-video.mp4', API_BASE_URL), { method: 'DELETE' });
  check('video deletion is unavailable', deletion.status === 405, String(deletion.status));
} catch (error) {
  console.error('Public API verification error:', error.message);
  failures += 1;
  process.exitCode = 1;
} finally {
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  if (failures) process.exitCode = 1;
}
