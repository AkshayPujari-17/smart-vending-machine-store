/**
 * Physical-style product keypad.
 * Keys append to a product code buffer, CLR clears it, OK submits it.
 */
const KEYS = [
  { label: 'A', value: 'A' },
  { label: 'B', value: 'B' },
  { label: 'C', value: 'C' },
  { label: 'D', value: 'D' },
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '4', value: '4' },
  { label: '5', value: '5' },
  { label: '6', value: '6' },
  { label: '7', value: '7' },
  { label: '8', value: '8' },
  { label: '9', value: '9' },
  { label: 'CLR', value: 'CLR', className: 'key--clr' },
  { label: '0', value: '0' },
  { label: 'OK', value: 'OK', className: 'key--ok' },
];

export function createKeypad(root, { onKey }) {
  root.innerHTML = KEYS.map(
    (key) => `
      <button class="key ${key.className || ''}" type="button" data-key="${key.value}">${key.label}</button>`
  ).join('');

  root.addEventListener('click', (event) => {
    const button = event.target.closest('.key');
    if (!button) return;
    onKey(button.dataset.key);
  });

  return { keys: KEYS.map((k) => k.value) };
}
