const fs = require('fs');

const summary = JSON.parse(fs.readFileSync('f:/Clone-shopify/car_campaign_summary.json', 'utf8'));
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

// Map each winner to its raw page ads and details
const rawPageMap = new Map();
for (const kw of rawKeywords) {
  for (const p of kw.pages || []) {
    const key = `${p.pageId}_${kw.keyword.toLowerCase().trim()}`;
    rawPageMap.set(key, { ...p, keyword: kw.keyword });
  }
}

async function updateAllWinners() {
  console.log(`Bắt đầu cập nhật lại ${summary.winners.length} WINNER STORES với activeCount & inactiveCount...`);

  let updatedCount = 0;
  for (let i = 0; i < summary.winners.length; i++) {
    const w = summary.winners[i];
    const key = `${w.pageId}_${w.keyword.toLowerCase().trim()}`;
    const rawPage = rawPageMap.get(key);

    const creatives = ((rawPage && rawPage.ads) || []).map(ad => ({
      adId: ad.adArchiveId,
      mediaFormat: ad.mediaFormat || 'VIDEO',
      ctaText: ad.ctaText || 'Mua ngay',
      ctaType: ad.ctaType || 'SHOP_NOW',
      linkUrl: cleanUrl(ad.linkUrl),
      title: ad.title || '',
      body: (ad.body || '').slice(0, 300)
    }));

    const payload = {
      secretKey: SECRET_KEY,
      data: {
        niche: 'Car',
        keyword: w.keyword,
        pageId: String(w.pageId),
        pageName: w.pageName,
        postUrl: `https://www.facebook.com/ads/library/?id=${(rawPage && rawPage.adArchiveId) || w.pageId}`,
        websiteUrl: w.websiteUrl,
        // Cung cấp đầy đủ cả 2 cặp tên trường để tương thích 100%
        activeCount: Number(w.activeAds),
        inactiveCount: Number(w.inactiveAds),
        activeAds: Number(w.activeAds),
        inactiveAds: Number(w.inactiveAds),
        activeRatio: Number(w.activeRatio) / 100,
        productCount: Number(w.productCount),
        productSource: w.productSource,
        checkedAt: new Date().toLocaleString('vi-VN'),
        status: 'PASS',
        ads: creatives
      }
    };

    try {
      const res = await fetch(SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json && json.ok) {
        console.log(`[${i + 1}/${summary.winners.length}] ✅ Cập nhật thành công: ${w.pageName} (Hàng ${json.row}) -> Active: ${w.activeAds}, Inactive: ${w.inactiveAds}`);
        updatedCount++;
      } else {
        console.log(`[${i + 1}/${summary.winners.length}] ❌ Lỗi cập nhật: ${w.pageName} -`, json?.error);
      }
    } catch(err) {
      console.log(`[${i + 1}/${summary.winners.length}] 💥 Lỗi mạng: ${w.pageName} -`, err.message);
    }
  }

  console.log(`\n🎉 Hoàn tất cập nhật: ${updatedCount}/${summary.winners.length} stores đã được điền đủ Active Ads và Inactive Ads trên Google Sheet!`);
}

updateAllWinners().catch(console.error);
