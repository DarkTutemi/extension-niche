// log.js — FB Ads Research Logfile Full Dashboard

const STORAGE_LOG_KEYS   = ['fbAdsResearchLogs', 'researchLogs'];
const STORAGE_STATE_KEYS = ['fbAdsResearchState', 'researchState'];

const elLogContainer      = document.getElementById('logContainer');
const elStateBadge         = document.getElementById('stateBadge');
const elCurrentProcessInfo = document.getElementById('currentProcessInfo');
const elStatTotal          = document.getElementById('statTotal');
const elStatPass           = document.getElementById('statPass');
const elStatSkip           = document.getElementById('statSkip');
const elStatError          = document.getElementById('statError');
const elLevelFilter        = document.getElementById('levelFilter');
const elSearchInput        = document.getElementById('searchInput');
const elAutoScrollCheck    = document.getElementById('autoScrollCheck');
const elBtnCopy            = document.getElementById('btnCopy');
const elBtnExport          = document.getElementById('btnExport');
const elBtnClear           = document.getElementById('btnClear');

let rawLogs = [];

// Khởi tạo
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  await loadLogs();
  setupEventListeners();
});

// Đọc logs từ storage
async function loadLogs() {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_LOG_KEYS);
      rawLogs = data.fbAdsResearchLogs || data.researchLogs || [];
    } else if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('fbAdsResearchLogs') || localStorage.getItem('researchLogs');
      if (raw) rawLogs = JSON.parse(raw);
    }
  } catch (err) {
    console.debug('[Log] loadLogs error:', err.message);
  }

  if (rawLogs.length === 0) {
    const now = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    rawLogs = [{
      timestamp: now,
      type: 'INFO',
      message: '⚡ FB Ads Research Log Dashboard sẵn sàng. Chưa có tiến trình nào đang chạy.'
    }];
  }

  renderLogs();
}

// Đọc state tiến trình
async function loadState() {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_STATE_KEYS);
      updateStateUI(data.fbAdsResearchState || data.researchState);
    }
  } catch (err) {
    console.debug('[Log] loadState error:', err.message);
  }
}

function updateStateUI(state) {
  if (!state) return;
  const status = state.status || 'IDLE';
  elStateBadge.textContent = status;
  elStateBadge.className = `badge-status status-${status}`;

  if (status === 'RUNNING' || status === 'PAUSED') {
    const kw = state.keywords?.[state.currentKeywordIndex] || '—';
    const pageNum = (state.currentPageIndex || 0) + 1;
    elCurrentProcessInfo.textContent = `Keyword: "${kw}" | Page: #${pageNum}`;
  } else {
    elCurrentProcessInfo.textContent = '—';
  }
}

function renderLogMessageNodes(container, text) {
  if (!text) return;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let lastIdx = 0;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      container.appendChild(document.createTextNode(text.substring(lastIdx, match.index)));
    }
    const a = document.createElement('a');
    a.href = match[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = match[0];
    a.style.color = '#818cf8';
    a.style.textDecoration = 'underline';
    a.style.wordBreak = 'break-all';
    container.appendChild(a);
    lastIdx = urlRegex.lastIndex;
  }
  if (lastIdx < text.length) {
    container.appendChild(document.createTextNode(text.substring(lastIdx)));
  }
}

// Lọc và hiển thị danh sách log
function renderLogs() {
  const selectedLevel = elLevelFilter.value;
  const query = elSearchInput.value.trim().toLowerCase();

  // Thống kê nhanh
  let passCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const entry of rawLogs) {
    const t = entry.type || 'INFO';
    if (t === 'PASS' || t === 'SAVED') passCount++;
    else if (t === 'SKIP') skipCount++;
    else if (t === 'ERROR' || t === 'WARN') errorCount++;
  }

  elStatTotal.textContent = rawLogs.length;
  elStatPass.textContent  = passCount;
  elStatSkip.textContent  = skipCount;
  elStatError.textContent = errorCount;

  // Lọc entries
  const filtered = rawLogs.filter(entry => {
    const t = entry.type || 'INFO';
    if (selectedLevel !== 'ALL' && t !== selectedLevel) {
      return false;
    }
    if (query) {
      const text = `${entry.timestamp || ''} ${entry.type || ''} ${entry.message || ''}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    elLogContainer.innerHTML = `
      <div style="color:#64748b;text-align:center;padding:50px 0;font-size:0.85rem">
        ${rawLogs.length === 0 ? 'Chưa có dữ liệu logfile.' : 'Không có log phù hợp với bộ lọc.'}
      </div>
    `;
    return;
  }

  elLogContainer.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const entry of filtered) {
    const div = document.createElement('div');
    div.className = `log-entry log-${entry.type || 'INFO'}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = entry.timestamp || '';

    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'log-badge';
    badgeSpan.textContent = entry.type || 'INFO';

    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    renderLogMessageNodes(msgSpan, entry.message || '');

    div.appendChild(timeSpan);
    div.appendChild(badgeSpan);
    div.appendChild(msgSpan);
    frag.appendChild(div);
  }

  elLogContainer.appendChild(frag);

  if (elAutoScrollCheck.checked) {
    elLogContainer.scrollTop = elLogContainer.scrollHeight;
  }
}

// Bắt sự kiện
function setupEventListeners() {
  elLevelFilter.addEventListener('change', renderLogs);
  elSearchInput.addEventListener('input', renderLogs);

  // Copy toàn bộ logs đang hiển thị
  elBtnCopy.addEventListener('click', async () => {
    try {
      const lines = rawLogs.map(e => `[${e.timestamp || ''}] [${e.type || 'INFO'}] ${e.message || ''}`);
      await navigator.clipboard.writeText(lines.join('\n'));
      const origText = elBtnCopy.textContent;
      elBtnCopy.textContent = '✅ Đã sao chép!';
      setTimeout(() => { elBtnCopy.textContent = origText; }, 1500);
    } catch (err) {
      console.debug('[Log] Copy error:', err.message);
      alert('Không thể sao chép: ' + err.message);
    }
  });

  // Tải file .log
  elBtnExport.addEventListener('click', () => {
    try {
      const lines = rawLogs.map(e => `[${e.timestamp || ''}] [${e.type || 'INFO'}] ${e.message || ''}`);
      const text = lines.join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const dateTag = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
      a.href = url;
      a.download = `fb_ads_research_${dateTag}.log`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.debug('[Log] Export error:', err.message);
    }
  });

  // Xóa log
  elBtnClear.addEventListener('click', async () => {
    if (!confirm('Ông chủ có chắc chắn muốn xóa toàn bộ log hiện tại không?')) return;
    try {
      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' });
      }
      rawLogs = [];
      renderLogs();
    } catch (err) {
      console.debug('[Log] Clear error:', err.message);
    }
  });

  // Lắng nghe cập nhật realtime từ chrome.storage
  if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.fbAdsResearchLogs || changes.researchLogs) {
        rawLogs = changes.fbAdsResearchLogs?.newValue || changes.researchLogs?.newValue || [];
        renderLogs();
      }
      if (changes.fbAdsResearchState || changes.researchState) {
        updateStateUI(changes.fbAdsResearchState?.newValue || changes.researchState?.newValue);
      }
    });
  }

  // Lắng nghe broadcast trực tiếp từ background
  if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'NEW_LOG_ENTRY') {
        if (msg.payload?.logs) {
          rawLogs = msg.payload.logs;
          renderLogs();
        } else if (msg.payload?.entry) {
          rawLogs.push(msg.payload.entry);
          renderLogs();
        }
      }
    });
  }
}
