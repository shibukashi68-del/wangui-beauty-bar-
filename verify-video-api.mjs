const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MAX_VIDEO_UPLOAD_BYTES = Number(process.env.MAX_VIDEO_UPLOAD_BYTES) || 100 * 1024 * 1024;
const filename = `wbb-api-check-${Date.now()}.mp4`;
const validMp4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 2, 0]);
let cookie = '';
let uploaded = false;
let failures = 0;

function check(name, passed, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!passed) failures += 1;
}

async function upload(fileName, data) {
  const form = new FormData();
  form.append('video', new Blob([data], { type: 'video/mp4' }), fileName);
  form.append('dept', 'makeup');
  form.append('caption', 'API verification clip');
  return fetch(new URL('/api/videos', API_BASE_URL), {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
}

try {
  if (!ADMIN_PASSWORD) throw new Error('Set ADMIN_PASSWORD in the environment before running this check.');
  if (MAX_VIDEO_UPLOAD_BYTES > 20 * 1024 * 1024)
    throw new Error('For a safe upload-limit check, set MAX_VIDEO_UPLOAD_BYTES to 20971520 or less on the staging server and in this process.');

  const login = await fetch(new URL('/api/admin/login', API_BASE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  check('staff login accepted', login.ok, String(login.status));
  if (!login.ok) throw new Error('Cannot continue without a staff session.');
  cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
  if (!cookie) throw new Error('Server did not issue a session cookie.');

  const validUpload = await upload(filename, validMp4);
  check('valid MP4 upload accepted', validUpload.status === 201, String(validUpload.status));
  if (validUpload.status === 201) uploaded = true;

  const duplicate = await upload(filename, validMp4);
  check('duplicate filename rejected', duplicate.status === 409, String(duplicate.status));

  const fakeMp4 = await upload(`wbb-api-check-${Date.now()}-invalid.mp4`, Buffer.from('not an MP4'));
  check('invalid MP4 contents rejected', fakeMp4.status === 400, String(fakeMp4.status));

  const wrongExtension = await upload(`wbb-api-check-${Date.now()}.txt`, validMp4);
  check('non-MP4 extension rejected', wrongExtension.status === 400, String(wrongExtension.status));

  const oversizedMp4 = Buffer.alloc(MAX_VIDEO_UPLOAD_BYTES + 1);
  oversizedMp4.write('ftyp', 4, 'ascii');
  const oversized = await upload(`wbb-api-check-${Date.now()}-large.mp4`, oversizedMp4);
  check('oversized MP4 rejected', oversized.status === 413, String(oversized.status));
} catch (error) {
  console.error('Video API verification error:', error.message);
  failures += 1;
  process.exitCode = 1;
} finally {
  if (uploaded && cookie) {
    try {
      const response = await fetch(new URL(`/api/videos/${encodeURIComponent(filename)}`, API_BASE_URL), {
        method: 'DELETE',
        headers: { cookie },
      });
      check('temporary uploaded clip removed', response.ok, String(response.status));
    } catch (error) {
      console.error('Could not remove temporary video:', error.message);
      process.exitCode = 1;
    }
  }
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  if (failures) process.exitCode = 1;
}
