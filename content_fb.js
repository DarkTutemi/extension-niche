/**
 * content_fb.js – Content script chạy trên trang Facebook Ads Library
 * =====================================================================
 * Nhiệm vụ:
 *   1. Kiểm tra phát hiện đăng nhập / CAPTCHA / checkpoint / rate limit
 *   2. Thu thập danh sách Page từ trang kết quả keyword (cuộn trang tự động, trích xuất pageName, pageUrl, pageId)
 *   3. Đọc số lượng quảng cáo (active / inactive) trên trang Ad Library của từng Page
 *   4. Lắng nghe và phản hồi các lệnh từ background.js
 */

// ── Helpers cơ bản ──────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sleepRandom(minSec, maxSec) {
  const ms = Math.floor((Math.random() * (maxSec - minSec) + minSec) * 1000);
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chờ một phần tử xuất hiện trong DOM bằng MutationObserver hoặc polling
 */
function waitForElement(predicateFn, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const el = predicateFn();
    if (el) return resolve(el);

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout (${timeoutMs}ms) chờ phần tử DOM`));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const match = predicateFn();
      if (match) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(match);
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

// ── Phát hiện chặn / CAPTCHA / checkpoint ───────────────────────────

function checkBlockedState() {
  const bodyText = (document.body ? document.body.innerText : '').toLowerCase();

  // Kiểm tra form đăng nhập
  const hasLoginForm = document.querySelector('form[action*="login"]') || 
                       document.querySelector('input[type="password"]');

  // Kiểm tra từ khóa CAPTCHA / rate limit
  const blockedKeywords = [
    'security check', 'checkpoint', 'captcha',
    'bạn tạm thời bị chặn', 'temporarily blocked',
    'thử lại sau', 'try again later',
    'hãy giảm tốc độ', 'please slow down'
  ];

  for (const kw of blockedKeywords) {
    if (bodyText.includes(kw)) {
      return { blocked: true, reason: `Phát hiện: "${kw}"` };
    }
  }

  if (hasLoginForm && !bodyText.includes('thư viện quảng cáo') && !bodyText.includes('ad library')) {
    return { blocked: true, reason: 'Yêu cầu đăng nhập tài khoản' };
  }

  return { blocked: false };
}

// ── Trích xuất số kết quả (Active / Inactive count) ──────────────────

/**
 * Phân tích chuỗi số kết quả (ví dụ: "~86 kết quả", "~31.000 kết quả", "1,234 results")
 * Xử lý chính xác cả dấu chấm (.) và dấu phẩy (,) phân cách nghìn
 */
function parseResultCount(text) {
  if (!text) return null;
  const regex = SELECTORS?.resultCount?.regex || /[~≈]?\s*([\d.,]+)\s*(?:results|kết quả)/i;
  const m = text.match(regex);
  if (!m) return null;

  const rawNum = m[1].trim();
  // Bỏ toàn bộ dấu chấm và phẩy để lấy số nguyên chuẩn
  const clean = rawNum.replace(/[.,]/g, '');
  const num = parseInt(clean, 10);
  return isNaN(num) ? null : num;
}

/**
 * Tìm phần tử hiển thị tổng số kết quả trên trang
 */
function extractAdCountFromPage() {
  // Ưu tiên 1: div[role="heading"][aria-level="3"]
  const headings = Array.from(document.querySelectorAll('div[role="heading"][aria-level="3"], h3, span, div'));
  for (const el of headings) {
    if (el.children.length === 0 || el.children.length === 1) {
      const text = el.textContent.trim();
      const count = parseResultCount(text);
      if (count !== null) {
        return { count, rawText: text, status: count === 0 ? 'ZERO' : 'OK' };
      }
    }
  }

  // Ưu tiên 2: Duyệt toàn bộ text nodes khớp regex
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.trim();
    const count = parseResultCount(text);
    if (count !== null) {
      return { count, rawText: text, status: count === 0 ? 'ZERO' : 'OK' };
    }
  }

  // Kiểm tra xem có phải thông báo không tìm thấy kết quả nào không
  const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
  const zeroPhrases = (typeof SELECTORS !== 'undefined' && SELECTORS.pageResultCount?.zeroPhrases) || [
    'không có kết quả',
    'no results',
    '0 kết quả',
    '0 results',
    'không có quảng cáo nào khớp',
    'no ads match',
    'không tìm thấy quảng cáo nào',
    'there are no ads to show',
    'no ads found',
  ];
  if (zeroPhrases.some(phrase => bodyText.includes(phrase))) {
    return { count: 0, rawText: '0 results', status: 'ZERO' };
  }

  return { count: null, rawText: null, status: 'UNKNOWN' };
}

// ── Crawl danh sách Page từ kết quả tìm kiếm keyword ─────────────────

/**
 * Trích xuất các Page từ các thẻ quảng cáo đang hiển thị trên trang
 */
function extractPagesFromVisibleAds() {
  const pages = [];
  
  // Tìm tất cả các link dẫn đến Fanpage trên Facebook
  // Trên Ad Library, tên Page luôn nằm trong link <a href="https://www.facebook.com/<PageName>/">
  const allLinks = Array.from(document.querySelectorAll('a[href*="facebook.com/"]'));

  for (const a of allLinks) {
    const href = a.href || '';
    
    // Loại trừ các link nội bộ của Facebook / Ad Library
    if (
      href.includes('/ads/library') || 
      href.includes('l.facebook.com') || 
      href.includes('/sharer') || 
      href.includes('/privacy') || 
      href.includes('/policies') ||
      href.includes('/help') ||
      href.includes('#')
    ) {
      continue;
    }

    const pageName = a.textContent.trim();
    if (!pageName || pageName.length < 2) continue;

    // Trích xuất username hoặc numeric ID từ pathname
    // Ví dụ: https://www.facebook.com/AliExpress/ -> AliExpress
    // Ví dụ: https://www.facebook.com/61573723126481/ -> 61573723126481
    try {
      const urlObj = new URL(href);
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length === 0) continue;
      
      const identifier = parts[0];
      // Bỏ qua các đường dẫn hệ thống
      if (['pages', 'groups', 'reel', 'watch', 'gaming', 'marketplace'].includes(identifier)) {
        continue;
      }

      // Kiểm tra xem có phải ID số nguyên không
      const isNumeric = /^\d{10,18}$/.test(identifier);

      pages.push({
        pageName,
        pageUrl: href,
        pageId: isNumeric ? identifier : null,
        identifier: identifier,
        isNumeric
      });
    } catch(err) {
      console.debug('[ContentFB] Parse page anchor skipped:', err.message);
    }
  }

  return pages;
}

/**
 * Thực hiện cuộn trang tự động và gom Page cho đến khi đạt giới hạn
 */
async function crawlPagesWithScroll({ maxScrolls = 15, maxPages = 30, delayMin = 2, delayMax = 4 }) {
  const collectedMap = new Map(); // key = identifier (hoặc pageId)
  
  // Chờ danh sách kết quả ban đầu render
  await sleep(2500);

  let noNewCount = 0;

  for (let s = 1; s <= maxScrolls; s++) {
    // 1. Kiểm tra bị chặn
    const blockCheck = checkBlockedState();
    if (blockCheck.blocked) {
      return { pages: Array.from(collectedMap.values()), blocked: true, reason: blockCheck.reason };
    }

    // 2. Trích xuất các Page đang có trong DOM
    const visiblePages = extractPagesFromVisibleAds();
    let newInThisScroll = 0;

    for (const p of visiblePages) {
      const key = p.pageId || p.identifier;
      if (key && !collectedMap.has(key)) {
        collectedMap.set(key, p);
        newInThisScroll++;
        
        // Báo cáo log nhẹ nhàng
        chrome.runtime.sendMessage({
          type: 'CONTENT_LOG',
          payload: { message: `  + Page tìm thấy: ${p.pageName} (${p.identifier})`, type: 'INFO' }
        }).catch(err => console.debug('[ContentFB] Send log skipped:', err.message));
      }

      if (collectedMap.size >= maxPages) {
        break;
      }
    }

    if (collectedMap.size >= maxPages) {
      break;
    }

    if (newInThisScroll === 0) {
      noNewCount++;
      if (noNewCount >= 3) {
        // Đã cuộn 3 lần liên tiếp không có thêm quảng cáo mới → đã chạm đáy
        break;
      }
    } else {
      noNewCount = 0;
    }

    // 3. Cuộn xuống một đoạn
    const scrollDistance = SELECTORS?.scroll?.distance || 800;
    window.scrollBy({ top: scrollDistance, behavior: 'smooth' });

    // Nghỉ ngẫu nhiên giữa các lần cuộn để FB lazy-load nội dung
    await sleepRandom(delayMin, delayMax);
  }

  return {
    pages: Array.from(collectedMap.values()),
    blocked: false
  };
}

// ── Giải mã link CTA l.facebook.com & chuẩn hóa URL (Giai đoạn 3) ───

/**
 * Giải mã link CTA của Facebook và loại bỏ tham số tracking
 * @param {string} rawUrl
 * @returns {{websiteUrl: string, websiteUrlRaw: string, rootDomain: string|null}}
 */
function decodeCtaUrl(rawUrl) {
  if (!rawUrl) return null;
  let decoded = rawUrl;

  try {
    // Nếu là link bọc qua l.facebook.com/l.php?u=...
    if (rawUrl.includes('l.facebook.com/l.php')) {
      const u = new URL(rawUrl);
      const targetParam = u.searchParams.get('u');
      if (targetParam) {
        decoded = decodeURIComponent(targetParam);
      }
    }

    // Làm sạch tracking parameters (fbclid, utm_*, gclid...)
    const targetUrl = new URL(decoded);
    const trackingParams = [
      'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 
      'utm_term', 'utm_content', 'gclid', '_ga', 'ref', 'source'
    ];
    for (const p of trackingParams) {
      targetUrl.searchParams.delete(p);
    }

    return {
      websiteUrl: targetUrl.toString(),
      websiteUrlRaw: decoded,
      rootDomain: targetUrl.origin
    };
  } catch(e) {
    return {
      websiteUrl: decoded,
      websiteUrlRaw: decoded,
      rootDomain: null
    };
  }
}

/**
 * Trích xuất link bài post ads và link website đích từ quảng cáo đầu tiên
 */
async function extractFirstAdDetails() {
  await sleep(1500); // Chờ card render

  // 1. Tìm thẻ quảng cáo đầu tiên
  const cards = Array.from(document.querySelectorAll('div[class*="x1plvlek"], div[class*="x1cy8zhl"]'));
  const firstCard = cards.find(c => c.querySelectorAll('*').length > 15) || cards[0];

  let postUrl = null;
  let rawCtaUrl = null;

  if (firstCard) {
    // Tìm link CTA trực tiếp trên card
    const ctaLink = firstCard.querySelector('a[href*="l.facebook.com/l.php"]');
    if (ctaLink) {
      rawCtaUrl = ctaLink.href;
    }

    // Tìm ID thư viện hoặc link post
    const text = firstCard.innerText || '';
    const idMatch = text.match(/(?:ID thư viện|Library ID):\s*(\d+)/i);
    if (idMatch) {
      postUrl = `https://www.facebook.com/ads/library/?id=${idMatch[1]}`;
    }
  }

  // 2. Nếu chưa tìm thấy CTA ngoài card, thử click nút "Xem chi tiết quảng cáo"
  if (!rawCtaUrl) {
    const seeDetailsBtn = Array.from(document.querySelectorAll('*')).find(el => 
      el.children.length === 0 && /(Xem chi tiết quảng cáo|See ad details|Xem chi tiết bản tóm tắt|See summary details)/i.test(el.textContent)
    );

    if (seeDetailsBtn) {
      const btn = seeDetailsBtn.closest('[role="button"]') || seeDetailsBtn;
      btn.click();
      await sleep(2000); // Chờ dialog mở

      // Tìm trong modal/dialog
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        const modalCta = dialog.querySelector('a[href*="l.facebook.com/l.php"]');
        if (modalCta) {
          rawCtaUrl = modalCta.href;
        }

        // Đóng dialog sau khi lấy xong
        const closeBtn = dialog.querySelector('div[aria-label="Đóng"], div[aria-label="Close"], [role="button"]');
        if (closeBtn) closeBtn.click();
      }
    }
  }

  // 3. Fallback: Quét bất kỳ link l.facebook.com nào trên trang
  if (!rawCtaUrl) {
    const fallbackCta = document.querySelector('a[href*="l.facebook.com/l.php"]:not([href*="messenger.com"]):not([href*="instagram.com"]):not([href*="threads.com"])');
    if (fallbackCta) {
      rawCtaUrl = fallbackCta.href;
    }
  }

  if (!rawCtaUrl) {
    return {
      postUrl,
      websiteUrl: null,
      websiteUrlRaw: null,
      rootDomain: null,
      status: 'NO_WEBSITE'
    };
  }

  const decoded = decodeCtaUrl(rawCtaUrl);
  return {
    postUrl,
    websiteUrl: decoded.websiteUrl,
    websiteUrlRaw: decoded.websiteUrlRaw,
    rootDomain: decoded.rootDomain,
    status: 'OK'
  };
}

// ══════════════════════════════════════════════════════════════════════
//  META GRAPHQL API CLIENT (Siêu tốc, chính xác 100%, không cần cuộn DOM)
// ══════════════════════════════════════════════════════════════════════

const FB_GRAPHQL_DOC_ID = '26617181747964058';

function extractFbAuthTokens() {
  let fb_dtsg = null, lsd = null, userId = null;

  try {
    const dtsgInput = document.querySelector('input[name="fb_dtsg"]');
    if (dtsgInput && dtsgInput.value) fb_dtsg = dtsgInput.value;
    const lsdInput = document.querySelector('input[name="lsd"]');
    if (lsdInput && lsdInput.value) lsd = lsdInput.value;

    if (window.DTSGInitialData?.token) fb_dtsg = window.DTSGInitialData.token;
    if (window.LSD?.token) lsd = window.LSD.token;
    if (window.Env?.USER_ID) userId = window.Env.USER_ID;
  } catch(e) {
    console.debug('[ContentFB] Read window tokens skipped:', e.message);
  }

  if (!fb_dtsg || !lsd || !userId) {
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '');
    for (const text of scripts) {
      if (!fb_dtsg) {
        const m = text.match(/"DTSGInitialData"[^}]*"token":"([^"]+)"/) ||
                  text.match(/\["DTSGInitialData",\[\],\{"token":"([^"]+)"\}/) ||
                  text.match(/"DTSGInitData":\{"token":"([^"]+)"/) ||
                  text.match(/"token":"(NAf[^"]+)"/);
        if (m) fb_dtsg = m[1];
      }
      if (!lsd) {
        const m = text.match(/"LSD",\[\],\{"token":"([^"]+)"\}/) ||
                  text.match(/"LSD"[^}]*"token":"([^"]+)"/) ||
                  text.match(/"token":"(FG8[^"]+)"/);
        if (m) lsd = m[1];
      }
      if (!userId) {
        const m = text.match(/"USER_ID":"(\d+)"/);
        if (m) userId = m[1];
      }
    }
  }

  const cookieMatch = document.cookie.match(/c_user=(\d+)/);
  if (cookieMatch) userId = cookieMatch[1];

  return {
    fb_dtsg,
    lsd: lsd || 'FG8fc5u7N54QUhSLUuecSr',
    userId: userId || '100003812630357'
  };
}

async function callMetaGraphQL(variables) {
  const auth = extractFbAuthTokens();
  if (!auth.fb_dtsg) throw new Error('Không tìm thấy fb_dtsg token trên trang');

  const bodyParams = new URLSearchParams({
    av: auth.userId,
    __user: auth.userId,
    __a: '1',
    __comet_req: '94',
    fb_dtsg: auth.fb_dtsg,
    jazoest: '25652',
    lsd: auth.lsd || 'FG8fc5u7N54QUhSLUuecSr',
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'AdLibraryMobileFocusedStateProviderRefetchQuery',
    server_timestamps: 'true',
    variables: JSON.stringify(variables),
    doc_id: FB_GRAPHQL_DOC_ID
  });

  const res = await fetch('https://www.facebook.com/api/graphql/', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-fb-friendly-name': 'AdLibraryMobileFocusedStateProviderRefetchQuery',
      'x-fb-lsd': auth.lsd || 'FG8fc5u7N54QUhSLUuecSr'
    },
    body: bodyParams.toString()
  });

  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const raw = await res.text();
  const rawParts = raw.split('\n').filter(Boolean);

  let mergedData = {};
  for (const part of rawParts) {
    const clean = part.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '').trim();
    if (!clean) continue;
    try {
      const obj = JSON.parse(clean);
      if (obj.data) {
        mergedData = { ...mergedData, ...obj.data };
      }
    } catch (parseErr) {
      console.debug('[ContentFB] Partial line parse skipped:', parseErr.message);
    }
  }
  return { data: mergedData };
}

async function crawlPagesViaGraphQL({ keyword, country = 'US', config = {}, maxPages = 30 }) {
  // Lấy keyword từ URL nếu không truyền
  let queryKeyword = keyword;
  if (!queryKeyword) {
    const u = new URL(window.location.href);
    queryKeyword = u.searchParams.get('q') || '';
  }
  if (!queryKeyword) return { pages: [] };

  const isExact = (config.searchType === 'KEYWORD_EXACT_PHRASE');
  let queryStr = isExact ? `"${queryKeyword}"` : queryKeyword;
  let activeSearchType = config.searchType || 'KEYWORD_UNORDERED';
  const targetCountry = country === 'ALL' ? 'US' : country;

  const buildVariables = (q, sType) => ({
    activeStatus: 'ACTIVE',
    adType: 'ALL',
    audienceTimeframe: 'LAST_7_DAYS',
    bylines: [],
    collationToken: 'faa17582-e352-4445-ace8-508282f9e61a',
    contentLanguages: [],
    countries: country === 'ALL' ? [] : [country],
    country: targetCountry,
    cursor: null,
    deeplinkAdID: null,
    excludedIDs: [],
    fetchPageInfo: false,
    fetchSharedDisclaimers: false,
    first: Math.min(30, maxPages),
    hasDeeplinkAdID: false,
    isAboutTab: false,
    isAudienceTab: false,
    isLandingPage: false,
    isTargetedCountry: false,
    location: null,
    mediaType: config.mediaType || 'ALL',
    multiCountryFilterMode: null,
    pageIDs: [],
    potentialReachInput: [],
    publisherPlatforms: config.publisherPlatform && config.publisherPlatform !== 'ALL' ? [config.publisherPlatform] : [],
    queryString: q,
    regions: [],
    searchType: sType,
    sessionID: '0f73ce97-0776-429c-9e41-557b4668922c',
    sortData: {
      direction: 'DESCENDING',
      mode: config.sortMode || 'SORT_BY_TOTAL_IMPRESSIONS'
    },
    source: null,
    startDate: config.startDateMin ? { min: config.startDateMin, max: null } : null,
    v: '0c407c',
    viewAllPageID: '0'
  });

  let json = await callMetaGraphQL(buildVariables(queryStr, activeSearchType));
  let edges = json.data?.ad_library_main?.search_results_connection?.edges || [];

  // Fallback thông minh: nếu tìm kiếm Exact Phrase trả về 0 kết quả, tự động thử lại dạng Unordered
  if (edges.length === 0 && isExact) {
    console.debug('[ContentFB] Exact phrase trả về 0 kết quả, chuyển sang tìm kiếm từ khóa mở rộng...');
    json = await callMetaGraphQL(buildVariables(queryKeyword, 'KEYWORD_UNORDERED'));
    edges = json.data?.ad_library_main?.search_results_connection?.edges || [];
  }

  const pageMap = new Map();
  for (const edge of edges) {
    const collated = edge.node?.collated_results || [];
    for (const item of collated) {
      if (!item.page_id) continue;
      const snap = item.snapshot || {};
      const pageId = String(item.page_id);
      const pageName = snap.page_name || item.page_name || 'Fanpage ' + pageId;
      const websiteUrl = snap.link_url || snap.caption || null;

      if (!pageMap.has(pageId)) {
        pageMap.set(pageId, {
          pageName,
          pageUrl: snap.page_profile_uri || `https://www.facebook.com/${pageId}/`,
          pageId,
          identifier: pageId,
          isNumeric: true,
          websiteUrl,
          sampleAdArchiveId: item.ad_archive_id
        });
      } else if (websiteUrl && !pageMap.get(pageId).websiteUrl) {
        pageMap.get(pageId).websiteUrl = websiteUrl;
      }
    }
  }

  return { pages: Array.from(pageMap.values()) };
}

async function readPageAdCountViaGraphQL(pageId, status = 'active') {
  const variables = {
    activeStatus: status.toUpperCase(),
    adType: 'ALL',
    audienceTimeframe: 'LAST_7_DAYS',
    bylines: [],
    collationToken: '937e0430-4096-4448-8304-a8e6a1c28539',
    contentLanguages: [],
    countries: [],
    cursor: null,
    deeplinkAdID: null,
    excludedIDs: [],
    fetchPageInfo: false,
    fetchSharedDisclaimers: false,
    first: 30,
    hasDeeplinkAdID: false,
    isAboutTab: false,
    isAudienceTab: false,
    isLandingPage: false,
    isTargetedCountry: false,
    location: null,
    mediaType: 'ALL',
    multiCountryFilterMode: null,
    pageIDs: [String(pageId)],
    potentialReachInput: [],
    publisherPlatforms: [],
    queryString: '',
    regions: [],
    searchType: 'PAGE',
    sessionID: '0f73ce97-0776-429c-9e41-557b4668922c',
    sortData: { direction: 'DESCENDING', mode: 'SORT_BY_TOTAL_IMPRESSIONS' },
    source: null,
    startDate: null,
    v: '0c407c',
    viewAllPageID: String(pageId)
  };

  const json = await callMetaGraphQL(variables);
  const conn = json.data?.ad_library_main?.search_results_connection || json.data?.viewer?.ad_library_main?.search_results_connection;
  const count = (conn?.count !== undefined && conn?.count !== null) ? conn.count : (conn?.edges?.length !== undefined ? conn.edges.length : null);

  if (count === null) {
    return { count: null, status: 'UNKNOWN' };
  }

  return {
    count,
    rawText: `${count} ads (GraphQL)`,
    status: count === 0 ? 'ZERO' : 'OK'
  };
}

// ══════════════════════════════════════════════════════════════════════
//  MESSAGE DISPATCHER
// ══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  (async () => {
    try {
      // 1. Kiểm tra trạng thái bị chặn trước tiên
      const blockCheck = checkBlockedState();
      if (blockCheck.blocked) {
        chrome.runtime.sendMessage({
          type: 'BLOCKED_DETECTED',
          payload: blockCheck
        }).catch(err => console.debug('[ContentFB] Send blocked event skipped:', err.message));
        sendResponse({ error: 'BLOCKED', reason: blockCheck.reason });
        return;
      }

      switch (type) {
        // Crawl Page từ trang keyword
        case 'CRAWL_PAGES': {
          const cfg = payload.config || {};
          // Ưu tiên 1: Gọi trực tiếp Meta GraphQL API siêu tốc nếu không ép dùng DOM
          if (cfg.crawlerEngine !== 'DOM') {
            try {
              const apiResult = await crawlPagesViaGraphQL(payload || {});
              if (apiResult && apiResult.pages && apiResult.pages.length > 0) {
                sendResponse({ ok: true, pages: apiResult.pages, source: 'GRAPHQL_API' });
                return;
              }
            } catch (apiErr) {
              console.debug('[ContentFB] GraphQL API crawl fallback to DOM:', apiErr.message);
            }
          }

          // Ưu tiên 2: Fallback cuộn trang DOM truyền thống
          const result = await crawlPagesWithScroll(payload || {});
          sendResponse({ ok: true, ...result });
          break;
        }

        // Đọc số kết quả quảng cáo trên trang của Page
        case 'READ_AD_COUNT': {
          // Ưu tiên 1: Thử truy vấn qua GraphQL nếu có thông tin Page ID
          if (payload && payload.pageId) {
            try {
              const apiCount = await readPageAdCountViaGraphQL(payload.pageId, payload.status || 'active');
              if (apiCount && apiCount.status !== 'UNKNOWN') {
                sendResponse({ ok: true, ...apiCount, source: 'GRAPHQL_API' });
                return;
              }
            } catch (apiErr) {
              console.debug('[ContentFB] GraphQL API count fallback to DOM:', apiErr.message);
            }
          }

          // Ưu tiên 2: Chờ và đọc số kết quả hiển thị trên DOM
          let countRes = extractAdCountFromPage();
          if (countRes.status === 'UNKNOWN') {
            await sleep(2500);
            countRes = extractAdCountFromPage();
          }
          sendResponse({ ok: true, ...countRes });
          break;
        }

        // Lấy link bài post ads và website đích (Giai đoạn 3)
        case 'GET_AD_DETAILS': {
          const adDetails = await extractFirstAdDetails();
          sendResponse({ ok: true, ...adDetails });
          break;
        }

        // Kiểm tra chặn đơn thuần
        case 'CHECK_BLOCKED': {
          sendResponse({ ok: true, ...blockCheck });
          break;
        }

        default:
          sendResponse({ error: `content_fb: Không hỗ trợ type ${type}` });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();

  return true; // giữ channel mở cho async response
});

// Thông báo content script đã sẵn sàng
chrome.runtime.sendMessage({ type: 'CONTENT_READY' }).catch(err => console.debug('[ContentFB] CONTENT_READY skipped:', err.message));
