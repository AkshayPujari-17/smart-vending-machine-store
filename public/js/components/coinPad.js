/**
 * Coin pad component – one button per accepted Indian denomination.
 */
export const DENOMINATIONS = [100, 200, 500, 1000, 2000, 5000]; // paise: ₹1 … ₹50

export function createCoinPad(root, { onInsert }) {
  root.innerHTML = DENOMINATIONS.map(
    (value) => `
      <button class="coin-btn" type="button" data-value="${value}" aria-label="Insert ₹${value / 100}">
        ₹${value / 100}
        <small>INSERT</small>
      </button>`
  ).join('');

  root.addEventListener('click', (event) => {
    const button = event.target.closest('.coin-btn');
    if (!button) return;
    onInsert(Number(button.dataset.value), button);
  });

  return { denominations: DENOMINATIONS };
}
