/**
 * content_web.js – Content script dự phòng trên website đích
 * ==========================================================
 * Được inject vào website đích khi background fetch bị chặn bởi CORS/WAF
 * hoặc khi cần đọc DOM trực tiếp (ví dụ: client-side SPA rendering).
 * Trích xuất:
 *   1. Link sản phẩm dạng /products/ hoặc /product/
 *   2. Thẻ schema JSON-LD: {"@type": "Product"}
 *   3. Số lượng sản phẩm trên các trang collection / shop
 */

(() => {
  // Tránh inject trùng lặp
  if (window.__FB_ADS_RESEARCH_WEB_LOADED__) return;
  window.__FB_ADS_RESEARCH_WEB_LOADED__ = true;

  /**
   * Đếm số sản phẩm duy nhất đang hiển thị trên trang hiện tại
   */
  function countVisibleProducts() {
    const productLinks = new Set();

    // 1. Quét các thẻ <a> trỏ đến trang chi tiết sản phẩm
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const href = a.href || '';
      try {
        const u = new URL(href, window.location.origin);
        // Chỉ nhận cùng origin và có pattern sản phẩm
        if (u.origin === window.location.origin) {
          if (/\/products\/[^\/\?\#]+/i.test(u.pathname) || /\/product\/[^\/\?\#]+/i.test(u.pathname)) {
            // Chuẩn hóa bỏ query và hash
            productLinks.add(u.origin + u.pathname);
          }
        }
      } catch(err) {
        console.debug('[ContentWeb] Anchor parse skipped:', err.message);
      }
    }

    // 2. Quét thẻ Schema.org JSON-LD
    let jsonLdCount = 0;
    const jsonLdScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item['@type'] === 'Product') jsonLdCount++;
          }
        } else if (data['@type'] === 'Product') {
          jsonLdCount++;
        } else if (data['@graph'] && Array.isArray(data['@graph'])) {
          for (const item of data['@graph']) {
            if (item['@type'] === 'Product') jsonLdCount++;
          }
        }
      } catch(err) {
        console.debug('[ContentWeb] JSON-LD parse skipped:', err.message);
      }
    }

    const finalCount = Math.max(productLinks.size, jsonLdCount);

    return {
      count: finalCount,
      uniqueUrls: Array.from(productLinks),
      jsonLdCount,
      url: window.location.href,
      title: document.title
    };
  }

  // Lắng nghe lệnh từ background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'COUNT_PAGE_PRODUCTS') {
      const result = countVisibleProducts();
      sendResponse({ ok: true, ...result });
    }
    return true;
  });
})();
