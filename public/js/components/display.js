/**
 * Display component: LED balance read-out, LCD status screen, change + code.
 */
import { formatRupees } from '../api.js';

const IDLE = {
  title: 'WELCOME',
  text: '1. Insert coins. 2. Select your drink. 3. Collect your product and change.',
  tone: 'ok',
};

export function createDisplay() {
  const balanceValue = document.getElementById('balanceValue');
  const statusScreen = document.getElementById('statusScreen');
  const statusTitle = document.getElementById('statusTitle');
  const statusText = document.getElementById('statusText');
  const changeValue = document.getElementById('changeValue');
  const codeValue = document.getElementById('codeValue');

  let displayedPaise = 0;

  return {
    setBalance(paise, { animate = true } = {}) {
      balanceValue.textContent = formatRupees(paise);
      changeValue.textContent = formatRupees(paise);
      if (animate && paise !== displayedPaise) {
        balanceValue.classList.remove('is-bump');
        void balanceValue.offsetWidth; // restart animation
        balanceValue.classList.add('is-bump');
      }
      displayedPaise = paise;
    },

    get balancePaise() {
      return displayedPaise;
    },

    setStatus(title, text, tone = 'ok') {
      statusTitle.textContent = title;
      statusText.textContent = text;
      statusScreen.classList.remove('tone-info', 'tone-warn', 'tone-error');
      if (tone === 'info') statusScreen.classList.add('tone-info');
      if (tone === 'warn') statusScreen.classList.add('tone-warn');
      if (tone === 'error') statusScreen.classList.add('tone-error');
    },

    idle() {
      this.setStatus(IDLE.title, IDLE.text, IDLE.tone);
    },

    setCode(code) {
      codeValue.textContent = code || '—';
    },
  };
}
