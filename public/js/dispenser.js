/**
 * Dispensing animation.
 *
 * Sequence:
 *   1. the product cell lights up and shows "PROCESSING…"
 *   2. a motor sound starts
 *   3. the dispensing flap swings open
 *   4. a flying copy of the product travels from its shelf into the chute
 *   5. it drops into the collection tray and the flap closes again
 *
 * Works for every product (code + image are passed in).
 */
import { sounds } from './sounds.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function animate(el, keyframes, options) {
  if (typeof el.animate !== 'function') return Promise.resolve();
  try {
    return el.animate(keyframes, options).finished.catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

export async function runDispensingAnimation({ code, image, grid, flap, trayItems, fx }) {
  grid.markProcessing(code, true);
  sounds.dispensing();

  if (reducedMotion) {
    await wait(150);
    grid.markProcessing(code, false);
    return;
  }

  const sourceImg = grid.getCellImage(code);
  if (!sourceImg) {
    await wait(500);
    grid.markProcessing(code, false);
    return;
  }

  const from = sourceImg.getBoundingClientRect();
  const flapRect = flap.getBoundingClientRect();
  const trayRect = trayItems.getBoundingClientRect();

  // Flying copy of the product
  const clone = document.createElement('img');
  clone.src = image;
  clone.alt = '';
  clone.className = 'flying-product';
  clone.style.left = `${from.left}px`;
  clone.style.top = `${from.top}px`;
  clone.style.width = `${from.width}px`;
  clone.style.height = `${from.height}px`;
  fx.appendChild(clone);

  // 1. short "machine reads the code" pause
  await wait(340);

  // 2. flap opens
  flap.classList.add('is-open');
  sounds.flap();

  // 3. flight from the shelf to the chute opening
  const dx = flapRect.left + flapRect.width / 2 - (from.left + from.width / 2);
  const dy = flapRect.top + 4 - (from.top + from.height / 2);

  await animate(
    clone,
    [
      { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.18}px, ${dy * 0.4}px) rotate(80deg) scale(1.04)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) rotate(215deg) scale(0.82)`, opacity: 1, offset: 1 },
    ],
    { duration: 700, easing: 'cubic-bezier(0.35, 0.05, 0.6, 1)', fill: 'forwards' }
  );

  // 4. it disappears behind the flap…
  await animate(
    clone,
    [
      { transform: `translate(${dx}px, ${dy}px) rotate(215deg) scale(0.82)`, opacity: 1, offset: 0 },
      { transform: `translate(${dx}px, ${dy + 46}px) rotate(265deg) scale(0.55)`, opacity: 0, offset: 1 },
    ],
    { duration: 240, easing: 'ease-in', fill: 'forwards' }
  );

  // 5. …and re-appears falling into the collection tray
  await wait(120);
  const landWidth = from.width * 0.78;
  const landHeight = from.height * 0.78;
  clone.style.left = `${trayRect.left + trayRect.width * 0.16}px`;
  clone.style.top = `${trayRect.top + 4}px`;
  clone.style.width = `${landWidth}px`;
  clone.style.height = `${landHeight}px`;

  await animate(
    clone,
    [
      { transform: 'translateY(-74px) rotate(-28deg) scale(0.95)', opacity: 0.15, offset: 0 },
      { transform: 'translateY(6px) rotate(3deg) scale(0.86)', opacity: 1, offset: 0.82 },
      { transform: 'translateY(0px) rotate(0deg) scale(0.86)', opacity: 1, offset: 1 },
    ],
    { duration: 460, easing: 'cubic-bezier(0.3, 1.35, 0.5, 1)', fill: 'forwards' }
  );

  clone.remove();

  // 6. flap closes again
  await wait(320);
  flap.classList.remove('is-open');
  grid.markProcessing(code, false);
}

/** Short burst of coins flying from the coin slot into the tray (refunds). */
export function animateRefundCoins(fx, coinSlot, trayItems, count = 4) {
  if (reducedMotion || !fx || !coinSlot || !trayItems) return;
  const slot = coinSlot.getBoundingClientRect();
  const tray = trayItems.getBoundingClientRect();

  for (let i = 0; i < count; i += 1) {
    const coin = document.createElement('div');
    coin.className = 'flying-coin';
    coin.textContent = '₹';
    coin.style.left = `${slot.left + slot.width / 2 - 17}px`;
    coin.style.top = `${slot.top + slot.height / 2 - 17}px`;
    fx.appendChild(coin);

    const dx = tray.left + tray.width * (0.12 + i * 0.16) - (slot.left + slot.width / 2);
    const dy = tray.top + tray.height * 0.5 - (slot.top + slot.height / 2);

    const animation = coin.animate(
      [
        { transform: 'translate(0, 0) scale(0.7)', opacity: 0, offset: 0 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.85)`, opacity: 1, offset: 1 },
      ],
      { duration: 760, delay: i * 110, easing: 'cubic-bezier(0.3, 0.1, 0.6, 1)', fill: 'forwards' }
    );
    const cleanup = () => coin.remove();
    if (animation && animation.finished) animation.finished.then(cleanup).catch(cleanup);
    else setTimeout(cleanup, 1400);
  }
}
