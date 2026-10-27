import { CONFIG } from './config.js';
import type { Video, VideoDept } from './videos.js';

const DEPARTMENTS: Array<{ value: VideoDept; label: string }> = [
  { value: 'wigs-hair', label: 'Wigs & Hair' },
  { value: 'makeup', label: 'Makeup' },
  { value: 'nails', label: 'Nails' },
  { value: 'brows-lashes', label: 'Brows & Lashes' },
];

interface ManagedVideo extends Video {
  id: string;
  title: string;
  published: boolean;
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result as T;
}

function message(element: HTMLElement, text: string, error = false): void {
  element.textContent = text;
  element.classList.toggle('owner-message--error', error);
  element.hidden = !text;
}

function field(label: string, value: string, name: string, maxLength: number, required = true): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'owner-field';
  const title = document.createElement('span');
  title.textContent = label;
  const input = document.createElement('input');
  input.name = name;
  input.value = value;
  input.maxLength = maxLength;
  input.required = required;
  wrapper.append(title, input);
  return wrapper;
}

function deptSelect(value: VideoDept): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'owner-field';
  const title = document.createElement('span');
  title.textContent = 'Department';
  const select = document.createElement('select');
  select.name = 'dept';
  DEPARTMENTS.forEach(({ value: dept, label }) => {
    const option = document.createElement('option');
    option.value = dept;
    option.textContent = label;
    option.selected = dept === value;
    select.appendChild(option);
  });
  wrapper.append(title, select);
  return wrapper;
}

function videoMetadata(form: HTMLFormElement, published: boolean): Record<string, string | boolean> {
  const data = new FormData(form);
  return {
    title: String(data.get('title') || ''),
    caption: String(data.get('caption') || ''),
    category: String(data.get('category') || ''),
    dept: String(data.get('dept') || ''),
    published,
  };
}

export async function renderOwnerDashboard(root: HTMLElement): Promise<void> {
  document.title = `Owner video manager — ${CONFIG.salonName}`;
  const page = document.createElement('section');
  page.className = 'section container owner-page';
  root.appendChild(page);

  const heading = document.createElement('div');
  heading.className = 'owner-heading';
  heading.innerHTML = '<div><p class="eyebrow">Private owner area</p><h1>Video gallery manager</h1></div>';
  page.appendChild(heading);

  const notice = document.createElement('p');
  notice.className = 'owner-message';
  notice.hidden = true;
  page.appendChild(notice);

  let configured = false;
  try {
    const result = await requestJson<{ configured: boolean }>('/api/admin/config');
    configured = result.configured;
  } catch (error) {
    message(notice, error instanceof Error ? error.message : 'Owner tools are unavailable.', true);
    return;
  }
  if (!configured) {
    message(notice, 'Owner publishing is not configured yet. Ask the site administrator to finish the Supabase setup.', true);
    return;
  }

  try {
    const session = await fetch('/api/admin/session');
    if (session.ok) {
      const user = await session.json() as { email: string };
      renderManager(page, notice, user.email);
    } else if (session.status === 401) {
      renderLogin(page, notice);
    } else {
      const result = await session.json().catch(() => ({}));
      message(notice, result.error || 'Could not verify owner sign-in.', true);
    }
  } catch {
    message(notice, 'The owner service could not be reached. Try again when the website is online.', true);
  }
}

function renderLogin(page: HTMLElement, notice: HTMLElement): void {
  const form = document.createElement('form');
  form.className = 'owner-panel owner-login';
  form.innerHTML = `
    <h2>Owner sign-in</h2>
    <p class="card__meta">Sign in with the owner account configured for this website.</p>
    <label class="owner-field"><span>Email</span><input name="email" type="email" autocomplete="username" required maxlength="254"></label>
    <label class="owner-field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn btn--primary" type="submit">Sign in</button>`;
  page.appendChild(form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = form.querySelector('button') as HTMLButtonElement;
    button.disabled = true;
    void requestJson<{ signedIn: boolean; email: string }>('/api/admin/session', {
      method: 'POST',
      body: JSON.stringify({
        email: (form.elements.namedItem('email') as HTMLInputElement).value,
        password: (form.elements.namedItem('password') as HTMLInputElement).value,
      }),
    }).then((user) => {
      form.remove();
      message(notice, '');
      renderManager(page, notice, user.email);
    }).catch((error: unknown) => {
      message(notice, error instanceof Error ? error.message : 'Sign-in failed.', true);
    }).finally(() => { button.disabled = false; });
  });
}

function renderManager(page: HTMLElement, notice: HTMLElement, email: string): void {
  const old = page.querySelector('.owner-manager');
  old?.remove();

  const manager = document.createElement('div');
  manager.className = 'owner-manager';
  const toolbar = document.createElement('div');
  toolbar.className = 'owner-toolbar';
  const identity = document.createElement('p');
  identity.className = 'card__meta';
  identity.textContent = `Signed in as ${email}`;
  const logout = document.createElement('button');
  logout.className = 'btn btn--ghost';
  logout.type = 'button';
  logout.textContent = 'Sign out';
  logout.addEventListener('click', () => {
    void requestJson('/api/admin/session', { method: 'DELETE' })
      .then(() => { manager.remove(); renderLogin(page, notice); })
      .catch((error: unknown) => message(notice, error instanceof Error ? error.message : 'Sign out failed.', true));
  });
  toolbar.append(identity, logout);

  const uploadPanel = document.createElement('section');
  uploadPanel.className = 'owner-panel';
  uploadPanel.innerHTML = `
    <h2>Add a video</h2>
    <p class="card__meta">MP4 or WebM, up to 50 MB. New videos are published by default; you can also save them privately.</p>
    <form class="owner-form" id="owner-upload">
      <label class="owner-field owner-field--wide"><span>Video file</span><input name="file" type="file" accept="video/mp4,video/webm" required></label>
      <label class="owner-field"><span>Title</span><input name="title" maxlength="100" required></label>
      <label class="owner-field"><span>Caption</span><input name="caption" maxlength="300"></label>
      <label class="owner-field"><span>Category</span><input name="category" maxlength="80" required></label>
      <label class="owner-field"><span>Department</span><select name="dept" required></select></label>
      <label class="owner-checkbox"><input name="published" type="checkbox" checked> Publish on the public gallery</label>
      <button class="btn btn--primary" type="submit">Upload video</button>
    </form>`;
  const uploadDept = uploadPanel.querySelector('select[name="dept"]') as HTMLSelectElement;
  DEPARTMENTS.forEach(({ value, label }) => uploadDept.add(new Option(label, value)));
  const uploadForm = uploadPanel.querySelector('#owner-upload') as HTMLFormElement;

  const listSection = document.createElement('section');
  listSection.className = 'owner-panel';
  listSection.innerHTML = '<h2>Gallery videos</h2>';
  const list = document.createElement('div');
  list.className = 'owner-video-list';
  listSection.appendChild(list);
  manager.append(toolbar, uploadPanel, listSection);
  page.appendChild(manager);

  const loadList = async (): Promise<void> => {
    const result = await requestJson<{ videos: ManagedVideo[] }>('/api/admin/videos');
    list.replaceChildren();
    if (!result.videos.length) {
      const empty = document.createElement('p');
      empty.className = 'card__meta';
      empty.textContent = 'No owner-uploaded videos yet.';
      list.appendChild(empty);
      return;
    }
    result.videos.forEach((video) => list.appendChild(videoEditor(video, loadList, notice)));
  };
  void loadList().catch((error: unknown) => message(notice, error instanceof Error ? error.message : 'Could not load videos.', true));

  uploadForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!uploadForm.reportValidity()) return;
    const file = (uploadForm.elements.namedItem('file') as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      message(notice, 'Choose a video no larger than 50 MB.', true);
      return;
    }
    const data = videoMetadata(uploadForm, (uploadForm.elements.namedItem('published') as HTMLInputElement).checked);
    const query = new URLSearchParams(Object.entries(data).map(([key, value]) => [key, String(value)]));
    const button = uploadForm.querySelector('button') as HTMLButtonElement;
    button.disabled = true;
    message(notice, 'Uploading video…');
    void requestJson('/api/admin/videos?' + query.toString(), {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file,
    }).then(async () => {
      uploadForm.reset();
      (uploadForm.elements.namedItem('published') as HTMLInputElement).checked = true;
      await loadList();
      message(notice, 'Video uploaded successfully.');
    }).catch((error: unknown) => {
      message(notice, error instanceof Error ? error.message : 'Video upload failed.', true);
    }).finally(() => { button.disabled = false; });
  });
}

function videoEditor(video: ManagedVideo, reload: () => Promise<void>, notice: HTMLElement): HTMLElement {
  const form = document.createElement('form');
  form.className = 'owner-video';
  form.append(
    field('Title', video.title || video.caption, 'title', 100),
    field('Caption', video.caption, 'caption', 300, false),
    field('Category', video.category || '', 'category', 80),
    deptSelect(video.dept),
  );
  const publishLabel = document.createElement('label');
  publishLabel.className = 'owner-checkbox';
  const published = document.createElement('input');
  published.type = 'checkbox';
  published.name = 'published';
  published.checked = video.published;
  const state = document.createElement('span');
  state.textContent = video.published ? 'Published' : 'Hidden from gallery';
  published.addEventListener('change', () => {
    state.textContent = published.checked ? 'Published' : 'Hidden from gallery';
  });
  publishLabel.append(published, state);

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn--primary';
  save.textContent = 'Save changes';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn--ghost';
  remove.textContent = 'Delete video';
  remove.addEventListener('click', () => {
    if (!window.confirm(`Permanently delete "${video.title || video.caption}"?`)) return;
    remove.disabled = true;
    void requestJson(`/api/admin/videos/${video.id}`, { method: 'DELETE' })
      .then(() => reload())
      .then(() => message(notice, 'Video deleted.'))
      .catch((error: unknown) => message(notice, error instanceof Error ? error.message : 'Delete failed.', true))
      .finally(() => { remove.disabled = false; });
  });
  form.append(publishLabel, save, remove);

  const item = document.createElement('article');
  item.className = 'owner-video-item';
  const name = document.createElement('p');
  name.className = 'owner-video-path';
  name.textContent = video.file;
  item.append(name, form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    button.disabled = true;
    void requestJson(`/api/admin/videos/${video.id}`, {
      method: 'PATCH',
      body: JSON.stringify(videoMetadata(form, published.checked)),
    }).then(() => reload())
      .then(() => message(notice, 'Video updated.'))
      .catch((error: unknown) => message(notice, error instanceof Error ? error.message : 'Could not save changes.', true))
      .finally(() => { button.disabled = false; });
  });
  return item;
}
