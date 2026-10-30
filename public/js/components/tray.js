/**
 * Collection tray component.
 */
export function createTray() {
  const list = document.getElementById('trayItems');
  const empty = document.getElementById('trayEmpty');

  function itemHtml(item) {
    return `
      <li class="tray-item">
        <img src="${item.image}" alt="" />
        <span class="tray-item__text">
          <span class="tray-item__code">${item.code}</span>
          <span class="tray-item__name">${escapeHtml(item.name)}</span>
        </span>
      </li>`;
  }

  return {
    render(items) {
      list.innerHTML = (items || []).map(itemHtml).join('');
      empty.style.display = list.children.length ? 'none' : '';
    },
    add(item) {
      list.insertAdjacentHTML('beforeend', itemHtml(item));
      empty.style.display = 'none';
      return list.lastElementChild;
    },
    clear() {
      list.innerHTML = '';
      empty.style.display = '';
    },
    count() {
      return list.children.length;
    },
  };
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
