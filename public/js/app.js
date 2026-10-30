/**
 * Smart Vending Machine Store – main controller.
 *
 * Wires together the display, product grid, coin pad, keypad, tray and the
 * dispensing animation. All money values come from the server.
 */
import { api, formatRupees } from './api.js';
import { sounds } from './sounds.js';
import { toast } from './toast.js';
import { createDisplay } from './components/display.js';
import { createProductGrid } from './components/productGrid.js';
import { createCoinPad } from './components/coinPad.js';
import { createKeypad } from './components/keypad.js';
import { createTray } from './components/tray.js';
import { runDispensingAnimation, animateRefundCoins } from './dispenser.js';

/* ------------------------------- state --------------------------------- */

const state = {
  products: [],
  balancePaise: 0,
  tray: [],
  busy: false, // true while dispensing (duplicate-click guard)
  code: '', // keypad buffer
};

/* ----------------------------- components ------------------------------ */

const display = createDisplay();
const tray = createTray();
const grid = createProductGrid(document.getElementById('productGrid'), {
  onSelect: (code) => handleSelect(code),
});
const coinPad = createCoinPad(document.getElementById('coinPad'), {
  onInsert: (value, button) => handleInsert(value, button),
});
createKeypad(document.getElementById('keypad'), { onKey: handleKey });

const flap = document.getElementById('flap');
const fx = document.getElementById('fxLayer');
const coinSlot = document.getElementById('coinSlot');
const trayItems = document.getElementById('trayItems');

/* ------------------------------ helpers -------------------------------- */

function setStatus(title, text, tone = 'ok') {
  display.setStatus(title, text, tone);
}

function refuse(message, tone = 'warn', title = 'PLEASE NOTE') {
  sounds.error();
  setStatus(title, message, tone);
  toast(message, tone === 'error' ? 'error' : 'warn');
}

function coinFly(button) {
  const buttonRect = button.getBoundingClientRect();
  const slotRect = coinSlot.getBoundingClientRect();

  const coin = document.createElement('div');
  coin.className = 'flying-coin';
  coin.textContent = '₹';
  coin.style.left = `${buttonRect.left + buttonRect.width / 2 - 17}px`;
  coin.style.top = `${buttonRect.top + buttonRect.height / 2 - 17}px`;
  fx.appendChild(coin);

  const dx = slotRect.left + slotRect.width / 2 - (buttonRect.left + buttonRect.width / 2);
  const dy = slotRect.top + slotRect.height / 2 - (buttonRect.top + buttonRect.height / 2);

  const done = () => coin.remove();
  if (typeof coin.animate === 'function') {
    const animation = coin.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.5 - 70}px) scale(1.2)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0, offset: 1 },
      ],
      { duration: 640, easing: 'cubic-bezier(0.4, 0.05, 0.7, 1)' }
    );
    animation.finished.then(done).catch(done);
  } else {
    setTimeout(done, 640);
  }

  coinSlot.classList.add('is-active');
  setTimeout(() => coinSlot.classList.remove('is-active'), 700);
}

function findProduct(code) {
  return state.products.find((p) => p.code === String(code).toUpperCase());
}

/* ------------------------------ loading -------------------------------- */

async function loadProducts() {
  const data = await api.products();
  state.products = data.products;
  grid.render(state.products);
}

async function loadState() {
  const session = await api.state();
  state.balancePaise = session.balancePaise;
  state.tray = session.tray || [];
  display.setBalance(session.balancePaise, { animate: false });
  tray.render(state.tray);
}

/* --------------------------- interactions ------------------------------ */

async function handleInsert(value, button) {
  if (state.busy) {
    refuse('Please wait — the machine is dispensing your drink.');
    return;
  }

  try {
    const result = await api.insert(value);
    state.balancePaise = result.balancePaise;
    display.setBalance(result.balancePaise);
    coinFly(button);
    sounds.coin();
    setStatus('COIN ACCEPTED', `${result.message}. Select a drink or insert more coins.`, 'info');
  } catch (err) {
    refuse(err.message, 'error');
  }
}

async function handleSelect(code) {
  if (state.busy) {
    // Duplicate click while dispensing → ignored on purpose.
    sounds.click();
    return;
  }

  const normalised = String(code || '').trim().toUpperCase();
  display.setCode(normalised);

  const product = findProduct(normalised);
  if (!product) {
    refuse(`Invalid product code "${normalised}". Check the code printed under the button.`, 'error');
    grid.reject(normalised);
    return;
  }
  if (!product.available) {
    refuse(`${product.name} is currently switched off by the operator. Please choose another drink.`, 'error');
    grid.reject(normalised);
    return;
  }
  if (product.stock <= 0) {
    refuse(`Sorry, ${product.name} is SOLD OUT. Please choose another drink.`, 'error');
    grid.reject(normalised);
    return;
  }
  if (state.balancePaise < product.pricePaise) {
    // Friendly pre-check – the server validates again before deducting.
    const required = product.pricePaise - state.balancePaise;
    refuse(
      `Insufficient balance. Please insert ${formatRupees(required)} more for ${product.name}.`,
      'warn',
      'INSERT MORE COINS'
    );
    grid.reject(normalised);
    return;
  }

  state.busy = true;
  grid.setBusy(true);
  sounds.click();

  try {
    const result = await api.purchase(normalised);

    setStatus('PROCESSING', `${result.message} Price: ${result.price}. Change due: ${result.change}.`, 'info');

    await runDispensingAnimation({
      code: result.product.code,
      image: result.product.image,
      grid,
      flap,
      trayItems,
      fx,
    });

    // Update local state with the server's authoritative values.
    state.balancePaise = result.balancePaise;
    state.tray = result.tray;
    display.setBalance(result.balancePaise);
    tray.render(state.tray);

    await loadProducts();

    const changeHint =
      result.changePaise > 0
        ? `Change due: ${result.change}. Press COLLECT & FINISH to take it, or buy another drink.`
        : 'Press COLLECT & FINISH to complete, or buy another drink.';

    setStatus('ENJOY!', `${result.product.name} dispensed. ${changeHint}`, 'ok');
    toast(`${result.product.name} dispensed — collect it from the tray.`, 'success');
    sounds.success();
  } catch (err) {
    grid.reject(normalised);
    const tone = err.status === 402 ? 'warn' : 'error';
    const title =
      err.code === 'INSUFFICIENT_BALANCE'
        ? 'INSERT MORE COINS'
        : err.code === 'SOLD_OUT'
          ? 'SOLD OUT'
          : err.code === 'BUSY'
            ? 'PLEASE WAIT'
            : 'CANNOT DISPENSE';
    setStatus(title, err.message, tone);
    toast(err.message, tone === 'warn' ? 'warn' : 'error');
    sounds.error();
  } finally {
    state.busy = false;
    grid.setBusy(false);
    grid.markProcessing(normalised, false);
    display.setCode('');
    state.code = '';
  }
}

async function handleCancel() {
  if (state.busy) {
    refuse('Please wait — the machine is dispensing your drink.');
    return;
  }
  sounds.click();

  try {
    const result = await api.cancel();
    state.balancePaise = result.balancePaise;
    display.setBalance(result.balancePaise);

    if (result.refundPaise > 0) {
      sounds.refund();
      animateRefundCoins(fx, coinSlot, trayItems, 4);
    } else {
      sounds.click();
    }

    setStatus('REFUND', result.message, 'warn');
    toast(result.message, 'warn');
  } catch (err) {
    refuse(err.message, 'error');
  }
}

async function handleCollect() {
  if (state.busy) {
    refuse('Please wait — the machine is dispensing your drink.');
    return;
  }
  sounds.click();

  try {
    const result = await api.collect();
    state.balancePaise = result.balancePaise;
    state.tray = [];
    display.setBalance(result.balancePaise);
    tray.clear();

    if (result.changePaise > 0) sounds.refund();
    else sounds.success();

    setStatus('THANK YOU', result.message, 'ok');
    toast(result.message, 'success');
    setTimeout(() => display.idle(), 6000);
  } catch (err) {
    refuse(err.message, 'error');
  }
}

function handleKey(key) {
  sounds.click();

  if (state.busy) return;

  if (key === 'CLR') {
    state.code = '';
    display.setCode('');
    return;
  }

  if (key === 'OK') {
    const code = state.code;
    state.code = '';
    if (!code) {
      setStatus('ENTER CODE', 'Type a product code (e.g. A1) and press OK, or press a product button.', 'warn');
      return;
    }
    handleSelect(code);
    return;
  }

  if (state.code.length >= 3) return;
  state.code += key;
  display.setCode(state.code);

  // Auto-submit as soon as the buffer matches a known product code.
  const match = findProduct(state.code);
  if (match && match.code === state.code) {
    const code = state.code;
    state.code = '';
    handleSelect(code);
  }
}

/* ------------------------------- wiring -------------------------------- */

const muteBtn = document.getElementById('muteBtn');
const muteIcon = document.getElementById('muteIcon');
const muteLabel = document.getElementById('muteLabel');

function syncMuteButton() {
  muteBtn.setAttribute('aria-pressed', String(sounds.muted));
  muteIcon.textContent = sounds.muted ? '🔇' : '🔊';
  muteLabel.textContent = sounds.muted ? 'Muted' : 'Sound';
}

muteBtn.addEventListener('click', () => {
  sounds.toggle();
  syncMuteButton();
  toast(sounds.muted ? 'Sound muted' : 'Sound enabled', 'info', 1800);
});

document.getElementById('cancelBtn').addEventListener('click', handleCancel);
document.getElementById('collectBtn').addEventListener('click', handleCollect);

// Physical keyboard support: type a code (A1 … C4) and press Enter.
document.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const key = event.key;
  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    handleKey(key);
  } else if (/^[a-dA-D]$/.test(key)) {
    event.preventDefault();
    handleKey(key.toUpperCase());
  } else if (key === 'Enter') {
    event.preventDefault();
    handleKey('OK');
  } else if (key === 'Backspace' || key === 'Escape') {
    event.preventDefault();
    handleKey('CLR');
  }
});

/* -------------------------------- boot --------------------------------- */

async function init() {
  syncMuteButton();
  display.setBalance(0, { animate: false });
  display.idle();

  try {
    await Promise.all([loadProducts(), loadState()]);
  } catch (err) {
    setStatus('MACHINE OFFLINE', err.message, 'error');
    toast(err.message, 'error');
    // Retry once after a few seconds (e.g. server still starting up).
    setTimeout(() => {
      Promise.all([loadProducts(), loadState()])
        .then(() => {
          display.idle();
          toast('Machine reconnected.', 'success', 2500);
        })
        .catch(() => {});
    }, 4000);
  }
}

init();
