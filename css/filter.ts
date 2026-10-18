import { DepartmentInfo } from './services.js';

export interface FilterOptions {
  departments: Record<string, DepartmentInfo>;
  onChange: (dept: string) => void;
}

export function mountFilters(root: HTMLElement, { departments, onChange }: FilterOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'filters';
  wrap.innerHTML = `
    <button class="chip" data-dept="" aria-pressed="true">All</button>
    ${Object.entries(departments).map(([k,d]) =>
      `<button class="chip" data-dept="${k}" aria-pressed="false">${d.title}</button>`
    ).join('')}`;

  wrap.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.chip') as HTMLElement | null;
    if (!btn) return;
    wrap.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
    onChange(btn.dataset.dept ?? '');
  });

  root.appendChild(wrap);
  return wrap;
}