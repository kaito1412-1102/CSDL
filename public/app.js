// ─── State ───────────────────────────────────────────────────────
let subjects = [];
let currentMon = null;
let nhanxetList = [];
let popupTriggerBtn = null;   // button that opened the nhận xét popup
let currentNhanxetInput = null; // text input to fill when option selected

// ─── Column Coordinate Utils ──────────────────────────────────────

function colLetterToIndex(letter) {
  letter = letter.toUpperCase();
  let index = 0;
  for (let i = 0; i < letter.length; i++) {
    index = index * 26 + (letter.charCodeAt(i) - 64);
  }
  return index - 1; // 0-based
}

function colIndexToLetter(index) {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

// Parse "H10" → {col: 7, row: 9} (0-based)
function parseCoord(coord) {
  const match = String(coord).match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  return {
    col: colLetterToIndex(match[1]),
    row: parseInt(match[2]) - 1,
  };
}

// Convert 0-based row+col → Excel address "H10"
function toExcelAddr(row, col) {
  return colIndexToLetter(col) + (row + 1);
}

// ─── Toast ────────────────────────────────────────────────────────

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `fixed bottom-6 right-6 px-4 py-2.5 rounded-lg shadow-lg text-sm z-50 text-white ${isError ? 'bg-red-600' : 'bg-green-600'}`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ─── Escape HTML ──────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    subjects = config.mon || [];
    renderSidebar(subjects);
  } catch (e) {
    document.getElementById('mon-list').innerHTML =
      '<p class="text-red-400 text-xs p-2">Lỗi tải config.json</p>';
  }
}

function renderSidebar(monList) {
  const nav = document.getElementById('mon-list');
  if (!monList.length) {
    nav.innerHTML = '<p class="text-blue-400 text-xs p-2">Không có môn học nào</p>';
    return;
  }
  nav.innerHTML = monList.map((mon, i) => `
    <button onclick="selectMon(${i})"
      class="mon-btn w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors capitalize"
      data-index="${i}">
      📖 ${esc(mon.name)}
    </button>
  `).join('');
}

// ─── Select Subject ───────────────────────────────────────────────

async function selectMon(index) {
  const mon = subjects[index];
  if (!mon) return;
  currentMon = mon;

  document.querySelectorAll('.mon-btn').forEach(btn => {
    btn.classList.toggle('bg-blue-700', parseInt(btn.dataset.index) === index);
    btn.classList.toggle('font-semibold', parseInt(btn.dataset.index) === index);
  });

  document.getElementById('mon-title').textContent = `Môn: ${mon.name}`;
  document.getElementById('mon-subtitle').textContent = mon.path;
  document.getElementById('btn-export').classList.remove('hidden');

  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('table-wrapper').classList.add('hidden');
  document.getElementById('loading-state').classList.remove('hidden');

  try {
    const [bdRes, nxRes] = await Promise.all([
      fetch('/api/bangdiem/' + encodeURIComponent(mon.name)),
      fetch('/api/nhanxet/' + encodeURIComponent(mon.name)),
    ]);
    const bdData = await bdRes.json();
    const nxData = await nxRes.json();

    if (bdData.error) throw new Error(bdData.error);
    nhanxetList = Array.isArray(nxData) ? nxData : [];

    renderTable(bdData.rows, mon);
  } catch (e) {
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('empty-state').innerHTML = `
      <div class="text-center text-red-400">
        <div class="text-5xl mb-3">⚠️</div>
        <p class="text-lg">Lỗi: ${esc(e.message)}</p>
      </div>`;
  }
}

// ─── Render Table ─────────────────────────────────────────────────

function renderTable(rows, mon) {
  const mdc   = parseCoord(mon.mucdatduoc);
  const dktdk = parseCoord(mon.diemKTDK);
  const nx    = parseCoord(mon.nhanxet);

  const startRow = Math.min(mdc.row, dktdk.row, nx.row);
  const numCols  = rows.reduce((max, r) => Math.max(max, r.length), 1);

  // Header row: column letters + row-number placeholder
  const letters = Array.from({ length: numCols }, (_, i) => colIndexToLetter(i));
  document.getElementById('table-head').innerHTML = `
    <tr class="bg-gray-200 sticky top-0 z-10">
      <th class="col-rownum border border-gray-300 px-2 py-1 text-gray-500 text-xs">#</th>
      ${letters.map(l => `<th class="border border-gray-300 px-3 py-1 text-gray-500 text-xs font-mono">${l}</th>`).join('')}
    </tr>`;

  // Data rows
  document.getElementById('table-body').innerHTML = rows.map((row, rowIdx) => {
    const cells = Array.from({ length: numCols }, (_, ci) => row[ci] ?? '');
    const isDataRow = rowIdx >= startRow;
    const rowBg = !isDataRow
      ? 'bg-gray-50'
      : rowIdx % 2 === 0 ? 'bg-white' : 'bg-blue-50/40';

    const tds = cells.map((val, colIdx) => {
      const isMdc   = isDataRow && colIdx === mdc.col;
      const isDktdk = isDataRow && colIdx === dktdk.col;
      const isNx    = isDataRow && colIdx === nx.col;

      if (isMdc) {
        return `
          <td class="editable-cell border border-gray-300 p-0"
              data-row="${rowIdx}" data-col="${colIdx}" data-type="mucdatduoc">
            <select class="cell-select w-full px-2 py-1 focus:outline-none focus:bg-blue-50">
              <option value=""></option>
              <option value="H" ${val === 'H' ? 'selected' : ''}>H</option>
              <option value="T" ${val === 'T' ? 'selected' : ''}>T</option>
            </select>
          </td>`;
      }

      if (isDktdk) {
        const options = Array.from({ length: 10 }, (_, i) => {
          const v = i + 1;
          return `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${v}</option>`;
        }).join('');
        return `
          <td class="editable-cell border border-gray-300 p-0"
              data-row="${rowIdx}" data-col="${colIdx}" data-type="diemKTDK">
            <select class="cell-select w-full px-2 py-1 focus:outline-none focus:bg-blue-50"
                    onchange="autoDanhGia(this, ${rowIdx})">
              <option value=""></option>
              ${options}
            </select>
          </td>`;
      }

      if (isNx) {
        return `
          <td class="editable-cell border border-gray-300 p-0"
              data-row="${rowIdx}" data-col="${colIdx}" data-type="nhanxet">
            <div class="flex items-center">
              <input type="text" value="${esc(String(val))}"
                class="flex-1 px-2 py-1 focus:outline-none focus:bg-blue-50 min-w-0 text-sm"
                placeholder="Nhập nhận xét...">
              <button onclick="openNhanxetPopup(this)"
                class="flex-shrink-0 px-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded text-base leading-none py-1"
                title="Chọn từ danh sách">📋</button>
            </div>
          </td>`;
      }

      // Read-only
      const textColor = isDataRow ? 'text-gray-700' : 'text-gray-500';
      return `<td class="border border-gray-300 px-3 py-1 ${textColor} whitespace-nowrap">${esc(String(val))}</td>`;
    }).join('');

    return `
      <tr class="${rowBg} hover:brightness-95 transition-all">
        <td class="col-rownum border border-gray-300 px-2 py-1 text-gray-400 text-xs text-center">${rowIdx + 1}</td>
        ${tds}
      </tr>`;
  }).join('');

  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('table-wrapper').classList.remove('hidden');
}

// ─── Nhận xét Popup ───────────────────────────────────────────────

function openNhanxetPopup(btn) {
  popupTriggerBtn = btn;
  currentNhanxetInput = btn.closest('td').querySelector('input[type="text"]');

  const popup = document.getElementById('nhanxet-popup');
  const rect = btn.getBoundingClientRect();

  // Position below the button, keep within viewport
  let top  = rect.bottom + window.scrollY + 4;
  let left = rect.left + window.scrollX;
  if (left + 320 > window.innerWidth) left = window.innerWidth - 328;

  popup.style.top  = top + 'px';
  popup.style.left = left + 'px';

  document.getElementById('nhanxet-search').value = '';
  renderNhanxetList(nhanxetList);
  popup.classList.remove('hidden');
  setTimeout(() => document.getElementById('nhanxet-search').focus(), 50);
}

function filterNhanxet(query) {
  const q = query.toLowerCase();
  const filtered = nhanxetList.filter(item =>
    item.ma.toLowerCase().includes(q) || item.noiDung.toLowerCase().includes(q)
  );
  renderNhanxetList(filtered);
}

function renderNhanxetList(list) {
  const container = document.getElementById('nhanxet-list');
  if (!list.length) {
    container.innerHTML = '<p class="text-gray-400 text-sm p-3 text-center">Không có kết quả</p>';
    return;
  }
  container.innerHTML = list.map(item => `
    <button onclick="selectNhanxet('${esc(item.noiDung)}')"
      class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0">
      <span class="font-mono text-blue-600 text-xs font-semibold">${esc(item.ma)}</span>
      <span class="mx-2 text-gray-300">—</span>
      <span class="text-gray-700">${esc(item.noiDung)}</span>
    </button>`).join('');
}

function selectNhanxet(noiDung) {
  if (currentNhanxetInput) {
    currentNhanxetInput.value = noiDung;
  }
  closeNhanxetPopup();
}

function closeNhanxetPopup() {
  document.getElementById('nhanxet-popup').classList.add('hidden');
  popupTriggerBtn = null;
  currentNhanxetInput = null;
}

// Close popup on outside click
document.addEventListener('click', e => {
  const popup = document.getElementById('nhanxet-popup');
  if (popup.classList.contains('hidden')) return;
  if (!popup.contains(e.target) && e.target !== popupTriggerBtn) {
    closeNhanxetPopup();
  }
});

// ─── Export ───────────────────────────────────────────────────────

async function exportData() {
  if (!currentMon) return;

  const cells = [];
  document.querySelectorAll('[data-type]').forEach(td => {
    const row  = parseInt(td.dataset.row);
    const col  = parseInt(td.dataset.col);
    const type = td.dataset.type;
    const addr = toExcelAddr(row, col);
    let value  = '';

    if (type === 'mucdatduoc' || type === 'diemKTDK') {
      const sel = td.querySelector('select');
      value = sel ? sel.value : '';
    } else if (type === 'nhanxet') {
      const inp = td.querySelector('input');
      value = inp ? inp.value : '';
    }

    // Store điểm as number
    if (type === 'diemKTDK' && value !== '') {
      value = Number(value);
    }

    cells.push({ address: addr, value });
  });

  try {
    const res = await fetch('/api/export/' + encodeURIComponent(currentMon.name), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cells }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Đã xuất Excel thành công!');
    } else {
      showToast('❌ Lỗi: ' + (data.error || 'Không xuất được'), true);
    }
  } catch (e) {
    showToast('❌ Lỗi kết nối server', true);
  }
}

// ─── Auto điền mức đạt được khi chọn điểm ────────────────────────
function autoDanhGia(diemSelect, rowIdx) {
  const diem = parseInt(diemSelect.value);
  if (isNaN(diem)) return;

  const mdcTd = document.querySelector(`[data-type="mucdatduoc"][data-row="${rowIdx}"]`);
  if (!mdcTd) return;

  const mdcSelect = mdcTd.querySelector('select');
  if (!mdcSelect) return;

  mdcSelect.value = diem >= 9 ? 'T' : 'H';
}

// ─── Start ────────────────────────────────────────────────────────
init();
