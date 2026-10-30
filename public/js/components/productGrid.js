/**
 * Product grid component — renders one physical-style selection button per
 * product inside the glass window of the machine.
 */
import { formatRupees } from '../api.js';

function stockLabel(product) {
  if (!product.available) return 'Disabled';
  if (product.stock <= 0) return 'Sold out';
  if (product.lowStock) return `Only ${product.stock} left`;
  return `${product.stock} in stock`;
}

function cellHtml(product) {
  const classes = ['product'];
  if (!product.available) classes.push('is-off');
  else if (product.stock <= 0) classes.push('is-soldout');
  else if (product.lowStock) classes.push('is-low');

  const disabled = !product.available || product.stock <= 0;

  return `
    <article class="${classes.join(' ')}" data-code="${product.code}">
      <div class="product__stage">
        <span class="product__code">${product.code}</span>
        <span class="product__flag product__flag--low">LOW STOCK</span>
        <span class="product__flag product__flag--out">SOLD OUT</span>
        <span class="product__flag product__flag--off">UNAVAILABLE</span>
        <img class="product__img" src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy" />
      </div>
      <div class="product__info">
        <span class="product__name">${escapeHtml(product.name)}</span>
        <span class="product__price">${formatRupees(product.pricePaise)}</span>
        <span class="product__meta"><span class="stock-dot"></span><span>${stockLabel(product)}</span></span>
      </div>
      <button class="select-btn" type="button" data-code="${product.code}"
              aria-label="Select ${escapeHtml(product.name)}" ${disabled ? 'disabled' : ''}>${product.code}</button>
    </article>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createProductGrid(root, { onSelect }) {
  let busy = false;

  root.addEventListener('click', (event) => {
    const button = event.target.closest('.select-btn');
    if (!button || button.disabled) return;
    onSelect(button.dataset.code);
  });

  function applyBusy() {
    root.querySelectorAll('.select-btn').forEach((btn) => {
      const article = btn.closest('.product');
      const unavailable = article.classList.contains('is-soldout') || article.classList.contains('is-off');
      btn.disabled = busy || unavailable;
    });
  }

  return {
    render(products) {
      root.innerHTML = products.map(cellHtml).join('');
      applyBusy();
    },
    setBusy(value) {
      busy = Boolean(value);
      applyBusy();
    },
    getCell(code) {
      return root.querySelector(`.product[data-code="${cssEscape(code)}"]`);
    },
    getCellImage(code) {
      const cell = this.getCell(code);
      return cell ? cell.querySelector('.product__img') : null;
    },
    markProcessing(code, on = true) {
      const cell = this.getCell(code);
      if (!cell) return;
      cell.classList.toggle('is-dispensing', on);
      let overlay = cell.querySelector('.processing');
      if (on && !overlay) {
        overlay = document.createElement('div');
        overlay.className = 'processing';
        overlay.innerHTML = '<div>PROCESSING…</div>';
        cell.querySelector('.product__stage').appendChild(overlay);
      } else if (!on && overlay) {
        overlay.remove();
      }
    },
    /** Shake animation for failed selections. */
    reject(code) {
      const cell = this.getCell(code);
      if (!cell) return;
      cell.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-7px)' },
          { transform: 'translateX(7px)' },
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 330, easing: 'ease-in-out' }
      );
    },
  };
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}
