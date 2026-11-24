// Small UI kit: toasts, modals, menus, prompts. No dependencies.
import { el, $, uid } from './util.js';
import { icon } from './icons.js';

/* --------------------------------- icons ---------------------------------- */
export function iconify(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.dataset.icon;
    if (!name) return;
    node.innerHTML = icon(name, node.dataset.size ? +node.dataset.size : 18);
    delete node.dataset.icon;
  });
}

/* --------------------------------- toasts --------------------------------- */
const toastHost = () => document.getElementById('toasts');

export function toast(message, kind = '', ms = 3600, title) {
  const host = toastHost();
  if (!host) return;
  const node = el('div', { class: `toast ${kind}` },
    el('div', { class: 'msg' }, title ? el('b', { text: title + ' ' }) : null, document.createTextNode(message)),
  );
  host.append(node);
  const kill = () => {
    node.style.transition = 'opacity .18s, transform .18s';
    node.style.opacity = '0';
    node.style.transform = 'translateX(14px)';
    setTimeout(() => node.remove(), 200);
  };
  node.addEventListener('click', kill);
  setTimeout(kill, ms);
  return node;
}

/* --------------------------------- modals --------------------------------- */
const stack = [];

export function openModal({ title = '', sub = '', body = null, footer = null, className = '', onClose = null, closable = true, head = true } = {}) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', { class: `modal ${className}` });

  const closeBtn = closable ? el('button', { class: 'modal-x', 'aria-label': 'Close' }) : null;
  if (closeBtn) closeBtn.innerHTML = icon('x', 16);

  if (head !== false) {
    modal.append(el('div', { class: 'modal-head' },
      el('h2', { text: title }),
      sub ? el('span', { class: 'sub', text: sub }) : null,
      closeBtn,
    ));
  }
  if (body) modal.append(el('div', { class: 'modal-body' }, body));
  if (footer) modal.append(el('div', { class: 'modal-foot' }, footer));
  backdrop.append(modal);

  const close = (result) => {
    const idx = stack.indexOf(entry);
    if (idx >= 0) stack.splice(idx, 1);
    backdrop.style.opacity = '0';
    backdrop.style.transition = 'opacity .12s';
    setTimeout(() => backdrop.remove(), 120);
    onClose?.(result);
  };
  const entry = { close, backdrop, modal };
  stack.push(entry);

  if (closeBtn) closeBtn.addEventListener('click', () => close());
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop && closable) close(); });

  document.getElementById('modalRoot').append(backdrop);
  const focusable = modal.querySelector('input, textarea, select, button.primary');
  if (focusable) setTimeout(() => focusable.focus(), 40);

  return { el: modal, close, body: modal.querySelector('.modal-body') };
}

export function closeTop() {
  const top = stack[stack.length - 1];
  if (top) { top.close(); return true; }
  return false;
}

export function hasModal() { return stack.length > 0; }

/* ---------------------------------- menus ---------------------------------- */
let openMenuEl = null;

export function closeMenu() {
  if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; }
  document.removeEventListener('mousedown', outsideMenu, true);
}
function outsideMenu(e) {
  if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu();
}

export function openMenu(anchor, items, opts = {}) {
  closeMenu();
  const menu = el('div', { class: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { menu.append(el('div', { class: 'menu-sep' })); continue; }
    if (it.label) { menu.append(el('div', { class: 'menu-label', text: it.label })); continue; }
    const btn = el('button', { class: `menu-item ${it.danger ? 'danger' : ''} ${it.active ? 'active' : ''}` });
    if (it.icon) btn.insertAdjacentHTML('beforeend', icon(it.icon, 15));
    btn.append(el('span', { text: it.text }));
    if (it.kbd) btn.append(el('kbd', { text: it.kbd }));
    if (it.active) btn.insertAdjacentHTML('beforeend', icon('check', 14));
    btn.addEventListener('click', () => { closeMenu(); it.onClick?.(); });
    menu.append(btn);
  }
  document.body.append(menu);
  openMenuEl = menu;

  let x, y;
  if (anchor && anchor.getBoundingClientRect) {
    const r = anchor.getBoundingClientRect();
    x = opts.alignRight ? r.right - menu.offsetWidth : r.left;
    y = r.bottom + 6;
  } else {
    x = anchor.x; y = anchor.y;
  }
  const maxX = window.innerWidth - menu.offsetWidth - 8;
  const maxY = window.innerHeight - menu.offsetHeight - 8;
  menu.style.left = Math.max(8, Math.min(x, maxX)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, maxY)) + 'px';
  if (opts.alignRight && anchor?.getBoundingClientRect) {
    const r = anchor.getBoundingClientRect();
    if (r.bottom + menu.offsetHeight > window.innerHeight) menu.style.top = Math.max(8, r.top - menu.offsetHeight - 6) + 'px';
  }
  setTimeout(() => document.addEventListener('mousedown', outsideMenu, true), 0);
  return menu;
}

/* --------------------------------- prompt --------------------------------- */
export function promptText({ title = 'Enter text', label = '', value = '', placeholder = '', multiline = false, confirmText = 'Apply' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const input = multiline
      ? el('textarea', { class: 'input', rows: 4, placeholder })
      : el('input', { class: 'input', placeholder });
    input.value = value;
    const body = el('div', {},
      el('div', { class: 'field' }, label ? el('label', { text: label }) : null, input),
    );
    const ok = el('button', { class: 'btn primary', text: confirmText });
    const cancel = el('button', { class: 'btn ghost', text: 'Cancel' });
    const m = openModal({
      title, body, footer: [cancel, ok], className: 'narrow',
      onClose: () => { if (!done) { done = true; resolve(null); } },
    });
    const submit = () => { if (done) return; done = true; resolve(input.value); m.close(); };
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', () => m.close());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !multiline) { e.preventDefault(); submit(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    });
    setTimeout(() => { input.focus(); input.select(); }, 50);
  });
}

export function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const ok = el('button', { class: `btn ${danger ? 'danger' : 'primary'}`, text: confirmText });
    const cancel = el('button', { class: 'btn ghost', text: 'Cancel' });
    const m = openModal({
      title, body: el('p', { class: 'hint', style: { fontSize: '12.5px', lineHeight: '1.6' }, text: message }),
      footer: [cancel, ok], className: 'narrow',
      onClose: () => { if (!done) { done = true; resolve(false); } },
    });
    ok.addEventListener('click', () => { if (done) return; done = true; resolve(true); m.close(); });
    cancel.addEventListener('click', () => m.close());
  });
}

/* ------------------------------- form helpers ------------------------------ */
export function field(labelText, control, hint) {
  return el('div', { class: 'field' },
    labelText ? el('label', { text: labelText }) : null,
    control,
    hint ? el('div', { class: 'hint', text: hint }) : null,
  );
}

export function numberInput(value, { min, max, step } = {}) {
  const i = el('input', { class: 'input', type: 'number', value });
  if (min !== undefined) i.min = min;
  if (max !== undefined) i.max = max;
  i.step = step ?? 'any';
  return i;
}

export function switchEl(on) {
  const b = el('button', { class: `switch ${on ? 'on' : ''}`, type: 'button' });
  b.addEventListener('click', () => b.classList.toggle('on'));
  b.isOn = () => b.classList.contains('on');
  return b;
}

export function uidShort() { return uid(); }
