/** Toast notifications (bottom-right). */
const host = () => document.getElementById('toasts');

export function toast(message, tone = 'info', timeout = 4000) {
  const container = host();
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  container.appendChild(el);

  const remove = () => {
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), 320);
  };
  window.setTimeout(remove, timeout);
  el.addEventListener('click', remove);
}
