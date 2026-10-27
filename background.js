/**
 * background.js – Service Worker điều phối toàn bộ flow nghiên cứu
 * ==================================================================
 * MV3 Service Worker có thể bị terminate bất kỳ lúc nào.
 * → Mọi state đều lưu chrome.storage.local sau MỖI bước.
 * → Khi worker khởi động lại, tự resume nếu đang RUNNING.
 *
 * Flow chính:
 *   START → Lặp keyword → Crawl Page → Lặp Page:
 *     → Đọc active/inactive → Tính ratio → (Phase 3: ads + website)
 *     → (Phase 4: ghi Sheet)
 *   Mỗi bước đều saveState(). Stop/CAPTCHA → PAUSED, Resume tiếp.
 */

importScripts('selectors.js');

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const STORAGE_STATE_KEY = 'fbAdsResearchState';
const STORAGE_LOG_KEY   = 'fbAdsResearchLogs';
const LEGACY_STATE_KEY  = 'researchState';
const LEGACY_LOG_KEY    = 'researchLogs';
const MAX_LOGS          = 500;
const KEEPALIVE_ALARM   = 'research-keepalive';

// ═══════════════════════════════════════════════════════════════════
//  DEFAULT STATE
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_STATE = {
  status: 'IDLE',            // IDLE | RUNNING | PAUSED | STOPPED | COMPLETED
  niche: '',
  keywords: [],
  country: 'ALL',
  config: {
    activeThreshold: 0.70,
    minProducts: 15,
    maxPages: 10,
    maxScrolls: 15,
    delayMin: 2,
    delayMax: 5,
    tabType: 'background',
    sheetsUrl: 'https://script.google.com/macros/s/AKfycbxkK_w6gHRswlP8xhxZB8khEB32s81QmbUZF9LeJcnDKYZtaauW8Oh88QGbYpnmi-pn/exec',
    secretKey: 'my_super_secret_key_2026',
    mediaType: 'ALL',
    publisherPlatform: 'ALL',
    searchType: 'KEYWORD_UNORDERED',
    sortMode: 'SORT_BY_TOTAL_IMPRESSIONS',
    startDateMin: '',
    crawlerEngine: 'GRAPHQL',
  },
  currentKeywordIndex: 0,
  currentPageIndex: 0,
  pages: [],                 // Mảng page cho keyword hiện tại
  pendingSheetWrites: [],    // Hàng đợi ghi Sheet khi ghi thất bại
  tabsCreated: [],           // ID các tab do extension tạo (để đóng khi Stop)
  startedAt: null,
  lastUpdated: null,
};

// ═══════════════════════════════════════════════════════════════════
//  STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Đọc state từ storage, trả về object đầy đủ (merge với DEFAULT_STATE)
 */
async function loadState() {
  const data = await chrome.storage.local.get([STORAGE_STATE_KEY, LEGACY_STATE_KEY]);
  const saved = data[STORAGE_STATE_KEY] || data[LEGACY_STATE_KEY] || {};
  return { ...DEFAULT_STATE, ...saved };
}

/**
 * Ghi state vào storage
 * Nhận object chứa các field cần cập nhật, merge với state hiện tại
 */
async function saveState(updates) {
  const current = await loadState();
  const newState = { ...current, ...updates, lastUpdated: new Date().toISOString() };
  await chrome.storage.local.set({
    [STORAGE_STATE_KEY]: newState,
    [LEGACY_STATE_KEY]: newState,
  });
  return newState;
}

/**
 * Reset state về mặc định
 */
async function resetState() {
  await chrome.storage.local.set({
    [STORAGE_STATE_KEY]: { ...DEFAULT_STATE },
    [LEGACY_STATE_KEY]: { ...DEFAULT_STATE },
  });
}

// ═══════════════════════════════════════════════════════════════════
//  LOGGING
// ═══════════════════════════════════════════════════════════════════

/**
 * Thêm log entry vào storage (persist qua popup đóng/mở)
 * Đồng thời broadcast realtime cho popup/sidepanel/log.html nếu đang mở
 * @param {string} message - Nội dung log
 * @param {'INFO'|'RUNNING'|'PASS'|'SKIP'|'ERROR'|'SAVED'|'WARN'} type
 */
async function addLog(message, type = 'INFO') {
  const data = await chrome.storage.local.get([STORAGE_LOG_KEY, LEGACY_LOG_KEY]);
  const logs = data[STORAGE_LOG_KEY] || data[LEGACY_LOG_KEY] || [];
  const now = new Date();
  const timestamp = now.toLocaleTimeString('vi-VN', { hour12: false });
  const entry = { timestamp, message, type };

  logs.push(entry);

  // Giới hạn số lượng log, xóa cũ nhất khi vượt quá
  while (logs.length > MAX_LOGS) {
    logs.shift();
  }

  await chrome.storage.local.set({
    [STORAGE_LOG_KEY]: logs,
    [LEGACY_LOG_KEY]: logs,
  });
  console.log(`[${type}] ${message}`);

  // Broadcast realtime trực tiếp tới UI
  try {
    chrome.runtime.sendMessage({
      type: 'NEW_LOG_ENTRY',
      payload: { entry, logs },
    }).catch(err => console.debug('[Background] Broadcast skipped:', err.message));
  } catch (err) {
    console.debug('[Background] Broadcast error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Tạm dừng ngẫu nhiên trong khoảng [minSec, maxSec] giây
 * Mô phỏng hành vi người dùng thật, giảm nguy cơ bị phát hiện bot
 */
function sleepRandom(minSec = 2, maxSec = 5) {
  const ms = Math.floor((Math.random() * (maxSec - minSec) + minSec) * 1000);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Thử lại hàm fn tối đa maxRetries lần
 * @param {Function} fn - Hàm async cần thực thi
 * @param {number} maxRetries - Số lần thử tối đa (mặc định 3)
 * @param {string} label - Nhãn ghi log khi lỗi
 * @returns {*} Kết quả từ fn
 * @throws {Error} Lỗi cuối cùng nếu hết lượt retry
 */
async function retryWithLimit(fn, maxRetries = 3, label = 'operation') {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      await addLog(`⟳ Retry ${attempt}/${maxRetries} – ${label}: ${err.message}`, 'WARN');
      if (attempt < maxRetries) {
        await sleepRandom(1, 3);
      }
    }
  }
  throw lastError;
}

// ═══════════════════════════════════════════════════════════════════
//  TAB MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Tạo tab mới, lưu ID vào state.tabsCreated
 * @param {string} url - URL cần mở
 * @param {boolean} active - true = tab nổi, false = tab nền
 * @returns {chrome.tabs.Tab} Tab đã tạo
 */
async function createTab(url, active = false) {
  const tab = await chrome.tabs.create({ url, active });
  const state = await loadState();
  const tabs = [...(state.tabsCreated || []), tab.id];
  await saveState({ tabsCreated: tabs });
  await addLog(`📄 Mở tab #${tab.id}: ${url.substring(0, 80)}...`, 'INFO');
  return tab;
}

/**
 * Chờ tab load xong (status = 'complete')
 * Dùng chrome.tabs.onUpdated + timeout thay vì polling
 * @param {number} tabId
 * @param {number} timeoutMs - Thời gian chờ tối đa (mặc định 30s)
 * @returns {Promise<void>}
 */
function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab #${tabId} load timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);

    // Kiểm tra nếu tab đã complete rồi (race condition)
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab #${tabId} không tồn tại`));
    });
  });
}

/**
 * Gửi message đến content script trong tab, có retry
 * Content script có thể chưa inject sẵn nên cần retry
 * @param {number} tabId
 * @param {object} message
 * @param {number} maxRetries
 * @returns {*} Response từ content script
 */
async function sendMessageToTab(tabId, message, maxRetries = 5) {
  return retryWithLimit(async () => {
    const response = await chrome.tabs.sendMessage(tabId, message);
    if (response && response.error) {
      throw new Error(response.error);
    }
    return response;
  }, maxRetries, `sendMessage(tab#${tabId}, ${message.type})`);
}

/**
 * Inject content script vào tab (nếu chưa có)
 * @param {number} tabId
 * @param {string[]} files - Mảng file JS cần inject
 */
async function injectContentScript(tabId, files) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files,
    });
  } catch (err) {
    // Nếu đã inject rồi thì bỏ qua lỗi
    if (!err.message.includes('Cannot access')) {
      throw err;
    }
  }
}

/**
 * Đóng tab do extension tạo (an toàn – bỏ qua nếu tab đã đóng)
 * @param {number} tabId
 */
async function closeExtensionTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    await addLog(`🗑️ Đóng tab #${tabId}`, 'INFO');
  } catch {
    // Tab đã đóng hoặc không tồn tại – bỏ qua
  }
}

/**
 * Đóng tất cả tab do extension tạo
 */
async function closeAllExtensionTabs() {
  const state = await loadState();
  const tabs = state.tabsCreated || [];
  for (const tabId of tabs) {
    await closeExtensionTab(tabId);
  }
  await saveState({ tabsCreated: [] });
}

// ═══════════════════════════════════════════════════════════════════
//  URL BUILDERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Tạo URL tìm kiếm Ad Library theo keyword và bộ lọc nâng cao
 */
function buildKeywordUrl(keyword, country = 'ALL', config = {}) {
  const isExact = config.searchType === 'KEYWORD_EXACT_PHRASE';
  const query = isExact ? `"${keyword}"` : keyword;
  const mediaType = (config.mediaType || 'ALL').toLowerCase();
  
  let sortMode = 'total_impressions';
  if (config.sortMode === 'SORT_BY_START_DATE') sortMode = 'start_date';
  else if (config.sortMode === 'SORT_BY_RELEVANCY_MONTHLY_GROUPED') sortMode = 'relevancy_monthly_grouped';

  const params = new URLSearchParams({
    active_status: 'active',
    ad_type: 'all',
    country,
    is_targeted_country: 'false',
    media_type: mediaType,
    q: query,
    search_type: isExact ? 'keyword_exact_phrase' : 'keyword_unordered',
    'sort_data[direction]': 'desc',
    'sort_data[mode]': sortMode,
    source: 'page-transparency-widget',
  });

  if (config.publisherPlatform && config.publisherPlatform !== 'ALL') {
    params.append('publisher_platforms[0]', config.publisherPlatform.toLowerCase());
  }

  if (config.startDateMin) {
    params.append('start_date[min]', config.startDateMin);
    params.append('start_date[max]', '');
  }

  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

/**
 * Tạo URL xem quảng cáo của 1 Page (active hoặc inactive)
 * @param {string} pageId
 * @param {'active'|'inactive'} status
 * @param {string} country
 */
function buildPageUrl(pageId, status, country = 'ALL') {
  const params = new URLSearchParams({
    active_status: status,
    ad_type: 'all',
    country,
    is_targeted_country: 'false',
    media_type: 'all',
    search_type: 'page',
    'sort_data[mode]': 'total_impressions',
    'sort_data[direction]': 'desc',
    source: 'page-transparency-widget',
    view_all_page_id: pageId,
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

// ═══════════════════════════════════════════════════════════════════
//  KEEPALIVE – Giữ Service Worker sống khi đang chạy research
// ═══════════════════════════════════════════════════════════════════

function startKeepalive() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 }); // ~24s
}

function stopKeepalive() {
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    // Kiểm tra xem research còn đang chạy không
    const state = await loadState();
    if (state.status !== 'RUNNING') {
      stopKeepalive();
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
//  RESEARCH FLOW – ĐIỀU PHỐI CHÍNH
// ═══════════════════════════════════════════════════════════════════

/**
 * Bắt đầu nghiên cứu mới
 * @param {object} params - { niche, keywords, country, config }
 */
async function startResearch(params) {
  const state = await loadState();
  if (state.status === 'RUNNING') {
    throw new Error('Research đang chạy. Dừng trước khi bắt đầu mới.');
  }

  await addLog(`🚀 Bắt đầu nghiên cứu: ngách=${params.niche}, ${params.keywords.length} keyword(s), country=${params.country}`, 'RUNNING');

  await saveState({
    status: 'RUNNING',
    niche: params.niche,
    keywords: params.keywords,
    country: params.country,
    config: params.config,
    currentKeywordIndex: 0,
    currentPageIndex: 0,
    pages: [],
    tabsCreated: [],
    startedAt: new Date().toISOString(),
  });

  startKeepalive();
  runResearchLoop();
}

/**
 * Dừng nghiên cứu: không bắt đầu Page mới, lưu state, đóng tab phụ
 */
async function stopResearch() {
  await addLog('⏹ Dừng nghiên cứu...', 'WARN');
  await saveState({ status: 'STOPPED' });
  stopKeepalive();
  await closeAllExtensionTabs();
  await addLog('⏹ Đã dừng. Có thể Resume để tiếp tục.', 'WARN');
}

/**
 * Resume nghiên cứu từ vị trí đã lưu
 */
async function resumeResearch() {
  const state = await loadState();
  if (state.status !== 'PAUSED' && state.status !== 'STOPPED') {
    throw new Error('Không thể resume – trạng thái hiện tại: ' + state.status);
  }

  await addLog(`↻ Resume: keyword ${state.currentKeywordIndex + 1}/${state.keywords.length}, page ${state.currentPageIndex + 1}/${state.pages.length}`, 'RUNNING');
  await saveState({ status: 'RUNNING' });
  startKeepalive();
  runResearchLoop();
}

/**
 * Vòng lặp chính: duyệt từng keyword → crawl Page → xử lý từng Page
 * Được gọi bởi startResearch() hoặc resumeResearch()
 */
async function runResearchLoop() {
  try {
    let state = await loadState();

    for (let ki = state.currentKeywordIndex; ki < state.keywords.length; ki++) {
      // Kiểm tra trạng thái mỗi vòng (có thể bị Stop)
      state = await loadState();
      if (state.status !== 'RUNNING') {
        await addLog('⏸ Dừng vòng lặp keyword.', 'WARN');
        return;
      }

      const keyword = state.keywords[ki];
      await saveState({ currentKeywordIndex: ki, currentPageIndex: 0, pages: [] });
      await addLog(`🔎 Keyword ${ki + 1}/${state.keywords.length}: "${keyword}"`, 'RUNNING');

      // ── Bước 1: Crawl danh sách Page từ kết quả keyword ──────
      const pages = await crawlPagesForKeyword(keyword, state.country, state.config);

      if (!pages || pages.length === 0) {
        await addLog(`⚠️ Không tìm thấy Page nào cho "${keyword}". Chuyển keyword tiếp.`, 'WARN');
        continue;
      }

      await addLog(`📋 Tìm thấy tất cả ${pages.length} Page hàng đầu cho "${keyword}"`, 'INFO');
      await saveState({ pages, currentPageIndex: 0 });

      // ── Bước 2: Xử lý tuần tự từng Page ──────────────────────
      for (let pi = 0; pi < pages.length; pi++) {
        state = await loadState();
        if (state.status !== 'RUNNING') {
          await addLog('⏸ Dừng vòng lặp Page.', 'WARN');
          return;
        }

        await saveState({ currentPageIndex: pi });
        const page = state.pages[pi];

        // Bỏ qua Page đã xử lý (khi resume)
        if (page.status && page.status !== 'PENDING' && page.status !== 'PROCESSING') {
          continue;
        }

        await processPage(pi);
        await sleepRandom(state.config.delayMin, state.config.delayMax);
      }
    }

    // Hoàn tất tất cả keyword
    await saveState({ status: 'COMPLETED' });
    stopKeepalive();
    await closeAllExtensionTabs();

    // Flush hàng đợi ghi Sheet
    await flushPendingSheetWrites();

    const finalState = await loadState();
    const passCount = finalState.pages.filter(p => p.status === 'PASS' || p.status === 'SAVED').length;
    await addLog(`✅ Hoàn tất! ${passCount} Page đạt điều kiện.`, 'PASS');

  } catch (err) {
    await addLog(`💥 Lỗi nghiêm trọng: ${err.message}`, 'ERROR');
    await saveState({ status: 'PAUSED' });
    stopKeepalive();
    await closeAllExtensionTabs();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  CRAWL PAGES – Thu thập danh sách Page từ kết quả keyword
// ═══════════════════════════════════════════════════════════════════

/**
 * Giải quyết ID số của Page từ username nếu chưa có sẵn
 * @param {object} page - { pageName, pageUrl, pageId, identifier }
 * @returns {Promise<string|null>} pageId số
 */
async function resolvePageId(page) {
  // Nếu đã có ID dạng số nguyên
  if (page.pageId && /^\d+$/.test(page.pageId)) {
    return page.pageId;
  }

  // Nếu identifier là chuỗi số
  if (page.identifier && /^\d+$/.test(page.identifier)) {
    return page.identifier;
  }

  // Nếu là username vanity (ví dụ tagmobilecom), fetch trang profile để lấy numeric ID
  try {
    const res = await fetch(page.pageUrl);
    if (!res.ok) return null;
    const html = await res.text();

    const m = html.match(/"userID":"(\d+)"|"pageID":"(\d+)"|"page_id":"(\d+)"|"entity_id":"(\d+)"|fb:\/\/page\/(\d+)|"identifier":"(\d+)"/);
    if (m) {
      const id = m[1] || m[2] || m[3] || m[4] || m[5] || m[6];
      return id;
    }
  } catch (err) {
    console.warn(`Không resolve được Page ID cho ${page.pageName}:`, err);
  }

  return null;
}

/**
 * Mở trang Ad Library theo keyword, cuộn và thu thập danh sách Page
 * @returns {Array<{pageId, pageName, pageUrl, status}>}
 */
async function crawlPagesForKeyword(keyword, country, config) {
  const url = buildKeywordUrl(keyword, country, config);
  const active = config.tabType === 'foreground';

  let tab = null;
  try {
    // ── Ưu tiên 1: Tái sử dụng tab Facebook Ads Library đang mở hoặc mở tab mới ──
    const existingFbTab = await getActiveFacebookTab();
    if (existingFbTab && existingFbTab.id) {
      tab = existingFbTab;
      await chrome.tabs.update(tab.id, { url, active });
      await addLog(`📄 Tái sử dụng tab chính Facebook Ads Library #${tab.id} để tìm kiếm từ khóa "${keyword}": ${url} (TAB ĐƯỢC GIỮ MỞ)`, 'INFO');
    } else {
      tab = await createTab(url, active);
      await addLog(`📄 Mở tab chính Facebook Ads Library tìm kiếm từ khóa "${keyword}": ${url} (TAB ĐƯỢC GIỮ MỞ XUYÊN SUỐT)`, 'INFO');
    }

    await waitForTabLoad(tab.id);
    await sleepRandom(2, 3); // Chờ DOM ban đầu render

    // Inject selectors và content_fb.js
    await injectContentScript(tab.id, ['selectors.js', 'content_fb.js']);
    await sleep(1000); // Chờ content script khởi động

    await addLog(`📜 Bắt đầu thu thập toàn bộ Page cho "${keyword}" bằng Meta GraphQL API (Media=${config.mediaType || 'ALL'}, Platform=${config.publisherPlatform || 'ALL'}, Engine=${config.crawlerEngine || 'GRAPHQL'})...`, 'RUNNING');

    const result = await sendMessageToTab(tab.id, {
      type: 'CRAWL_PAGES',
      payload: {
        keyword,
        country,
        config,
        maxScrolls: config.maxScrolls,
        maxPages: config.maxPages,
        delayMin: config.delayMin,
        delayMax: config.delayMax,
      },
    });

    if (result.blocked) {
      throw new Error(`BLOCKED: ${result.reason}`);
    }

    const rawPages = result.pages || [];
    await addLog(`🔍 Thu thập được ${rawPages.length} Page thô từ API. Bắt đầu phân giải Page ID & loại trùng...`, 'INFO');

    // Phân giải Page ID và loại trùng
    const validPages = [];
    const seenIds = new Set();

    for (const p of rawPages) {
      let resolvedId = await resolvePageId(p);
      
      if (!resolvedId) {
        await addLog(`⚠️ Bỏ qua "${p.pageName}": không tìm thấy Page ID số`, 'WARN');
        continue;
      }

      if (seenIds.has(resolvedId)) {
        continue; // Bỏ qua trùng lặp
      }

      seenIds.add(resolvedId);
      validPages.push({
        pageId: resolvedId,
        pageName: p.pageName,
        pageUrl: p.pageUrl,
        keyword,
        status: 'PENDING',
        activeCount: null,
        inactiveCount: null,
        activeRatio: null,
      });

      if (validPages.length >= config.maxPages) {
        break;
      }
    }

    // Lưu danh sách Page vào storage ngay lập tức
    await saveState({ pages: validPages });
    await addLog(`✅ Hoàn tất lọc: ${validPages.length} Page hợp lệ sẵn sàng phân tích`, 'INFO');

    return validPages;

  } catch (err) {
    await addLog(`❌ Crawl Page thất bại: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    // YÊU CẦU CỦA ÔNG CHỦ: TUYỆT ĐỐI KHÔNG ĐÓNG TAB NÀY KHI TÌM KIẾM XONG
    if (tab) {
      await addLog(`🔒 Giữ nguyên tab tìm kiếm từ khóa #${tab.id} để duy trì phiên làm việc`, 'INFO');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PROCESS PAGE – Xử lý từng Page: đọc ratio → ads → website → Sheet
// ═══════════════════════════════════════════════════════════════════

/**
 * Đọc số ads active/inactive trực tiếp từ tab cụ thể
 */
async function readAdCountFromTab(tabId, pageId, status) {
  try {
    const resp = await sendMessageToTab(tabId, {
      type: 'READ_AD_COUNT',
      payload: { pageId, status }
    }, 2);
    if (resp && (resp.status === 'OK' || resp.status === 'ZERO') && resp.count !== null && resp.count !== undefined) {
      return { count: resp.count, status: resp.status };
    }
  } catch (err) {
    console.debug(`[readAdCountFromTab] error:`, err.message);
  }
  return { count: null, status: 'UNKNOWN' };
}

/**
 * Trích xuất link quảng cáo & website đích từ tab cụ thể
 */
async function getAdDetailsFromTab(tabId, pageId) {
  try {
    const resp = await sendMessageToTab(tabId, {
      type: 'GET_AD_DETAILS',
      payload: { pageId }
    }, 2);
    if (resp && resp.ok) {
      return {
        postUrl: resp.postUrl || null,
        websiteUrl: resp.websiteUrl || null,
        websiteUrlRaw: resp.websiteUrlRaw || null,
        rootDomain: resp.rootDomain || null,
      };
    }
  } catch (err) {
    console.debug(`[getAdDetailsFromTab] error:`, err.message);
  }
  return {};
}

/**
 * Xử lý 1 Page tại vị trí pageIndex trong mảng pages
 * Quy trình quản lý Tab nghiêm ngặt theo yêu cầu của ông chủ:
 * 1. Mở tab mới lọc theo Page, giữ tab này.
 * 2. Check Cổng 1 (Active Ratio >= 70%): Nếu không đạt -> Đóng tab, chuyển Page tiếp.
 *    Nếu đạt -> Giữ tab tiếp tục.
 * 3. Nhấp/trích xuất link quảng cáo & check website (Cổng 2 - số SP):
 *    Nếu không đạt -> Đóng tab, chuyển Page tiếp.
 *    Nếu đạt -> Giữ tab tiếp tục.
 * 4. Crawl toàn bộ ads kèm CTA qua API & upload Google Sheet.
 * 5. Hoàn tất -> Đóng tab để giải phóng bộ nhớ.
 */
async function processPage(pageIndex) {
  let state = await loadState();
  const page = state.pages[pageIndex];

  await addLog(`📌 Page ${pageIndex + 1}/${state.pages.length}: ${page.pageName || page.pageId}`, 'RUNNING');

  // Cập nhật trạng thái đang xử lý
  state.pages[pageIndex] = { ...page, status: 'PROCESSING' };
  await saveState({ pages: state.pages });

  let pageTab = null;
  try {
    // ── BƯỚC 1: Mở một tab mới lọc theo Page, YÊU CẦU KHÔNG ĐƯỢC ĐÓNG TAB NÀY ──
    const pageUrl = buildPageUrl(page.pageId, 'active', state.country);
    const active = state.config.tabType === 'foreground';

    pageTab = await createTab(pageUrl, active);
    await waitForTabLoad(pageTab.id);
    await sleepRandom(2, 3); // Chờ load trang Page
    await injectContentScript(pageTab.id, ['selectors.js', 'content_fb.js']);
    await sleep(1000);

    await addLog(`📑 Mở tab mới #${pageTab.id} lọc theo Page: [${page.pageName}] (Page ID: ${page.pageId})`, 'INFO');
    await addLog(`🔒 Giữ tab #${pageTab.id} để kiểm định Cổng 1 (Active Ratio)...`, 'INFO');

    // ── BƯỚC 2: Kiểm định Cổng 1 (Active Ratio >= 70%) trên tab này ──
    const activeResult = await readAdCountFromTab(pageTab.id, page.pageId, 'active');
    const inactiveResult = await readAdCountFromTab(pageTab.id, page.pageId, 'inactive');

    state = await loadState();
    state.pages[pageIndex].activeCount  = activeResult.count;
    state.pages[pageIndex].activeStatus = activeResult.status;
    state.pages[pageIndex].inactiveCount  = inactiveResult.count;
    state.pages[pageIndex].inactiveStatus = inactiveResult.status;
    await saveState({ pages: state.pages });

    const ac = activeResult.count;
    const ic = inactiveResult.count;

    if (ac === null || ic === null) {
      state.pages[pageIndex].status = 'UNKNOWN';
      state.pages[pageIndex].activeRatio = null;
      await saveState({ pages: state.pages });
      await addLog(`❓ ${page.pageName}: không đọc được số ads → UNKNOWN`, 'ERROR');
      await addLog(`🗑️ Đóng tab #${pageTab.id} của [${page.pageName}] do không xác định được số ads`, 'INFO');
      await closeExtensionTab(pageTab.id);
      pageTab = null;
      return;
    }

    const total = ac + ic;
    if (total === 0) {
      state.pages[pageIndex].status = 'SKIP';
      state.pages[pageIndex].activeRatio = 0;
      await saveState({ pages: state.pages });
      await addLog(`⏭ ${page.pageName}: tổng ads = 0 → KHÔNG ĐẠT CỔNG 1 (SKIP)`, 'SKIP');
      await addLog(`🗑️ Đóng tab #${pageTab.id} của [${page.pageName}] do không đạt Cổng 1`, 'INFO');
      await closeExtensionTab(pageTab.id);
      pageTab = null;
      return;
    }

    const ratio = ac / total;
    state.pages[pageIndex].activeRatio = Math.round(ratio * 10000) / 10000;
    await saveState({ pages: state.pages });

    // Kiểm tra ngưỡng Cổng 1
    if (ratio < state.config.activeThreshold) {
      state.pages[pageIndex].status = 'SKIP';
      await saveState({ pages: state.pages });
      await addLog(`⏭ ${page.pageName}: ratio=${(ratio * 100).toFixed(1)}% < ngưỡng ${(state.config.activeThreshold * 100)}% → KHÔNG ĐẠT CỔNG 1 (SKIP)`, 'SKIP');
      await addLog(`🗑️ Đóng tab #${pageTab.id} của [${page.pageName}] do không đạt Cổng 1`, 'INFO');
      await closeExtensionTab(pageTab.id);
      pageTab = null;
      return;
    }

    // ĐẠT CỔNG 1: GIỮ TAB ĐỂ LÀM TIẾP CÔNG ĐOẠN CHECK WEBSITE!
    await addLog(`✓ ${page.pageName}: active=${ac}, inactive=${ic}, ratio=${(ratio * 100).toFixed(1)}% → ĐẠT CHUẨN CỔNG 1 (PASS)`, 'PASS');
    await addLog(`📌 GIỮ NGUYÊN tab #${pageTab.id} [${page.pageName}] để thực hiện công đoạn tiếp theo: Nhấp vào link quảng cáo & kiểm tra website...`, 'INFO');

    // ── BƯỚC 3: Nhấp vào link quảng cáo & kiểm tra website (Cổng 2) ──
    await addLog(`🔗 Đang nhấp/trích xuất link quảng cáo trên tab #${pageTab.id} [${page.pageName}]...`, 'INFO');
    let websiteUrl = page.websiteUrl || null;
    let postUrl = page.postUrl || (page.sampleAdArchiveId ? `https://www.facebook.com/ads/library/?id=${page.sampleAdArchiveId}` : null);
    let websiteUrlRaw = page.websiteUrlRaw || page.websiteUrl || null;
    let rootDomain = page.rootDomain || null;

    if (websiteUrl) {
      const decoded = typeof decodeCtaUrl === 'function' ? decodeCtaUrl(websiteUrl) : null;
      if (decoded && decoded.websiteUrl) {
        websiteUrl = decoded.websiteUrl;
        websiteUrlRaw = decoded.websiteUrlRaw || websiteUrl;
        rootDomain = decoded.rootDomain || rootDomain;
      }
    }

    // Nếu chưa có websiteUrl từ bước cào danh sách, trích xuất trực tiếp trên pageTab
    if (!websiteUrl) {
      const adDetails = await getAdDetailsFromTab(pageTab.id, page.pageId);
      if (adDetails && adDetails.websiteUrl) {
        websiteUrl = adDetails.websiteUrl;
        websiteUrlRaw = adDetails.websiteUrlRaw;
        rootDomain = adDetails.rootDomain;
        if (adDetails.postUrl) postUrl = adDetails.postUrl;
      }
    }

    state = await loadState();
    state.pages[pageIndex].postUrl       = postUrl;
    state.pages[pageIndex].websiteUrl    = websiteUrl;
    state.pages[pageIndex].websiteUrlRaw = websiteUrlRaw;
    state.pages[pageIndex].rootDomain    = rootDomain;
    await saveState({ pages: state.pages });

    if (!websiteUrl) {
      state.pages[pageIndex].status = 'SKIP';
      await saveState({ pages: state.pages });
      await addLog(`⏭ ${page.pageName}: không tìm thấy link website đích từ quảng cáo → SKIP`, 'SKIP');
      await addLog(`🗑️ Đóng tab #${pageTab.id} của [${page.pageName}] do không có website`, 'INFO');
      await closeExtensionTab(pageTab.id);
      pageTab = null;
      return;
    }

    await addLog(`🔗 [${page.pageName}]: Phát hiện website đích ${rootDomain || websiteUrl}`, 'INFO');
    await addLog(`🌐 Đang quét website kiểm tra số lượng sản phẩm: ${websiteUrl}...`, 'INFO');

    const productResult = await countProducts(websiteUrl, state.config);
    state = await loadState();
    state.pages[pageIndex].productCount      = productResult.count;
    state.pages[pageIndex].productSource     = productResult.source;
    state.pages[pageIndex].productConfidence = productResult.confidence;
    state.pages[pageIndex].websiteCheckStatus = productResult.status;
    await saveState({ pages: state.pages });

    // Kiểm tra Cổng 2 (số lượng sản phẩm phù hợp logic)
    if (productResult.count === null || productResult.count < state.config.minProducts) {
      state.pages[pageIndex].status = 'SKIP';
      await saveState({ pages: state.pages });
      const countStr = productResult.count !== null ? productResult.count : '0';
      await addLog(`⏭ ${page.pageName}: sản phẩm=${countStr} < ${state.config.minProducts} → KHÔNG ĐẠT CỔNG 2 (Shop quá nhỏ/rác)`, 'SKIP');
      await addLog(`🗑️ Đóng tab #${pageTab.id} của [${page.pageName}] do không đạt Cổng 2`, 'INFO');
      await closeExtensionTab(pageTab.id);
      pageTab = null;
      return;
    }

    // Đạt Cổng 2 -> WINNER STORE! TIẾP TỤC GIỮ TAB NÀY ĐỂ BÓC TÁCH CREATIVES & UPLOAD
    state.pages[pageIndex].status = 'PASS';
    await saveState({ pages: state.pages });
    await addLog(`✅ ${page.pageName}: ${productResult.count} sản phẩm (${productResult.source}) → ĐẠT CHUẨN CỔNG 2 (WINNER STORE 🏆)`, 'PASS');
    await addLog(`📌 TIẾP TỤC GIỮ TAB #${pageTab.id} [${page.pageName}] để crawl toàn bộ link quảng cáo kèm CTA qua API...`, 'INFO');

    // ── BƯỚC 4: Crawl toàn bộ link quảng cáo kèm CTA của Page đó & upload lên Google Sheet ──
    await addLog(`🎬 Đang crawl toàn bộ quảng cáo kèm CTA của Page [${page.pageName}] qua API trên tab #${pageTab.id}...`, 'INFO');
    try {
      const adsRes = await sendMessageToTab(pageTab.id, {
        type: 'GET_ALL_PAGE_ADS',
        payload: { pageId: page.pageId, limit: 50 }
      }, 2);
      if (adsRes && adsRes.ok && Array.isArray(adsRes.ads) && adsRes.ads.length > 0) {
        state.pages[pageIndex].ads = adsRes.ads;
        await saveState({ pages: state.pages });
        await addLog(`📦 Đã bóc tách thành công ${adsRes.ads.length} ads creative (Video/Image/CTA) cho [${page.pageName}]`, 'INFO');
      }
    } catch (adsErr) {
      console.debug('[Background] extractAllPageAds error:', adsErr.message);
    }

    // Upload lên Google Sheet
    await addLog(`📤 Đang upload dữ liệu Store và chi tiết ads creative của [${page.pageName}] lên Google Sheet...`, 'INFO');
    await writeToSheet(pageIndex);
    await addLog(`💾 [${page.pageName}]: Đã upload thành công lên Google Sheet!`, 'SAVED');

    // Sau khi upload hoàn tất trọn vẹn cho Page WINNER -> Đóng tab để giải phóng tài nguyên
    await addLog(`🗑️ Hoàn tất quy trình phân tích & upload cho [${page.pageName}]. Đóng tab #${pageTab.id} để giải phóng bộ nhớ`, 'INFO');
    await closeExtensionTab(pageTab.id);
    pageTab = null;

  } catch (err) {
    state = await loadState();
    state.pages[pageIndex].status = 'ERROR';
    await saveState({ pages: state.pages });
    await addLog(`❌ ${page.pageName}: ${err.message}`, 'ERROR');
    if (pageTab) {
      await addLog(`🗑️ Đóng tab #${pageTab.id} của [${page.pageName}] do xảy ra lỗi`, 'INFO');
      await closeExtensionTab(pageTab.id);
      pageTab = null;
    }

    // Phát hiện CAPTCHA/chặn → tạm dừng toàn bộ
    if (err.message.includes('BLOCKED') || err.message.includes('CAPTCHA')) {
      await addLog('🚫 Facebook chặn truy cập. Tạm dừng, vui lòng kiểm tra trình duyệt.', 'ERROR');
      await saveState({ status: 'PAUSED' });
      stopKeepalive();
      await closeAllExtensionTabs();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  STUBS – Sẽ implement ở Phase 2, 3, 4
// ═══════════════════════════════════════════════════════════════════

/**
 * Tìm tab Facebook Ads Library đang mở trên trình duyệt (để tái sử dụng siêu tốc, không mở tab mới)
 */
async function getActiveFacebookTab() {
  try {
    if (typeof chrome === 'undefined' || !chrome?.tabs?.query) return null;
    const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/ads/library*' });
    if (tabs && tabs.length > 0) {
      return tabs.find(t => t.active) || tabs[0];
    }
  } catch (err) {
    console.debug('[Background] Query active FB tab error:', err.message);
  }
  return null;
}

/**
 * Đọc số lượng quảng cáo (active hoặc inactive) trên trang Ad Library của 1 Page
 * Ưu tiên gọi GraphQL siêu tốc qua tab Facebook đang mở (0.2s, 0 tabs opened)
 * @param {string} pageId
 * @param {'active'|'inactive'} status
 * @param {string} country
 * @param {object} config
 * @returns {Promise<{count: number|null, status: 'OK'|'UNKNOWN'|'ZERO'|'BLOCKED'}>}
 */
async function readAdCount(pageId, status, country, config) {
  // ── Ưu tiên 1: Tái sử dụng tab Facebook đang mở (Siêu tốc, không giật màn hình) ──
  try {
    const fbTab = await getActiveFacebookTab();
    if (fbTab) {
      await injectContentScript(fbTab.id, ['selectors.js', 'content_fb.js']);
      const resp = await sendMessageToTab(fbTab.id, {
        type: 'READ_AD_COUNT',
        payload: { pageId, status }
      }, 2);

      if (resp && (resp.status === 'OK' || resp.status === 'ZERO') && resp.count !== null && resp.count !== undefined) {
        return { count: resp.count, status: resp.status };
      }
    }
  } catch (fastErr) {
    console.debug(`[Background] Fast tab query (${pageId}) fallback:`, fastErr.message);
  }

  // ── Ưu tiên 2: Fallback mở tab phụ (nếu không có tab Facebook chính) ──
  const url = buildPageUrl(pageId, status, country);
  const active = config.tabType === 'foreground';

  // Thử tối đa 2 lần nếu trạng thái là UNKNOWN
  for (let attempt = 1; attempt <= 2; attempt++) {
    let tab;
    try {
      tab = await createTab(url, active);
      await waitForTabLoad(tab.id);
      await sleepRandom(2, 3); // Chờ render số kết quả

      await injectContentScript(tab.id, ['selectors.js', 'content_fb.js']);
      await sleep(1000);

      const resp = await sendMessageToTab(tab.id, {
        type: 'READ_AD_COUNT',
        payload: { pageId, status }
      });

      if (resp && resp.status === 'BLOCKED') {
        throw new Error(`BLOCKED: ${resp.reason || 'Bị Facebook chặn hoặc yêu cầu đăng nhập'}`);
      }

      if (resp && (resp.status === 'OK' || resp.status === 'ZERO') && resp.count !== null && resp.count !== undefined) {
        return { count: resp.count, status: resp.status };
      }

      // Nếu lần 1 UNKNOWN, nghỉ một chút rồi thử lại lần 2
      if (attempt < 2) {
        await sleepRandom(2, 3);
      }

    } catch (err) {
      if (err.message.includes('BLOCKED')) throw err;
      console.warn(`readAdCount(${pageId}, ${status}) lần ${attempt} thất bại:`, err.message);
    } finally {
      if (tab) await closeExtensionTab(tab.id);
      const state = await loadState();
      const remaining = (state.tabsCreated || []).filter(id => id !== tab?.id);
      await saveState({ tabsCreated: remaining });
    }
  }

  return { count: null, status: 'UNKNOWN' };
}

/**
 * Lấy link bài post ads và website đích từ quảng cáo đầu tiên của Page
 * @param {string} pageId
 * @param {object} config
 * @returns {Promise<{postUrl: string|null, websiteUrl: string|null, websiteUrlRaw: string|null, rootDomain: string|null}>}
 */
async function getAdDetails(pageId, config) {
  // Ưu tiên 1: Zero-Tab GraphQL qua Facebook tab đang mở sẵn
  const activeFbTab = await getActiveFacebookTab();
  if (activeFbTab) {
    try {
      const resp = await sendMessageToTab(activeFbTab.id, {
        type: 'GET_AD_DETAILS',
        payload: { pageId }
      });
      if (resp && resp.ok && resp.websiteUrl) {
        return {
          postUrl: resp.postUrl || null,
          websiteUrl: resp.websiteUrl || null,
          websiteUrlRaw: resp.websiteUrlRaw || null,
          rootDomain: resp.rootDomain || null,
        };
      }
    } catch (e) {
      console.debug('[Background] Zero-tab getAdDetails fallback to tab:', e.message);
    }
  }

  // Ưu tiên 2: Fallback mở tab nền nếu không có tab Facebook active
  const url = buildPageUrl(pageId, 'active', config.country || 'ALL');
  const active = config.tabType === 'foreground';

  let tab;
  try {
    tab = await createTab(url, active);
    await waitForTabLoad(tab.id);
    await sleepRandom(2, 3); // Chờ render thẻ quảng cáo

    await injectContentScript(tab.id, ['selectors.js', 'content_fb.js']);
    await sleep(1000);

    const resp = await sendMessageToTab(tab.id, {
      type: 'GET_AD_DETAILS',
      payload: { pageId }
    });

    if (resp && resp.ok) {
      return {
        postUrl: resp.postUrl || null,
        websiteUrl: resp.websiteUrl || null,
        websiteUrlRaw: resp.websiteUrlRaw || null,
        rootDomain: resp.rootDomain || null,
      };
    }

    return { postUrl: null, websiteUrl: null, websiteUrlRaw: null, rootDomain: null };

  } catch (err) {
    console.warn(`getAdDetails(${pageId}) thất bại:`, err.message);
    return { postUrl: null, websiteUrl: null, websiteUrlRaw: null, rootDomain: null };
  } finally {
    if (tab) await closeExtensionTab(tab.id);
    const state = await loadState();
    const remaining = (state.tabsCreated || []).filter(id => id !== tab?.id);
    await saveState({ tabsCreated: remaining });
  }
}

/**
 * Fetch an toàn có timeout bằng AbortController
 */
async function fetchSafe(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Đếm sản phẩm trên website đích theo thứ tự ưu tiên:
 *   1. /sitemap.xml (Sitemap Index & sitemap sản phẩm Shopify / WooCommerce)
 *   2. Shopify /products.json?limit=250&page=N
 *   3. WooCommerce /product-sitemap.xml
 *   4. /collections/all hoặc /shop (HTML parsing)
 *   5. Trang chủ (dự phòng, low confidence)
 *
 * @param {string} websiteUrl
 * @param {object} config
 * @returns {Promise<{count: number|null, source: string|null, confidence: 'HIGH'|'MEDIUM'|'LOW'|'NONE', status: string}>}
 */
async function countProducts(websiteUrl, config) {
  if (!websiteUrl) {
    return { count: null, source: null, confidence: 'NONE', status: 'NO_WEBSITE' };
  }

  let origin;
  try {
    origin = new URL(websiteUrl).origin;
  } catch(e) {
    return { count: null, source: null, confidence: 'NONE', status: 'INVALID_URL' };
  }

  await addLog(`🌐 Đang quét website: ${origin}...`, 'INFO');

  // ── MỨC 1: Quét /sitemap.xml ──────────────────────────────────────
  try {
    const sitemapRes = await fetchSafe(`${origin}/sitemap.xml`, 8000);
    if (sitemapRes.ok) {
      const xmlText = await sitemapRes.text();

      // Trường hợp 1A: Sitemap Index (chứa danh sách sitemap con)
      if (xmlText.includes('<sitemapindex')) {
        const subSitemaps = [];
        const locRegex = /<loc>([^<]+)<\/loc>/gi;
        let match;
        while ((match = locRegex.exec(xmlText)) !== null) {
          const loc = match[1].trim();
          if (loc.includes('product') || loc.includes('sitemap_products')) {
            subSitemaps.push(loc);
          }
        }

        if (subSitemaps.length > 0) {
          const productSet = new Set();
          const limitSubs = subSitemaps.slice(0, 4);

          for (const subUrl of limitSubs) {
            try {
              const subRes = await fetchSafe(subUrl, 8000);
              if (subRes.ok) {
                const subXml = await subRes.text();
                const prodLocRegex = /<loc>(https?:\/\/[^<]+?\/(?:products|product)\/[^<]+?)<\/loc>/gi;
                let pm;
                while ((pm = prodLocRegex.exec(subXml)) !== null) {
                  productSet.add(pm[1].trim());
                  if (productSet.size >= 100) break;
                }
              }
            } catch(err) {
              console.debug('[Sitemap] Sub-sitemap fetch error:', err.message);
            }
            if (productSet.size >= (config.minProducts || 15)) break;
          }

          if (productSet.size > 0) {
            return {
              count: productSet.size,
              source: 'sitemap_products.xml',
              confidence: 'HIGH',
              status: 'OK',
            };
          }
        }
      }

      // Trường hợp 1B: Sitemap trực tiếp chứa URL sản phẩm
      if (xmlText.includes('<urlset')) {
        const productSet = new Set();
        const prodLocRegex = /<loc>(https?:\/\/[^<]+?\/(?:products|product)\/[^<]+?)<\/loc>/gi;
        let pm;
        while ((pm = prodLocRegex.exec(xmlText)) !== null) {
          productSet.add(pm[1].trim());
          if (productSet.size >= 100) break;
        }

        if (productSet.size > 0) {
          return {
            count: productSet.size,
            source: 'sitemap.xml',
            confidence: 'HIGH',
            status: 'OK',
          };
        }
      }
    }
  } catch (err) {
    console.warn(`Sitemap ${origin} không phản hồi:`, err.message);
  }

  // ── MỨC 2: Thử Shopify /products.json ─────────────────────────────
  try {
    const jsonRes = await fetchSafe(`${origin}/products.json?limit=250&page=1`, 7000);
    if (jsonRes.ok) {
      const data = await jsonRes.json();
      if (data && Array.isArray(data.products) && data.products.length > 0) {
        const productSet = new Set(data.products.map(p => p.id || p.handle));

        if (data.products.length === 250) {
          try {
            const page2Res = await fetchSafe(`${origin}/products.json?limit=250&page=2`, 5000);
            if (page2Res.ok) {
              const data2 = await page2Res.json();
              if (data2 && Array.isArray(data2.products)) {
                for (const p of data2.products) productSet.add(p.id || p.handle);
              }
            }
          } catch(err) {
            console.debug('[Shopify] Page 2 fetch error:', err.message);
          }
        }

        return {
          count: productSet.size,
          source: 'shopify_products_json',
          confidence: 'HIGH',
          status: 'OK',
        };
      }
    }
  } catch (err) {
    console.debug('[Shopify] Products.json error:', err.message);
  }

  // ── MỨC 3: WooCommerce product-sitemap.xml ────────────────────────
  try {
    const wooRes = await fetchSafe(`${origin}/product-sitemap.xml`, 7000);
    if (wooRes.ok) {
      const wooXml = await wooRes.text();
      const productSet = new Set();
      const locRegex = /<loc>(https?:\/\/[^<]+?\/(?:product|shop)\/[^<]+?)<\/loc>/gi;
      let wm;
      while ((wm = locRegex.exec(wooXml)) !== null) {
        productSet.add(wm[1].trim());
        if (productSet.size >= 100) break;
      }

      if (productSet.size > 0) {
        return {
          count: productSet.size,
          source: 'woocommerce_sitemap',
          confidence: 'HIGH',
          status: 'OK',
        };
      }
    }
  } catch (err) {
    console.debug('[WooCommerce] Product sitemap error:', err.message);
  }

  // ── MỨC 4: Quét trang /collections/all hoặc /shop ─────────────────
  const collectionPaths = ['/collections/all', '/shop', '/products'];
  for (const path of collectionPaths) {
    try {
      const colRes = await fetchSafe(`${origin}${path}`, 7000);
      if (colRes.ok) {
        const html = await colRes.text();
        const productSet = new Set();

        const hrefRegex = /href=["']((?:\/|https?:\/\/[^"'\s]+)\/(?:products|product)\/[^"'\s?#]+)["']/gi;
        let hm;
        while ((hm = hrefRegex.exec(html)) !== null) {
          productSet.add(hm[1]);
        }

        if (productSet.size > 0) {
          return {
            count: productSet.size,
            source: path,
            confidence: 'MEDIUM',
            status: 'OK',
          };
        }
      }
    } catch(err) {
      console.debug(`[Collections] Scan error on ${path}:`, err.message);
    }
  }

  // ── MỨC 5: Dự phòng trang chủ (Low confidence) ────────────────────
  try {
    const homeRes = await fetchSafe(`${origin}/`, 7000);
    if (homeRes.ok) {
      const html = await homeRes.text();
      const productSet = new Set();
      const hrefRegex = /href=["']((?:\/|https?:\/\/[^"'\s]+)\/(?:products|product)\/[^"'\s?#]+)["']/gi;
      let hm;
      while ((hm = hrefRegex.exec(html)) !== null) {
        productSet.add(hm[1]);
      }

      if (productSet.size > 0) {
        return {
          count: productSet.size,
          source: 'homepage_fallback',
          confidence: 'LOW',
          status: 'OK',
        };
      }
    }
  } catch(err) {
    console.debug('[Homepage] Scan fallback error:', err.message);
  }

  return {
    count: null,
    source: null,
    confidence: 'NONE',
    status: 'NO_SITEMAP_OR_UNREACHABLE',
  };
}

/**
 * Ghi dữ liệu Page đã PASS vào Google Sheet qua Apps Script Webhook
 * POST JSON -> kiểm tra HTTP status VÀ JSON response {ok:true}
 * Thất bại -> lưu vào pendingSheetWrites để retry sau
 * @param {number} pageIndex
 */
async function writeToSheet(pageIndex) {
  const state = await loadState();
  const page = state.pages[pageIndex];
  const { sheetsUrl, secretKey } = state.config;

  if (!sheetsUrl || !secretKey) {
    await addLog(`ℹ️ ${page.pageName}: Chưa cấu hình Google Apps Script URL hoặc Secret Key trong Cài đặt → Bỏ qua ghi Sheet`, 'INFO');
    return;
  }

  const payload = {
    secretKey,
    action: 'INSERT_OR_UPDATE',
    data: {
      niche: state.niche || 'Custom',
      keyword: page.keyword || '',
      pageId: page.pageId,
      pageName: page.pageName,
      postUrl: page.postUrl || '',
      websiteUrl: page.websiteUrl || '',
      activeCount: page.activeCount,
      inactiveCount: page.inactiveCount,
      activeRatio: page.activeRatio,
      productCount: page.productCount,
      productSource: page.productSource || '',
      checkedAt: new Date().toLocaleString('vi-VN'),
      status: page.status || 'PASS',
      ads: page.ads || []
    }
  };

  try {
    // Dùng Content-Type: text/plain để tránh CORS preflight OPTIONS với Google Apps Script
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(sheetsUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const result = await res.json();
    if (!result.ok) {
      throw new Error(result.error || 'Apps Script trả về ok: false');
    }

    // Ghi nhận thành công
    const updatedState = await loadState();
    updatedState.pages[pageIndex].status = 'SAVED';
    await saveState({ pages: updatedState.pages });

    await addLog(`🟣 [SAVED] Đã lưu vào Sheet: ${page.pageName} (Hàng ${result.row}, ${result.action})`, 'SAVED');

  } catch (err) {
    await addLog(`⚠️ Ghi Sheet thất bại cho ${page.pageName} (${err.message}) → Lưu vào hàng đợi retry`, 'WARN');
    
    // Lưu vào hàng đợi retry
    const curState = await loadState();
    const queue = curState.pendingSheetWrites || [];
    queue.push(payload);
    await saveState({ pendingSheetWrites: queue });
  }
}

/**
 * Gửi lại các bản ghi trong hàng đợi pendingSheetWrites khi hoàn tất hoặc Resume
 */
async function flushPendingSheetWrites() {
  const state = await loadState();
  const queue = state.pendingSheetWrites || [];
  if (queue.length === 0) return;

  const { sheetsUrl } = state.config;
  if (!sheetsUrl) return;

  await addLog(`📤 Đang xử lý ${queue.length} bản ghi tồn đọng trong hàng đợi Google Sheet...`, 'INFO');

  const remaining = [];
  for (const item of queue) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(sheetsUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(item)
      });

      clearTimeout(timer);
      const json = await res.json();
      if (json && json.ok) {
        await addLog(`🟣 [SAVED] Đã retry thành công: ${item.data.pageName}`, 'SAVED');
      } else {
        remaining.push(item);
      }
    } catch(err) {
      remaining.push(item);
    }
  }

  await saveState({ pendingSheetWrites: remaining });
}

// ═══════════════════════════════════════════════════════════════════
//  SERVICE WORKER LIFECYCLE – Khôi phục khi restart
// ═══════════════════════════════════════════════════════════════════

/**
 * Khi service worker khởi động lại (do MV3 terminate):
 * Kiểm tra nếu state đang RUNNING → tự động resume
 */
async function checkAndResumeOnStartup() {
  const state = await loadState();
  if (state.status === 'RUNNING') {
    await addLog('🔄 Service worker khởi động lại – auto resume...', 'WARN');
    startKeepalive();
    // Delay nhỏ trước khi resume để hệ thống ổn định
    setTimeout(() => {
      runResearchLoop();
    }, 2000);
  }
}

// Chạy khi extension được cài đặt hoặc cập nhật
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await resetState();
    await chrome.storage.local.set({
      [STORAGE_LOG_KEY]: [],
      [LEGACY_LOG_KEY]: []
    });
    await addLog('🎉 Extension đã cài đặt thành công! Sẵn sàng quét sản phẩm.', 'INFO');
  } else if (details.reason === 'update') {
    await addLog('🚀 Extension đã được cập nhật bản vá mới nhất. Sẵn sàng hoạt động.', 'INFO');
  }
});

// Chạy mỗi khi service worker activate (bao gồm restart)
checkAndResumeOnStartup();

// ═══════════════════════════════════════════════════════════════════
//  CHROME SIDE PANEL BEHAVIOR (CHIA KHUNG WEB NHƯ META ADS DATA ADVISOR)
// ═══════════════════════════════════════════════════════════════════

// Mở side panel khi click vào icon action trên toolbar
if (typeof chrome !== 'undefined' && chrome?.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.debug('[SidePanel] setPanelBehavior error:', err.message);
  });
}

// Fallback khi click icon action
if (typeof chrome !== 'undefined' && chrome?.action?.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      if (chrome?.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (err) {
      console.debug('[SidePanel] action.onClicked fallback error:', err.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  MESSAGE HANDLER – Nhận lệnh từ popup
// ═══════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  // Dùng async trong listener: trả true để giữ sendResponse channel mở
  (async () => {
    try {
      switch (type) {
        case 'START_RESEARCH':
          await startResearch(payload);
          sendResponse({ ok: true });
          break;

        case 'STOP_RESEARCH':
          await stopResearch();
          sendResponse({ ok: true });
          break;

        case 'RESUME_RESEARCH':
          await resumeResearch();
          sendResponse({ ok: true });
          break;

        case 'GET_STATE': {
          const state = await loadState();
          sendResponse({ ok: true, state });
          break;
        }

        case 'CLEAR_LOGS':
          await chrome.storage.local.set({
            [STORAGE_LOG_KEY]: [],
            [LEGACY_LOG_KEY]: []
          });
          sendResponse({ ok: true });
          break;

        case 'INIT_SESSION_LOG': {
          const data = await chrome.storage.local.get([STORAGE_LOG_KEY, LEGACY_LOG_KEY]);
          const existing = data[STORAGE_LOG_KEY] || data[LEGACY_LOG_KEY] || [];
          if (existing.length === 0) {
            await addLog('⚡ FB Ads Product Research Extension v2.0 đã sẵn sàng. Hãy bấm "Bắt đầu cào tự động" để chạy.', 'INFO');
          }
          sendResponse({ ok: true });
          break;
        }

        case 'FETCH_INOTE': {
          try {
            const res = await fetch(payload.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            sendResponse({ ok: true, html });
          } catch (fetchErr) {
            sendResponse({ ok: false, error: fetchErr.message });
          }
          break;
        }

        // ── Message từ content script ─────────────────────────
        case 'CONTENT_READY':
          sendResponse({ ok: true });
          break;

        case 'BLOCKED_DETECTED':
          await addLog('🚫 Content script phát hiện Facebook chặn/CAPTCHA!', 'ERROR');
          await saveState({ status: 'PAUSED' });
          stopKeepalive();
          sendResponse({ ok: true });
          break;

        case 'CONTENT_LOG':
          await addLog(payload.message, payload.type || 'INFO');
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ error: `Unknown message type: ${type}` });
      }
    } catch (err) {
      console.error(`Handler error [${type}]:`, err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // Giữ sendResponse channel mở cho async
});
