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

    // Trích xuất link bài post gốc / Reel trên Facebook hoặc ID thư viện
    const domPostUrl = extractPostUrlFromCardDom(firstCard);
    const text = firstCard.innerText || '';
    const idMatch = text.match(/(?:ID thư viện|Library ID):\s*(\d+)/i);
    const adArchiveId = idMatch ? idMatch[1] : null;

    postUrl = domPostUrl || (adArchiveId ? `https://www.facebook.com/ads/library/?id=${adArchiveId}` : null);
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

var FB_GRAPHQL_DOC_ID = (typeof globalThis !== 'undefined' && globalThis.FB_GRAPHQL_DOC_ID) ? globalThis.FB_GRAPHQL_DOC_ID : '24922295957467452';
if (typeof globalThis !== 'undefined') {
  globalThis.FB_GRAPHQL_DOC_ID = FB_GRAPHQL_DOC_ID;
}

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
                  text.match(/"token":"(NAf[^"]+)"/) ||
                  text.match(/"token":"([A-Za-z0-9_-]{15,}:[0-9]+:[0-9]+)"/);
        if (m) fb_dtsg = m[1];
      }
      if (!lsd) {
        const m = text.match(/"LSD",\[\],\{"token":"([^"]+)"\}/) ||
                  text.match(/"LSD"[^}]*"token":"([^"]+)"/) ||
                  text.match(/"token":"(FG8[^"]+)"/);
        if (m) lsd = m[1];
      }
      if (!userId) {
        const m = text.match(/"USER_ID":"(\d+)"/) || text.match(/"actorID":"(\d+)"/);
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
    fb_api_req_friendly_name: 'AdLibrarySearchPaginationQuery',
    server_timestamps: 'true',
    variables: JSON.stringify(variables),
    doc_id: FB_GRAPHQL_DOC_ID
  });

  const res = await fetch('https://www.facebook.com/api/graphql/', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-fb-friendly-name': 'AdLibrarySearchPaginationQuery',
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

async function crawlPagesViaGraphQL({ keyword, country = 'US', config = {}, maxPages = 0 }) {
  // Lấy keyword từ URL nếu không truyền
  let queryKeyword = keyword;
  if (!queryKeyword) {
    const u = new URL(window.location.href);
    queryKeyword = u.searchParams.get('q') || '';
  }
  if (!queryKeyword) return { pages: [] };

  const cleanKw = (queryKeyword || '').replace(/^["']+|["']+$/g, '').trim();
  const isExact = (config.searchType === 'KEYWORD_EXACT_PHRASE');
  let queryStr = isExact ? `"${cleanKw}"` : cleanKw;
  let activeSearchType = config.searchType || 'KEYWORD_UNORDERED';
  const targetCountry = country === 'ALL' ? 'US' : country;
  const targetMax = (maxPages && Number(maxPages) > 0) ? Number(maxPages) : 0;

  // Đảm bảo enum sortData.mode luôn hợp lệ trong GraphQL schema (Meta chỉ cho phép TOTAL_IMPRESSIONS hoặc RELEVANCY)
  const validSortModes = ['SORT_BY_TOTAL_IMPRESSIONS', 'SORT_BY_RELEVANCY_MONTHLY_GROUPED'];
  const gqlSortMode = validSortModes.includes(config.sortMode) ? config.sortMode : 'SORT_BY_TOTAL_IMPRESSIONS';

  const buildVariables = (q, sType, cursor = null, ignoreDate = false) => ({
    activeStatus: 'active',
    adType: 'ALL',
    bylines: [],
    collationToken: null,
    contentLanguages: [],
    countries: targetCountry === 'ALL' ? ['US'] : [targetCountry],
    cursor,
    excludedIDs: null,
    first: 30,
    isTargetedCountry: false,
    location: null,
    mediaType: (config.mediaType || 'video').toLowerCase(),
    multiCountryFilterMode: null,
    pageIDs: [],
    potentialReachInput: null,
    publisherPlatforms: config.publisherPlatform && config.publisherPlatform !== 'ALL' ? [config.publisherPlatform.toLowerCase()] : ['facebook'],
    queryString: q,
    regions: null,
    searchType: (sType || 'keyword_exact_phrase').toLowerCase(),
    sessionID: '0f73ce97-0776-429c-9e41-557b4668922c',
    sortData: {
      direction: 'DESCENDING',
      mode: gqlSortMode
    },
    source: null,
    startDate: (!ignoreDate && config.startDateMin) ? { min: config.startDateMin, max: null } : null,
    v: 'e3d3df',
    viewAllPageID: '0'
  });

  const pageMap = new Map();
  const processEdges = (edgesList) => {
    for (const edge of edgesList) {
      const collated = edge.node?.collated_results || [];
      for (const item of collated) {
        if (!item.page_id) continue;
        const snap = item.snapshot || {};
        const pageId = String(item.page_id);
        const pageName = snap.page_name || item.page_name || 'Fanpage ' + pageId;
        const rawWebsite = snap.link_url || snap.caption || null;
        let websiteUrl = rawWebsite;
        let rootDomain = null;
        if (rawWebsite) {
          const dec = typeof decodeCtaUrl === 'function' ? decodeCtaUrl(rawWebsite) : null;
          if (dec && dec.websiteUrl) {
            websiteUrl = dec.websiteUrl;
            rootDomain = dec.rootDomain;
          }
        }

        const postInfo = resolveCreativePostUrl(item, snap, pageId);
        const resolvedPostUrl = (postInfo.fbPostUrl && !postInfo.fbPostUrl.includes('ads/library'))
          ? postInfo.fbPostUrl
          : (postInfo.reelUrl || postInfo.storyUrl || (item.ad_archive_id ? `https://www.facebook.com/ads/library/?id=${item.ad_archive_id}` : null));

        if (!pageMap.has(pageId)) {
          pageMap.set(pageId, {
            pageName,
            pageUrl: snap.page_profile_uri || `https://www.facebook.com/${pageId}/`,
            pageId,
            identifier: pageId,
            isNumeric: true,
            postUrl: resolvedPostUrl,
            fbPostUrl: postInfo.fbPostUrl,
            reelUrl: postInfo.reelUrl,
            storyUrl: postInfo.storyUrl,
            websiteUrl,
            websiteUrlRaw: rawWebsite,
            rootDomain,
            sampleAdArchiveId: item.ad_archive_id
          });
        } else {
          const cur = pageMap.get(pageId);
          if (websiteUrl && !cur.websiteUrl) {
            cur.websiteUrl = websiteUrl;
            cur.websiteUrlRaw = rawWebsite;
            cur.rootDomain = rootDomain;
          }
          if ((!cur.postUrl || cur.postUrl.includes('ads/library')) && postInfo.fbPostUrl && !postInfo.fbPostUrl.includes('ads/library')) {
            cur.postUrl = postInfo.fbPostUrl;
            cur.fbPostUrl = postInfo.fbPostUrl;
            cur.reelUrl = postInfo.reelUrl;
            cur.storyUrl = postInfo.storyUrl;
          }
        }
      }
    }
  };

  let json = await callMetaGraphQL(buildVariables(queryStr, activeSearchType));
  let conn = json.data?.ad_library_main?.search_results_connection;
  let edges = conn?.edges || [];
  let pageInfo = conn?.page_info;

  // Fallback 1: Nếu Exact Phrase trả về 0 kết quả, tự động thử lại dạng Unordered
  if (edges.length === 0 && isExact) {
    console.debug('[ContentFB] Exact phrase trả về 0 kết quả, chuyển sang tìm kiếm từ khóa mở rộng...');
    json = await callMetaGraphQL(buildVariables(cleanKw, 'KEYWORD_UNORDERED'));
    conn = json.data?.ad_library_main?.search_results_connection;
    edges = conn?.edges || [];
    pageInfo = conn?.page_info;
  }

  // Fallback 2: Nếu có bộ lọc startDateMin làm mất kết quả, thử lại all-time
  if (edges.length === 0 && config.startDateMin) {
    console.debug('[ContentFB] 0 kết quả với bộ lọc ngày, thử lại không giới hạn ngày (all-time)...');
    json = await callMetaGraphQL(buildVariables(cleanKw, 'KEYWORD_UNORDERED', null, true));
    conn = json.data?.ad_library_main?.search_results_connection;
    edges = conn?.edges || [];
    pageInfo = conn?.page_info;
  }

  // Fallback 3: Nếu mediaType làm mất kết quả, thử lại mediaType = 'all'
  if (edges.length === 0 && config.mediaType && config.mediaType.toLowerCase() !== 'all') {
    console.debug('[ContentFB] 0 kết quả với mediaType, thử lại mediaType=all...');
    const allMediaVars = buildVariables(cleanKw, 'KEYWORD_UNORDERED', null, true);
    allMediaVars.mediaType = 'all';
    json = await callMetaGraphQL(allMediaVars);
    conn = json.data?.ad_library_main?.search_results_connection;
    edges = conn?.edges || [];
    pageInfo = conn?.page_info;
  }

  processEdges(edges);

  // Phân trang tự động bằng cursor để lấy TOÀN BỘ Page qua API
  let pageCount = 1;
  const maxLoops = targetMax > 0 ? Math.ceil(targetMax / 20) : 10;
  while (pageInfo?.has_next_page && pageInfo?.end_cursor && pageCount < maxLoops) {
    if (targetMax > 0 && pageMap.size >= targetMax) break;
    pageCount++;
    try {
      const nextJson = await callMetaGraphQL(buildVariables(queryStr, activeSearchType, pageInfo.end_cursor));
      const nextConn = nextJson.data?.ad_library_main?.search_results_connection;
      const nextEdges = nextConn?.edges || [];
      pageInfo = nextConn?.page_info;
      if (nextEdges.length === 0) break;
      processEdges(nextEdges);
    } catch (pageErr) {
      console.debug('[ContentFB] GraphQL pagination loop error:', pageErr.message);
      break;
    }
  }

  return { pages: Array.from(pageMap.values()) };
}

/**
 * Trích xuất Video ID / Media ID từ mọi định dạng URL CDN của Facebook
 * Facebook CDN URL thường có dạng:
 *  - .../502763424_678391701483463_283573956325151437_n.mp4 (cluster_videoId_hash)
 *  - .../932868533169924_n.mp4 hoặc .../932868533169924.mp4
 *  - ...?v=932868533169924 hoặc &video_id=932868533169924
 */
function extractFbMediaIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // 1. Dạng chuẩn CDN Facebook: _<14-18 số>_ (cluster_videoId_hash)
  const m1 = url.match(/_(\d{14,18})_/);
  if (m1 && m1[1]) return m1[1];

  // 2. Dạng /<14-18 số>_ hoặc /<14-18 số>.
  const m2 = url.match(/\/(\d{14,18})[_\.]/);
  if (m2 && m2[1]) return m2[1];

  // 3. Dạng query parameter ?v= hoặc &video_id= hoặc &id=
  const m3 = url.match(/[?&](?:v|video_id|id)=(\d{14,18})/);
  if (m3 && m3[1]) return m3[1];

  // 4. Tokenize tên file tìm bất kỳ khối 14-18 chữ số
  try {
    const filename = url.split('?')[0].split('/').pop() || '';
    const parts = filename.split(/[_\.-]/);
    for (const part of parts) {
      if (/^\d{14,18}$/.test(part)) return part;
    }
  } catch (e) {
    console.debug('[extractFbMediaIdFromUrl] Parse error:', e.message);
  }

  return null;
}

/**
 * Trích xuất link bài post gốc / Reel / Story thực tế trên Facebook cho một Ad Creative
 * Định dạng:
 *  - Facebook Story/Post: https://www.facebook.com/story.php?story_fbid=<fbid>&id=<pageId>
 *  - Facebook Reel: https://www.facebook.com/reel/<videoId>
 *  - Instagram Reel/Post: https://www.instagram.com/reel/<id> hoặc https://www.instagram.com/p/<id>
 *  - Fallback: https://www.facebook.com/ads/library/?id=<adArchiveId>
 */
function resolveCreativePostUrl(item = {}, snap = {}, pageId = null) {
  const adArchiveId = item.ad_archive_id || snap.ad_archive_id || '';
  const fallbackAdLibrary = adArchiveId ? `https://www.facebook.com/ads/library/?id=${adArchiveId}` : null;
  const targetPageId = String(pageId || snap.page_id || item.page_id || '');

  let fbPostUrl = null;
  let reelUrl = null;
  let storyUrl = null;
  let igUrl = null;
  let videoId = null;

  // 1. Kiểm tra page_post_id (khi ad được tạo từ bài post / reel có sẵn của Page)
  const pagePostId = snap.page_post_id || item.page_post_id;
  if (pagePostId) {
    const str = String(pagePostId);
    if (str.includes('_')) {
      const parts = str.split('_');
      const pId = parts[0] || targetPageId;
      const fbid = parts[1];
      if (fbid) {
        storyUrl = `https://www.facebook.com/story.php?story_fbid=${fbid}&id=${pId}`;
        fbPostUrl = storyUrl;
      }
    } else {
      storyUrl = `https://www.facebook.com/story.php?story_fbid=${str}&id=${targetPageId}`;
      fbPostUrl = storyUrl;
    }
  }

  // 2. Kiểm tra post_url / permalink trực tiếp từ snapshot
  if (!fbPostUrl && (snap.post_url || snap.permalink_url || item.post_url)) {
    fbPostUrl = snap.post_url || snap.permalink_url || item.post_url;
    if (fbPostUrl.includes('story_fbid')) storyUrl = fbPostUrl;
    if (fbPostUrl.includes('/reel/')) reelUrl = fbPostUrl;
  }

  // 3. Trích xuất Reel / Video ID nếu ad là dạng Video (snap.videos hoặc item.videos)
  const videos = snap.videos || item.videos || [];
  if (Array.isArray(videos) && videos.length > 0) {
    for (const v of videos) {
      if (v.video_id || v.id) {
        videoId = String(v.video_id || v.id);
        break;
      }
      const candUrls = [v.video_sd_url, v.video_hd_url, v.video_preview_image_url].filter(Boolean);
      for (const cu of candUrls) {
        const foundId = extractFbMediaIdFromUrl(cu);
        if (foundId) {
          videoId = foundId;
          break;
        }
      }
      if (videoId) break;
    }
  }

  // 4. Nếu là Carousel (snap.cards), kiểm tra video trong từng thẻ card
  if (!videoId && Array.isArray(snap.cards) && snap.cards.length > 0) {
    for (const card of snap.cards) {
      if (card.video_id || card.id) {
        videoId = String(card.video_id || card.id);
        break;
      }
      const candUrls = [card.video_sd_url, card.video_hd_url, card.video_preview_image_url].filter(Boolean);
      for (const cu of candUrls) {
        const foundId = extractFbMediaIdFromUrl(cu);
        if (foundId) {
          videoId = foundId;
          break;
        }
      }
      if (videoId) break;
    }
  }

  // 5. Nếu tìm được videoId: Tạo link Reel & Story
  if (videoId) {
    reelUrl = `https://www.facebook.com/reel/${videoId}`;
    if (targetPageId) {
      storyUrl = `https://www.facebook.com/story.php?story_fbid=${videoId}&id=${targetPageId}`;
    }
    if (!fbPostUrl) {
      // Ưu tiên Story URL (mở thẳng bài post xem like/share/cmt chuẩn xác), fallback sang Reel URL
      fbPostUrl = storyUrl || reelUrl;
    }
  }

  // 6. Kiểm tra Instagram Reel / Post
  if (snap.instagram_permalink_url) {
    igUrl = snap.instagram_permalink_url;
    if (!fbPostUrl) fbPostUrl = igUrl;
  } else if (snap.instagram_actor_name) {
    igUrl = `https://www.instagram.com/${snap.instagram_actor_name}/`;
  }

  // 7. Nếu là Ảnh (Images) và chưa có postUrl: trích xuất Media ID từ ảnh
  if (!fbPostUrl && !videoId && Array.isArray(snap.images) && snap.images.length > 0) {
    for (const img of snap.images) {
      const candUrls = [img.original_image_url, img.resized_image_url].filter(Boolean);
      for (const cu of candUrls) {
        const foundId = extractFbMediaIdFromUrl(cu);
        if (foundId) {
          if (targetPageId) {
            storyUrl = `https://www.facebook.com/story.php?story_fbid=${foundId}&id=${targetPageId}`;
            fbPostUrl = storyUrl;
          } else {
            fbPostUrl = `https://www.facebook.com/photo/?fbid=${foundId}`;
          }
          break;
        }
      }
      if (fbPostUrl) break;
    }
  }

  // 8. Thử trích xuất từ DOM nếu đang ở trang Ad Library có card render
  if (!fbPostUrl && typeof document !== 'undefined' && adArchiveId) {
    try {
      const cardEl = findCardElementByAdId(adArchiveId);
      if (cardEl) {
        const domPost = extractPostUrlFromCardDom(cardEl, targetPageId);
        if (domPost) {
          fbPostUrl = domPost;
          if (domPost.includes('/reel/')) reelUrl = domPost;
          if (domPost.includes('story_fbid')) storyUrl = domPost;
        }
      }
    } catch (e) {
      console.debug('[resolveCreativePostUrl] Card DOM fallback notice:', e.message);
    }
  }

  return {
    fbPostUrl: fbPostUrl || fallbackAdLibrary,
    reelUrl: reelUrl || null,
    storyUrl: storyUrl || null,
    igUrl: igUrl || null,
    adLibraryUrl: fallbackAdLibrary,
    videoId: videoId
  };
}

/**
 * Tìm DOM element của thẻ quảng cáo theo adArchiveId
 */
function findCardElementByAdId(adId) {
  if (!document.body) return null;
  const cards = Array.from(document.querySelectorAll('div[role="dialog"], div[class*="x1plvlek"], div[class*="x1cy8zhl"], div[role="region"], div[data-testid*="ad"]'));
  return cards.find(c => (c.innerText || '').includes(String(adId))) || null;
}

/**
 * Trích xuất link post/reel/video từ DOM của 1 card
 */
function extractPostUrlFromCardDom(cardEl, pageId) {
  if (!cardEl) return null;
  const link = cardEl.querySelector('a[href*="/reel/"], a[href*="story.php"], a[href*="/posts/"], a[href*="/videos/"], a[href*="instagram.com/p/"], a[href*="instagram.com/reel/"]');
  if (link && link.href) return link.href;

  const video = cardEl.querySelector('video');
  if (video) {
    const src = video.currentSrc || video.src || '';
    const poster = video.getAttribute('poster') || video.poster || '';
    const vid = extractFbMediaIdFromUrl(src) || extractFbMediaIdFromUrl(poster);
    if (vid) {
      return pageId ? `https://www.facebook.com/story.php?story_fbid=${vid}&id=${pageId}` : `https://www.facebook.com/reel/${vid}`;
    }
  }

  const img = cardEl.querySelector('img[src*="fbcdn.net"], img[src*="scontent"]');
  if (img) {
    const isrc = img.currentSrc || img.src || '';
    const iid = extractFbMediaIdFromUrl(isrc);
    if (iid) {
      return pageId ? `https://www.facebook.com/story.php?story_fbid=${iid}&id=${pageId}` : `https://www.facebook.com/photo/?fbid=${iid}`;
    }
  }

  return null;
}

/**
 * Lấy canonical Story / Post URL (chính xác 100%) từ Facebook Reel/Video
 * Áp dụng giải thuật bóc tách HTML nội bộ với credentials: "include":
 * 1. Decode base64 storyID (format: S:_I<pageId>:<postId>)
 * 2. Match top_level_post_id và content_owner_id_new
 * 3. Trích xuất chỉ số tương tác: reactions, comments, shares, views
 */
async function resolveCanonicalStoryFromReel(videoId, fallbackPageId) {
  if (!videoId) return null;
  let engagement = { reactions: '0', comments: '0', shares: '0', views: '0' };
  let post = null;
  let page = null;
  try {
    const res = await fetch(`https://www.facebook.com/reel/${videoId}`, {
      credentials: 'include',
      headers: { Accept: 'text/html,application/xhtml+xml' }
    });
    if (res.ok) {
      const h = await res.text();

      // 1. Decode storyID base64 (chuẩn bài đăng chính thức của Facebook)
      const storyIdMatches = [...h.matchAll(/"storyID":"([A-Za-z0-9+/=]+)"/g)];
      for (const sm of storyIdMatches) {
        try {
          const decoded = atob(sm[1]);
          if (/^S:_I\d+:/.test(decoded)) {
            const parts = decoded.split(':');
            page = parts[1].slice(2);
            post = parts.slice(2).find(x => /^\d+$/.test(x));
            if (page && post) break;
          }
        } catch (e) {
          console.debug('[resolveCanonicalStoryFromReel] base64 decode notice:', e.message);
        }
      }

      // 2. Parse top_level_post_id & content_owner_id_new
      if (!post || !page) {
        const topMatches = [...h.matchAll(/\\*"top_level_post_id\\*":\\*"(\d+)\\*",\\*"content_owner_id_new\\*":\\*"?(\d+)([^]{0,400})/g)];
        for (const tm of topMatches) {
          const pId = tm[1];
          const cId = tm[2];
          const vIdMatch = tm[3].match(/video_id\\*":\\*"?(\d+)/);
          const vId = vIdMatch ? vIdMatch[1] : null;
          if (!vId || vId === String(videoId) || pId === String(videoId)) {
            post = pId;
            page = cId;
            break;
          }
        }
      }

      // 3. Trích xuất chỉ số tương tác (Likes, Comments, Shares, Views)
      const rxMatch = h.match(/"reaction_count":\s*\{\s*"count":\s*(\d+)/i) || 
                      h.match(/"i18n_reaction_count":\s*"([^"]+)"/i) ||
                      h.match(/(\d+(?:\.\d+)?[KMB]?)\s*(?:lượt thích|reactions|likes)/i);
      if (rxMatch) engagement.reactions = String(rxMatch[1]);

      const cmMatch = h.match(/"total_comment_count":\s*(\d+)/i) ||
                      h.match(/"comment_count":\s*\{\s*"total_count":\s*(\d+)/i) ||
                      h.match(/(\d+(?:\.\d+)?[KMB]?)\s*(?:bình luận|comments)/i);
      if (cmMatch) engagement.comments = String(cmMatch[1]);

      const shMatch = h.match(/"share_count":\s*\{\s*"count":\s*(\d+)/i) ||
                      h.match(/"share_count_reduced":\s*"([^"]+)"/i) ||
                      h.match(/(\d+(?:\.\d+)?[KMB]?)\s*(?:lượt chia sẻ|shares)/i);
      if (shMatch) engagement.shares = String(shMatch[1]);

      const vwMatch = h.match(/"play_count":\s*(\d+)/i) ||
                      h.match(/"video_view_count":\s*(\d+)/i) ||
                      h.match(/(\d+(?:\.\d+)?[KMB]?)\s*(?:lượt xem|views|plays)/i);
      if (vwMatch) engagement.views = String(vwMatch[1]);
    }
  } catch (err) {
    console.debug('[ContentFB] resolveCanonicalStoryFromReel notice:', err.message);
  }

  const finalPost = post || videoId;
  const finalPage = page || fallbackPageId;
  const storyUrl = finalPage ? `https://www.facebook.com/story.php?story_fbid=${finalPost}&id=${finalPage}` : `https://www.facebook.com/reel/${videoId}`;

  return {
    storyUrl,
    post: finalPost,
    page: finalPage,
    engagement
  };
}

async function getAdDetailsViaGraphQL(pageId) {
  const variables = {
    activeStatus: 'active',
    adType: 'ALL',
    bylines: [],
    collationToken: null,
    contentLanguages: [],
    countries: ['ALL'],
    cursor: null,
    excludedIDs: null,
    first: 10,
    isTargetedCountry: false,
    location: null,
    mediaType: 'all',
    multiCountryFilterMode: null,
    pageIDs: [String(pageId)],
    potentialReachInput: null,
    publisherPlatforms: [],
    queryString: '',
    regions: null,
    searchType: 'page',
    sessionID: '0f73ce97-0776-429c-9e41-557b4668922c',
    sortData: { direction: 'DESCENDING', mode: 'SORT_BY_TOTAL_IMPRESSIONS' },
    source: null,
    startDate: { max: null, min: null },
    v: 'e3d3df',
    viewAllPageID: String(pageId)
  };

  const json = await callMetaGraphQL(variables);
  const edges = json.data?.ad_library_main?.search_results_connection?.edges || [];
  for (const edge of edges) {
    for (const item of (edge.node?.collated_results || [])) {
      const snap = item.snapshot || {};
      const rawCta = snap.link_url || snap.caption;
      if (rawCta) {
        const decoded = typeof decodeCtaUrl === 'function' ? decodeCtaUrl(rawCta) : null;
        if (decoded && decoded.websiteUrl) {
          const postInfo = resolveCreativePostUrl(item, snap, pageId);
          return {
            postUrl: postInfo.fbPostUrl,
            fbPostUrl: postInfo.fbPostUrl,
            reelUrl: postInfo.reelUrl,
            storyUrl: postInfo.storyUrl,
            adLibraryUrl: postInfo.adLibraryUrl,
            websiteUrl: decoded.websiteUrl,
            websiteUrlRaw: decoded.websiteUrlRaw || rawCta,
            rootDomain: decoded.rootDomain,
            status: 'OK'
          };
        }
      }
    }
  }
  return { status: 'NO_WEBSITE' };
}

/**
 * Bóc tách toàn bộ Ads Creatives của một Page qua Meta GraphQL API
 * Thu thập: Ad ID, Link đích sản phẩm, Link thư viện, Nút CTA (Mua ngay...), Dạng bài (Video/Image/Carousel), Link Post/Reel Facebook
 */
async function extractAllAdsViaGraphQL(pageId, limit = 50) {
  const variables = {
    activeStatus: 'active',
    adType: 'ALL',
    bylines: [],
    collationToken: null,
    contentLanguages: [],
    countries: ['ALL'],
    cursor: null,
    excludedIDs: null,
    first: Math.min(50, limit),
    isTargetedCountry: false,
    location: null,
    mediaType: 'all',
    multiCountryFilterMode: null,
    pageIDs: [String(pageId)],
    potentialReachInput: null,
    publisherPlatforms: [],
    queryString: '',
    regions: null,
    searchType: 'page',
    sessionID: '0f73ce97-0776-429c-9e41-557b4668922c',
    sortData: { direction: 'DESCENDING', mode: 'SORT_BY_TOTAL_IMPRESSIONS' },
    source: null,
    startDate: { max: null, min: null },
    v: 'e3d3df',
    viewAllPageID: String(pageId)
  };

  const json = await callMetaGraphQL(variables);
  const edges = json.data?.ad_library_main?.search_results_connection?.edges || [];
  const ads = [];
  const seenAdIds = new Set();

  for (const edge of edges) {
    for (const item of (edge.node?.collated_results || [])) {
      const adId = String(item.ad_archive_id || '');
      if (!adId || seenAdIds.has(adId)) continue;
      seenAdIds.add(adId);

      const snap = item.snapshot || {};
      const rawCta = snap.link_url || snap.caption || '';
      let cleanUrl = rawCta;
      if (rawCta && typeof decodeCtaUrl === 'function') {
        const dec = decodeCtaUrl(rawCta);
        if (dec && dec.websiteUrl) cleanUrl = dec.websiteUrl;
      }

      // Xác định dạng bài (Media Format: VIDEO, IMAGE, CAROUSEL, TEXT)
      let mediaFormat = 'IMAGE';
      if (snap.videos && snap.videos.length > 0) {
        mediaFormat = 'VIDEO';
      } else if (snap.cards && snap.cards.length > 0) {
        mediaFormat = 'CAROUSEL';
      } else if (snap.images && snap.images.length > 0) {
        mediaFormat = 'IMAGE';
      } else {
        mediaFormat = 'TEXT';
      }

      // Nút CTA và Loại CTA (Mua ngay - SHOP_NOW, Đăng ký - SIGN_UP...)
      const ctaText = snap.cta_text || 'Mua ngay';
      const ctaType = snap.cta_type || 'SHOP_NOW';

      // Trích xuất link Facebook Post / Reel / Story cho Ad Creative này
      const postInfo = resolveCreativePostUrl(item, snap, pageId);

      ads.push({
        adId: adId,
        fbPostUrl: postInfo.fbPostUrl,
        reelUrl: postInfo.reelUrl,
        storyUrl: postInfo.storyUrl,
        igUrl: postInfo.igUrl,
        adLibraryUrl: postInfo.adLibraryUrl || `https://www.facebook.com/ads/library/?id=${adId}`,
        destinationUrl: cleanUrl,
        rawUrl: rawCta,
        mediaFormat: mediaFormat,
        ctaText: ctaText,
        ctaType: ctaType,
        title: snap.title || '',
        body: snap.body?.text || '',
        caption: snap.caption || '',
        creationTime: snap.creation_time || null,
        videoId: postInfo.videoId,
        engagement: null
      });
    }
  }

  // Cố gắng giải mã canonical story URL & engagement cho bài video nổi bật đầu tiên
  for (let i = 0; i < Math.min(ads.length, 3); i++) {
    const a = ads[i];
    if (a.videoId) {
      try {
        const canRes = await resolveCanonicalStoryFromReel(a.videoId, pageId);
        if (canRes && canRes.storyUrl) {
          a.storyUrl = canRes.storyUrl;
          a.fbPostUrl = canRes.storyUrl;
          a.engagement = canRes.engagement;
        }
      } catch (e) {
        console.debug('[extractAllAdsViaGraphQL] Resolve reel notice:', e.message);
      }
    }
  }

  return { ads };
}

async function readPageAdCountViaGraphQL(pageId, status = 'active') {
  const normStatus = (status || 'active').toLowerCase();
  const variables = {
    activeStatus: normStatus,
    adType: 'ALL',
    bylines: [],
    collationToken: null,
    contentLanguages: [],
    countries: ['US'],
    cursor: null,
    excludedIDs: null,
    first: 30,
    isTargetedCountry: false,
    location: null,
    mediaType: 'all',
    multiCountryFilterMode: null,
    pageIDs: [String(pageId)],
    potentialReachInput: null,
    publisherPlatforms: [],
    queryString: '',
    regions: null,
    searchType: 'page',
    sessionID: '0f73ce97-0776-429c-9e41-557b4668922c',
    sortData: { direction: 'DESCENDING', mode: 'SORT_BY_TOTAL_IMPRESSIONS' },
    source: null,
    startDate: { max: null, min: null },
    v: 'e3d3df',
    viewAllPageID: String(pageId)
  };

  const json = await callMetaGraphQL(variables);
  const conn = json.data?.ad_library_main?.search_results_connection || json.data?.viewer?.ad_library_main?.search_results_connection;
  const count = (conn?.count !== undefined && conn?.count !== null) ? conn.count : (conn?.edges?.length !== undefined ? conn.edges.length : null);

  if (count === null) {
    return { count: null, status: 'UNKNOWN' };
  }

  const hasNext = conn?.page_info?.has_next_page;
  return {
    count,
    rawText: `${count}${hasNext ? '+' : ''} ads (GraphQL)`,
    status: count === 0 ? 'ZERO' : 'OK'
  };
}

// ══════════════════════════════════════════════════════════════════════
//  MESSAGE DISPATCHER
// ══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  // Trả lời CHECK_READY đồng bộ ngay lập tức để ping kiểm tra nạp script
  if (type === 'CHECK_READY') {
    sendResponse({ ok: true, version: '2.1' });
    return true;
  }

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
          const pageId = payload?.pageId;
          // Ưu tiên 1: Lấy siêu tốc qua Meta GraphQL nếu có pageId
          if (pageId) {
            try {
              const gqlDetails = await getAdDetailsViaGraphQL(pageId);
              if (gqlDetails && gqlDetails.websiteUrl) {
                sendResponse({ ok: true, ...gqlDetails, source: 'GRAPHQL_API' });
                return;
              }
            } catch (gqlErr) {
              console.debug('[ContentFB] getAdDetails GraphQL fallback:', gqlErr.message);
            }
          }

          // Ưu tiên 2: Bóc tách DOM thẻ quảng cáo
          const adDetails = await extractFirstAdDetails();
          sendResponse({ ok: true, ...adDetails });
          break;
        }

        // Lấy toàn bộ link ads, nút CTA và dạng bài (Video/Image) của Page
        case 'GET_ALL_PAGE_ADS': {
          const pageId = payload?.pageId;
          const limit = payload?.limit || 30;
          if (!pageId) {
            sendResponse({ ok: false, error: 'Thiếu pageId' });
            return;
          }
          try {
            const adsResult = await extractAllAdsViaGraphQL(pageId, limit);
            sendResponse({ ok: true, ads: adsResult.ads || [] });
          } catch (adsErr) {
            console.debug('[ContentFB] extractAllAds error:', adsErr.message);
            sendResponse({ ok: false, error: adsErr.message, ads: [] });
          }
          break;
        }

        // Kiểm tra chặn đơn thuần
        case 'CHECK_BLOCKED': {
          sendResponse({ ok: true, ...blockCheck });
          break;
        }

        // Bóc tách canonical Story URL và chỉ số tương tác (Likes, Comments, Shares, Views)
        case 'RESOLVE_POST_ENGAGEMENT': {
          const videoId = payload?.videoId;
          const fallbackPageId = payload?.pageId;
          if (!videoId) {
            sendResponse({ ok: false, error: 'Thiếu videoId' });
            return;
          }
          try {
            const result = await resolveCanonicalStoryFromReel(videoId, fallbackPageId);
            sendResponse({ ok: true, data: result });
          } catch (resErr) {
            console.debug('[ContentFB] RESOLVE_POST_ENGAGEMENT error:', resErr.message);
            sendResponse({ ok: false, error: resErr.message });
          }
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
