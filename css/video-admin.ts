// Video management for staff: upload new clips and delete existing ones.
// Mount this into the #view outlet from the /#/admin/videos route.
import { CONFIG } from './config.js';

const DEPT_LABELS: Record<string, string> = {
  'wigs-hair': 'Wigs & Hair',
  makeup: 'Makeup',
  nails: 'Nails',
  'brows-lashes': 'Brows & Lashes',
};

export async function mountVideoAdmin(root: HTMLElement): Promise<void> {
  root.innerHTML = `
    <section class="section container">
      <div class="eyebrow">Video Gallery</div>
      <h1 style="margin-top:var(--sp-3);margin-bottom:var(--sp-6)">Manage Videos</h1>

      <div class="card" style="margin-bottom:var(--sp-7)">
        <div class="card__body">
          <h2 class="card__title" style="margin-bottom:var(--sp-4)">Add a new video</h2>
          <form id="video-upload-form" class="form">
            <label for="video-file">Video file (.mp4)</label>
            <input id="video-file" type="file" accept="video/mp4" required>

            <label for="video-dept" style="margin-top:var(--sp-4)">Department</label>
            <select id="video-dept" required>
              <option value="">Choose a department</option>
              <option value="wigs-hair">Wigs & Hair</option>
              <option value="makeup">Makeup</option>
              <option value="nails">Nails</option>
              <option value="brows-lashes">Brows & Lashes</option>
            </select>

            <label for="video-caption" style="margin-top:var(--sp-4)">Caption</label>
            <input id="video-caption" type="text" placeholder="e.g. Wig installation">

            <button class="btn btn--primary" type="button" id="video-upload-btn" style="margin-top:var(--sp-4)">Upload video</button>
            <p id="video-upload-msg" class="card__meta" style="margin-top:var(--sp-3)"></p>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card__body">
          <h2 class="card__title" style="margin-bottom:var(--sp-4)">Existing videos</h2>
          <div id="video-list" style="display:grid;gap:var(--sp-3)">
            <p class="card__meta">Loading videos…</p>
          </div>
        </div>
      </div>

      <p style="margin-top:var(--sp-6);text-align:center">
        <a class="btn btn--ghost" href="#/admin">Back to dashboard</a>
      </p>
    </section>
  `;

  const form = document.getElementById('video-upload-form') as HTMLFormElement;
  const fileInput = document.getElementById('video-file') as HTMLInputElement;
  const deptSelect = document.getElementById('video-dept') as HTMLSelectElement;
  const captionInput = document.getElementById('video-caption') as HTMLInputElement;
  const uploadBtn = document.getElementById('video-upload-btn') as HTMLButtonElement;
  const msg = document.getElementById('video-upload-msg') as HTMLElement;
  const list = document.getElementById('video-list') as HTMLElement;

  async function loadList() {
    try {
      const res = await fetch('/api/videos');
      const data = await res.json();
      const videos: Array<{ file: string; dept: string; caption: string }> = data.videos || [];
      renderList(videos);
    } catch {
      list.innerHTML = '<p class="card__meta">Could not load video list.</p>';
    }
  }

  function renderList(videos: Array<{ file: string; dept: string; caption: string }>) {
    if (!videos.length) {
      list.innerHTML = '<p class="card__meta">No videos uploaded yet.</p>';
      return;
    }
    list.innerHTML = videos
      .map(
        (v) => `
      <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-3) 0;border-bottom:1px solid var(--color-line)">
        <strong style="flex:1">${escapeHtml(v.caption || v.file)}</strong>
        <span style="font-size:var(--fs-xs);color:var(--color-muted);flex-shrink:0">${DEPT_LABELS[v.dept] || v.dept}</span>
        <button class="btn btn--ghost" data-delete="${escapeHtml(v.file)}" style="padding:var(--sp-1) var(--sp-3);font-size:var(--fs-xs)">Delete</button>
      </div>
    `
      )
      .join('');

    list.querySelectorAll('button[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const filename = btn.getAttribute('data-delete')!;
        if (!confirm(`Delete "${filename}"?`)) return;
        try {
          const res = await fetch(`/api/videos/${encodeURIComponent(filename)}`, { method: 'DELETE' });
          if (res.ok) {
            loadList();
          } else {
            const err = await res.json();
            msg.textContent = err.error || 'Could not delete video.';
            msg.style.color = 'var(--color-accent-hover)';
          }
        } catch {
          msg.textContent = 'Could not delete video.';
          msg.style.color = 'var(--color-accent-hover)';
        }
      });
    });
  }

  uploadBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      msg.textContent = 'Please select a video file.';
      msg.style.color = 'var(--color-accent-hover)';
      return;
    }
    if (!file.name.toLowerCase().endsWith('.mp4')) {
      msg.textContent = 'Only .mp4 files are accepted.';
      msg.style.color = 'var(--color-accent-hover)';
      return;
    }
    const dept = deptSelect.value;
    if (!dept) {
      msg.textContent = 'Please choose a department.';
      msg.style.color = 'var(--color-accent-hover)';
      return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading…';
    msg.textContent = '';

    const formData = new FormData();
    formData.append('video', file);
    formData.append('dept', dept);
    formData.append('caption', captionInput.value || file.name);

    try {
      const res = await fetch('/api/videos', { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Upload failed.');
      msg.textContent = 'Video uploaded successfully!';
      msg.style.color = 'var(--color-success)';
      form.reset();
      loadList();
    } catch (error) {
      msg.textContent = (error as Error).message || 'Upload failed.';
      msg.style.color = 'var(--color-accent-hover)';
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload video';
    }
  });

  loadList();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}