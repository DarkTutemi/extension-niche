/**
 * fb_api_crawler.js – Bộ Crawler siêu tốc sử dụng trực tiếp Meta GraphQL API
 * =========================================================================
 * Bỏ qua hoàn toàn việc cuộn DOM, không mở tab con, không sợ vỡ selector.
 * Tự động trích xuất Ads, Page, Link Website Shopify, tỷ lệ Active/Inactive,
 * và đếm số sản phẩm qua /products.json.
 */

const fs = require('fs');

// Cấu hình phiên làm việc lấy từ cURL của ông chủ
const DEFAULT_AUTH = {
  userId: '100003812630357',
  fb_dtsg: 'NAfySsw9Jw5zJlAjLGGp-YYuwjMcxSFHirq3ede7IxWAvJ0PW7UBycw:10:1793007936',
  lsd: 'FG8fc5u7N54QUhSLUuecSr',
  cookie: 'rd_challenge=Q_6hBQRbtT2RLAD2YbsCw-2XVEgmZ6uTqnWTi-qx6Q3pOIgS9GJbyPqZ0-AFWJiGMmm38w90VYYFATgvZfkUcAzm7ydY5MtsIRwMj_-o93tuHY6zUMqy; datr=0ynfarz4JlzQD8cRORH1bw1T; sb=6SnfaiWHyCbUwXu10I-X98E5; ps_l=1; ps_n=1; locale=vi_VN; c_user=100003812630357; alsfid={"id":"fa446e935","timestamp":1793010378681.4}; presence=C%7B%22t3%22%3A%5B%7B%22o%22%3A0%2C%22i%22%3A%22sc.1349537636762550%22%7D%5D%2C%22utc3%22%3A1793020505613%2C%22v%22%3A1%7D; fr=1TxILagNCAb7oUfZO.AWccxCBbk_yLXWZJ3gSw5aTX4tjhPg4r_ib8E-gDnUy289H2j9U.Bq31kF..AAA.0.0.Bq31kF.AWcvlBXJQcnJWhDZ1yllcUVkRGo; xs=10%3A_A_2-KRIuFkqHg%3A2%3A1793007936%3A-1%3A-1%3A%3AAczeGa89Q751ommHLjblwrEsF_c__uFjvattqzk1OQ; wd=1191x889',
};

const DOC_ID_PAGINATION = '24922295957467452';

/**
 * Gửi request đến Facebook GraphQL endpoint
 */
async function callFbGraphQL(variables, auth = DEFAULT_AUTH) {
  const url = 'https://www.facebook.com/api/graphql/';
  const headers = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/x-www-form-urlencoded',
    'cookie': auth.cookie,
    'origin': 'https://www.facebook.com',
    'referer': 'https://www.facebook.com/ads/library/',
    'sec-ch-ua': '"Not:A-Brand";v="8", "Chromium";v="156", "Google Chrome";v="156"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    'x-asbd-id': '359341',
    'x-fb-friendly-name': 'AdLibrarySearchPaginationQuery',
    'x-fb-lsd': auth.lsd,
  };

  const bodyParams = new URLSearchParams({
    av: auth.userId,
    __user: auth.userId,
    __a: '1',
    __comet_req: '94',
    fb_dtsg: auth.fb_dtsg,
    jazoest: '25652',
    lsd: auth.lsd,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'AdLibrarySearchPaginationQuery',
    server_timestamps: 'true',
    variables: JSON.stringify(variables),
    doc_id: DOC_ID_PAGINATION
  });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: bodyParams.toString()
  });

  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}: ${res.statusText}`);
  }

  const raw = await res.text();
  const clean = raw.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');
  return JSON.parse(clean);
}

/**
 * 1. Tìm kiếm quảng cáo theo từ khóa qua GraphQL API với đầy đủ bộ lọc chuyên sâu
 */
async function searchAdsByKeyword(keyword, options = {}) {
  const {
    country = 'US',
    first = 30,
    cursor = null,
    searchType = 'KEYWORD_UNORDERED', // hoặc 'KEYWORD_EXACT_PHRASE'
    activeStatus = 'ACTIVE',
    mediaType = 'ALL',                // 'ALL', 'VIDEO', 'IMAGE', 'MEME'
    publisherPlatform = 'ALL',        // 'ALL', 'FACEBOOK', 'INSTAGRAM'
    sortMode = 'SORT_BY_TOTAL_IMPRESSIONS', // 'SORT_BY_START_DATE', etc.
    startDateMin = null,              // '2026-07-15'
    auth = DEFAULT_AUTH
  } = options;

  const isExact = (searchType === 'KEYWORD_EXACT_PHRASE');
  const queryStr = isExact ? `"${keyword}"` : keyword;
  const targetCountry = country === 'ALL' ? 'US' : country;

  const variables = {
    activeStatus,
    adType: 'ALL',
    bylines: [],
    collationToken: 'faa17582-e352-4445-ace8-508282f9e61a',
    contentLanguages: [],
    countries: country === 'ALL' ? [] : [country],
    country: targetCountry,
    cursor,
    excludedIDs: [],
    first,
    isTargetedCountry: false,
    location: null,
    mediaType,
    multiCountryFilterMode: null,
    pageIDs: [],
    potentialReachInput: [],
    publisherPlatforms: publisherPlatform && publisherPlatform !== 'ALL' ? [publisherPlatform] : [],
    queryString: queryStr,
    regions: [],
    searchType,
    sessionID: '0f73ce97-0776-429c-9e41-557b4668922c',
    sortData: { direction: 'DESCENDING', mode: sortMode },
    source: null,
    startDate: startDateMin ? { min: startDateMin, max: null } : null,
    v: '0c407c',
    viewAllPageID: '0'
  };

  const json = await callFbGraphQL(variables, auth);
  const searchConn = json.data?.ad_library_main?.search_results_connection;
  const edges = searchConn?.edges || [];
  const pageInfo = searchConn?.page_info || {};

  const ads = [];
  for (const edge of edges) {
    const collated = edge.node?.collated_results || [];
    for (const item of collated) {
      const snap = item.snapshot || {};
      ads.push({
        adArchiveId: item.ad_archive_id,
        collationCount: item.collation_count,
        isActive: item.is_active,
        pageId: item.page_id,
        pageName: snap.page_name || item.page_name,
        pageProfileUri: snap.page_profile_uri,
        caption: snap.caption,
        linkUrl: snap.link_url,
        ctaType: snap.cta_type,
        ctaText: snap.cta_text,
        bodyText: snap.body?.text,
        title: snap.title,
        startDate: item.start_date,
        currency: item.currency,
        spend: item.spend,
      });
    }
  }

  return {
    ads,
    hasNextPage: !!pageInfo.has_next_page,
    endCursor: pageInfo.end_cursor
  };
}

/**
 * 2. Đọc chính xác số quảng cáo Active & Inactive của một Page ID qua API
 */
async function getPageAdCounts(pageId, auth = DEFAULT_AUTH) {
  async function queryStatusCount(status) {
    const variables = {
      activeStatus: status,
      adType: 'ALL',
      bylines: [],
      collationToken: '937e0430-4096-4448-8304-a8e6a1c28539',
      contentLanguages: [],
      countries: [],
      cursor: null,
      excludedIDs: [],
      first: 30,
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
      v: '47429f',
      viewAllPageID: String(pageId)
    };

    const res = await callFbGraphQL(variables, auth);
    const edges = res.data?.ad_library_main?.search_results_connection?.edges || [];
    return edges.length;
  }

  const [activeCount, inactiveCount] = await Promise.all([
    queryStatusCount('ACTIVE').catch(() => 0),
    queryStatusCount('INACTIVE').catch(() => 0)
  ]);

  const total = activeCount + inactiveCount;
  const ratio = total > 0 ? (activeCount / total) : 0;

  return {
    activeCount,
    inactiveCount,
    total,
    ratio: Math.round(ratio * 100) / 100,
    ratioFormatted: (ratio * 100).toFixed(1) + '%'
  };
}

/**
 * 3. Đếm sản phẩm trên website (Shopify /products.json & sitemap)
 */
async function countProducts(websiteUrl) {
  if (!websiteUrl) return { count: null, platform: 'NONE', source: null };
  let origin;
  try {
    origin = new URL(websiteUrl).origin;
  } catch(e) {
    return { count: null, platform: 'INVALID', source: null };
  }

  // Thử Shopify /products.json
  try {
    const res = await fetch(`${origin}/products.json?limit=250`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.products)) {
        return { count: data.products.length, platform: 'Shopify', source: 'products_json' };
      }
    }
  } catch (e) {}

  // Thử /sitemap_products_1.xml
  try {
    const res = await fetch(`${origin}/sitemap_products_1.xml`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const xml = await res.text();
      const count = (xml.match(/<url>/g) || []).length;
      if (count > 0) {
        return { count, platform: 'Shopify/eCom', source: 'sitemap_xml' };
      }
    }
  } catch (e) {}

  return { count: null, platform: 'UNKNOWN', source: null };
}

/**
 * 4. TOÀN BỘ CHU TRÌNH NGHIÊN CỨU SẢN PHẨM QUA API (Full Pipeline)
 */
async function crawlKeywordFullPipeline(keyword, options = {}) {
  const {
    country = 'US',
    maxAds = 30,
    activeThreshold = 0.7,
    minProducts = 15,
    mediaType = 'ALL',
    publisherPlatform = 'ALL',
    searchType = 'KEYWORD_UNORDERED',
    sortMode = 'SORT_BY_TOTAL_IMPRESSIONS',
    startDateMin = null,
    auth = DEFAULT_AUTH
  } = options;

  console.log(`\n======================================================`);
  console.log(`🚀 BẮT ĐẦU CRAWL GRAPHQL API: "${keyword}" (Country: ${country})`);
  console.log(`🎯 Bộ lọc: Media=${mediaType}, Platform=${publisherPlatform}, SearchType=${searchType}, Sort=${sortMode}, StartDateMin=${startDateMin || 'Tất cả'}`);
  console.log(`======================================================`);

  // Bước 1: Gọi GraphQL Search API
  console.log(`📡 [1/4] Đang truy vấn AdLibrarySearchPaginationQuery...`);
  const searchResult = await searchAdsByKeyword(keyword, {
    country,
    first: maxAds,
    mediaType,
    publisherPlatform,
    searchType,
    sortMode,
    startDateMin,
    auth
  });
  console.log(`✅ Thu thập được ${searchResult.ads.length} mẫu quảng cáo trực tiếp từ API.`);

  // Bước 2: Gom nhóm theo Page
  const pageMap = new Map();
  for (const ad of searchResult.ads) {
    if (!ad.pageId) continue;
    if (!pageMap.has(ad.pageId)) {
      pageMap.set(ad.pageId, {
        pageId: ad.pageId,
        pageName: ad.pageName,
        pageProfileUri: ad.pageProfileUri,
        sampleAdArchiveId: ad.adArchiveId,
        websiteUrl: ad.linkUrl || ad.caption,
        adsCountInSearch: 0
      });
    }
    const p = pageMap.get(ad.pageId);
    p.adsCountInSearch++;
    if (!p.websiteUrl && (ad.linkUrl || ad.caption)) {
      p.websiteUrl = ad.linkUrl || ad.caption;
    }
  }

  const uniquePages = Array.from(pageMap.values());
  console.log(`📑 [2/4] Bóc tách được ${uniquePages.length} Fanpage duy nhất.`);

  // Bước 3: Kiểm tra tỷ lệ Active/Inactive cho từng Page & đếm SP
  console.log(`📊 [3/4] Đang kiểm tra tỷ lệ Active Ads & đếm sản phẩm Website...`);
  const results = [];

  for (let i = 0; i < uniquePages.length; i++) {
    const page = uniquePages[i];
    process.stdout.write(`  [${i + 1}/${uniquePages.length}] ${page.pageName} (${page.pageId})... `);

    // Đọc Active/Inactive
    const counts = await getPageAdCounts(page.pageId, auth);
    
    // Đếm sản phẩm nếu có link website
    let prod = { count: null, platform: 'NONE' };
    if (page.websiteUrl) {
      prod = await countProducts(page.websiteUrl);
    }

    // Đánh giá các cổng kiểm duyệt (Gates)
    const passActiveRatio = counts.ratio >= activeThreshold;
    const passProductCount = (prod.count !== null && prod.count >= minProducts);
    const isPassAll = passActiveRatio && passProductCount;

    const row = {
      keyword,
      pageId: page.pageId,
      pageName: page.pageName,
      postLink: `https://www.facebook.com/ads/library/?id=${page.sampleAdArchiveId}`,
      websiteUrl: page.websiteUrl || 'Không có',
      activeAds: counts.activeCount,
      inactiveAds: counts.inactiveCount,
      activeRatio: counts.ratioFormatted,
      productCount: prod.count !== null ? prod.count : 'N/A',
      platform: prod.platform,
      status: isPassAll ? 'PASS' : (passActiveRatio ? 'FAIL_PRODUCTS' : 'FAIL_RATIO')
    };

    results.push(row);
    console.log(`${row.status} (Active: ${counts.activeCount}/${counts.total} = ${counts.ratioFormatted}, SP: ${row.productCount})`);
  }

  // Bước 4: Tổng kết & Xuất kết quả
  const passed = results.filter(r => r.status === 'PASS');
  console.log(`\n======================================================`);
  console.log(`🎉 HOÀN TẤT CRAWL CHO TỪ KHÓA: "${keyword}"`);
  console.log(`Tổng số Page quét: ${results.length}`);
  console.log(`Số Page ĐẠT TIÊU CHUẨN (PASS): ${passed.length}`);
  console.log(`======================================================\n`);

  return { keyword, totalPages: results.length, passedCount: passed.length, results };
}

// Chạy trực tiếp nếu gọi từ command line
if (require.main === module) {
  const keyword = process.argv[2] || 'pet hair remover';
  crawlKeywordFullPipeline(keyword, { country: 'US', maxAds: 20 })
    .then(out => {
      fs.writeFileSync('f:/Clone-shopify/crawl_result_sample.json', JSON.stringify(out, null, 2));
      console.log('Đã lưu kết quả chi tiết vào: f:/Clone-shopify/crawl_result_sample.json');
    })
    .catch(err => console.error('Lỗi crawl:', err));
}

module.exports = {
  searchAdsByKeyword,
  getPageAdCounts,
  countProducts,
  crawlKeywordFullPipeline
};
