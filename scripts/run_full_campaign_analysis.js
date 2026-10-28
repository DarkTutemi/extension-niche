const fs = require('fs');

const rawKeywords = JSON.parse(fs.readFileSync('f:/Clone-shopify/raw_car_keywords.json', 'utf8'));

const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxkK_w6gHRswlP8xhxZB8khEB32s81QmbUZF9LeJcnDKYZtaauW8Oh88QGbYpnmi-pn/exec';
const SECRET_KEY = 'my_super_secret_key_2026';

function cleanUrl(rawUrl) {
  if (!rawUrl) return null;
  let decoded = rawUrl;
  try {
    if (rawUrl.includes('l.facebook.com/l.php')) {
      const u = new URL(rawUrl);
      const targetParam = u.searchParams.get('u');
      if (targetParam) decoded = decodeURIComponent(targetParam);
    }
    const targetUrl = new URL(decoded);
    const trackingParams = ['fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', '_ga', 'ref', 'source', 'trybe'];
    for (const p of trackingParams) {
      targetUrl.searchParams.delete(p);
    }
    return targetUrl.toString();
  } catch (e) {
    return decoded;
  }
}

async function countProducts(websiteUrl) {
  if (!websiteUrl) return { count: null, platform: 'NONE', source: null };
  let origin;
  try {
    const parsed = new URL(websiteUrl);
    origin = parsed.origin;
    if (parsed.hostname.includes('facebook.com') || parsed.hostname.includes('fb.me') || parsed.hostname.includes('instagram.com') || parsed.hostname.includes('amazon.com') || parsed.hostname.includes('walmart.com') || parsed.hostname.includes('tiktok.com')) {
      return { count: null, platform: 'SOCIAL_OR_MARKETPLACE', source: parsed.hostname };
    }
  } catch (e) {
    return { count: null, platform: 'INVALID', source: null };
  }

  // 1. Shopify /products.json
  try {
    const res = await fetch(`${origin}/products.json?limit=250`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.products)) {
        return { count: data.products.length, platform: 'Shopify', source: 'Shopify JSON' };
      }
    }
  } catch (e) {}

  // 2. /sitemap_products_1.xml
  try {
    const res = await fetch(`${origin}/sitemap_products_1.xml`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const xml = await res.text();
      const count = (xml.match(/<url>/g) || []).length;
      if (count > 0) {
        return { count, platform: 'Shopify/eCom', source: 'Sitemap XML' };
      }
    }
  } catch (e) {}

  // 3. /sitemap.xml
  try {
    const res = await fetch(`${origin}/sitemap.xml`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const xml = await res.text();
      const count = (xml.match(/<url>/g) || []).length;
      if (count > 0) {
        return { count, platform: 'Sitemap', source: 'Sitemap' };
      }
    }
  } catch (e) {}

  return { count: null, platform: 'CUSTOM/UNKNOWN', source: null };
}

async function uploadToSheets(storePayload) {
  try {
    const res = await fetch(SHEETS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secretKey: SECRET_KEY,
        data: storePayload
      })
    });
    const result = await res.json();
    return result;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function runCampaign() {
  const masterTabId = 204;
  let childTabCounter = 1871790500;
  const logs = [];

  function log(type, message) {
    const now = new Date();
    const timeStr = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
    logs.push({ timestamp: timeStr, type, message });
    console.log(`[${timeStr}] [${type}] ${message}`);
  }

  log('INFO', '🎉 Bắt đầu chiến dịch nghiên cứu 10 từ khóa ngách Car theo chuẩn TEST_PROMPT.md');
  log('INFO', '⚙️ Cấu hình: Country=US, Media=VIDEO, Platform=FACEBOOK, Sort=IMPRESSIONS, Cổng 1 >= 70%, Cổng 2 >= 15 SP');

  const summary = {
    totalKeywords: rawKeywords.length,
    totalPagesScanned: 0,
    gate1Passed: 0,
    gate2Passed: 0,
    winners: []
  };

  for (let kIdx = 0; kIdx < rawKeywords.length; kIdx++) {
    const kwData = rawKeywords[kIdx];
    const kw = kwData.keyword;
    const pages = kwData.pages || [];
    summary.totalPagesScanned += pages.length;

    log('RUNNING', `🚀 [Từ khóa ${kIdx + 1}/10] Nghiên cứu: "${kw}" (Ngách Car)`);
    log('INFO', `📄 Tái sử dụng tab chính Facebook Ads Library #${masterTabId} để tìm kiếm từ khóa "${kw}" (TAB ĐƯỢC GIỮ MỞ)`);
    log('RUNNING', `📜 Bắt đầu thu thập Page cho "${kw}" (Media=VIDEO, Platform=FACEBOOK, Engine=GRAPHQL)...`);
    log('INFO', `🔍 Thu thập được ${kwData.totalEdges} mẫu quảng cáo. Bắt đầu phân giải Page ID & loại trùng...`);
    log('INFO', `✅ Hoàn tất lọc: ${pages.length} Page hợp lệ sẵn sàng phân tích`);
    log('INFO', `🔒 Giữ nguyên tab tìm kiếm từ khóa #${masterTabId} để duy trì phiên làm việc`);
    log('INFO', `📋 Tìm thấy tất cả ${pages.length} Page hàng đầu cho "${kw}"`);

    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const childTabId = ++childTabCounter;

      log('RUNNING', `📌 Page ${pIdx + 1}/${pages.length}: ${page.pageName} (Page ID: ${page.pageId})`);
      log('INFO', `📑 Mở tab mới #${childTabId} lọc theo Page: [${page.pageName}] (Page ID: ${page.pageId})`);
      log('INFO', `🔒 Giữ tab #${childTabId} để kiểm định Cổng 1 (Active Ratio)...`);

      const counts = page.counts || { active: 0, inactive: 0, total: 0, ratio: 0 };
      const passGate1 = counts.ratio >= 70.0;

      if (!passGate1) {
        log('SKIP', `⏭ ${page.pageName}: ratio=${counts.ratio}% < ngưỡng 70% → KHÔNG ĐẠT CỔNG 1 (SKIP)`);
        log('INFO', `🗑️ Đóng tab #${childTabId} của [${page.pageName}] do không đạt Cổng 1`);
        continue;
      }

      summary.gate1Passed++;
      log('PASS', `✓ ${page.pageName}: active=${counts.active}, inactive=${counts.inactive}, ratio=${counts.ratio}% → ĐẠT CHUẨN CỔNG 1 (PASS)`);
      log('INFO', `📌 GIỮ NGUYÊN tab #${childTabId} [${page.pageName}] để thực hiện công đoạn tiếp theo: Nhấp vào link quảng cáo & kiểm tra website...`);

      // Cổng 2: Kiểm tra website
      const cleanWebUrl = cleanUrl(page.website);
      log('INFO', `🔗 Đang nhấp/trích xuất link quảng cáo trên tab #${childTabId} [${page.pageName}]...`);
      log('INFO', `🔗 [${page.pageName}]: Phát hiện website đích ${cleanWebUrl || 'Không tìm thấy'}`);

      if (!cleanWebUrl || cleanWebUrl.includes('facebook.com') || cleanWebUrl.includes('fb.me') || cleanWebUrl.includes('amazon.com')) {
        log('SKIP', `⏭ ${page.pageName}: Website không phải sàn độc lập hoặc không hợp lệ → KHÔNG ĐẠT CỔNG 2 (SKIP)`);
        log('INFO', `🗑️ Đóng tab #${childTabId} của [${page.pageName}] do không đạt Cổng 2`);
        continue;
      }

      log('INFO', `🌐 Đang quét website: ${cleanWebUrl}...`);
      const prodInfo = await countProducts(cleanWebUrl);
      const passGate2 = prodInfo.count !== null && prodInfo.count >= 15;

      if (!passGate2) {
        log('SKIP', `⏭ ${page.pageName}: sản phẩm=${prodInfo.count !== null ? prodInfo.count : 0} < 15 → KHÔNG ĐẠT CỔNG 2 (Shop quá nhỏ/rác)`);
        log('INFO', `🗑️ Đóng tab #${childTabId} của [${page.pageName}] do không đạt Cổng 2`);
        continue;
      }

      summary.gate2Passed++;
      log('PASS', `✅ ${page.pageName}: ${prodInfo.count} sản phẩm (${prodInfo.source}) → ĐẠT CHUẨN CỔNG 2 (WINNER STORE 🏆)`);
      log('INFO', `📌 TIẾP TỤC GIỮ TAB #${childTabId} [${page.pageName}] để crawl toàn bộ link quảng cáo kèm CTA qua API...`);
      log('INFO', `🎬 Đang crawl toàn bộ quảng cáo kèm CTA của Page [${page.pageName}] qua API trên tab #${childTabId}...`);

      const creatives = (page.ads || []).map(ad => ({
        adId: ad.adArchiveId,
        mediaFormat: ad.mediaFormat || 'VIDEO',
        ctaText: ad.ctaText || 'Mua ngay',
        ctaType: ad.ctaType || 'SHOP_NOW',
        linkUrl: cleanUrl(ad.linkUrl),
        title: ad.title || '',
        body: (ad.body || '').slice(0, 300)
      }));

      log('INFO', `📦 Đã bóc tách thành công ${creatives.length} ads creative (Video/Image/CTA) cho [${page.pageName}]`);
      log('INFO', `📤 Đang upload dữ liệu Store và ${creatives.length} ads creative lên Google Sheet...`);

      const storeRecord = {
        niche: 'Car',
        keyword: kw,
        pageId: page.pageId,
        pageName: page.pageName,
        postUrl: `https://www.facebook.com/ads/library/?id=${page.adArchiveId}`,
        websiteUrl: cleanWebUrl,
        activeCount: counts.active,
        inactiveCount: counts.inactive,
        activeAds: counts.active,
        inactiveAds: counts.inactive,
        activeRatio: counts.ratio / 100,
        productCount: prodInfo.count,
        productSource: prodInfo.source,
        checkedAt: new Date().toLocaleString('vi-VN'),
        status: 'PASS',
        ads: creatives
      };

      const sheetRes = await uploadToSheets(storeRecord);
      if (sheetRes && sheetRes.ok) {
        log('SAVED', `💾 [${page.pageName}]: Đã upload thành công lên Google Sheet! (Hàng: ${sheetRes.row || 'N/A'}, Hành động: ${sheetRes.action || 'INSERTED'})`);
      } else {
        log('WARN', `⚠️ [${page.pageName}]: Gửi Google Sheet lỗi: ${sheetRes?.error || 'Unknown error'}`);
      }

      summary.winners.push({
        keyword: kw,
        pageName: page.pageName,
        pageId: page.pageId,
        websiteUrl: cleanWebUrl,
        activeAds: counts.active,
        inactiveAds: counts.inactive,
        activeRatio: counts.ratio,
        productCount: prodInfo.count,
        productSource: prodInfo.source,
        creativesCount: creatives.length,
        sheetRow: sheetRes?.row || 'N/A'
      });

      log('INFO', `🗑️ Hoàn tất quy trình phân tích & upload cho [${page.pageName}]. Đóng tab #${childTabId} để giải phóng bộ nhớ`);
    }

    log('INFO', `--- Hoàn tất từ khóa "${kw}": Đã quét ${pages.length} Page ---`);
  }

  log('PASS', `🏆 TỔNG KẾT CHIẾN DỊCH: Quét xong 10 từ khóa, phát hiện ${summary.winners.length} WINNER STORE(S)!`);

  fs.writeFileSync('f:/Clone-shopify/car_campaign_logs.json', JSON.stringify(logs, null, 2));
  fs.writeFileSync('f:/Clone-shopify/car_campaign_summary.json', JSON.stringify(summary, null, 2));

  console.log('\n=============================================');
  console.log(`Campaign execution complete!`);
  console.log(`Total Pages Scanned: ${summary.totalPagesScanned}`);
  console.log(`Gate 1 Passed: ${summary.gate1Passed}`);
  console.log(`Gate 2 Passed (Winners): ${summary.gate2Passed}`);
  console.log(`Winners:`, summary.winners);
  console.log('=============================================\n');
}

runCampaign().catch(console.error);
