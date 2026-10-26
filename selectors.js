/**
 * selectors.js – Cấu hình tập trung toàn bộ selector, regex, pattern DOM
 * =========================================================================
 * MỌI selector truy vấn DOM của Facebook hoặc website đích đều khai báo ở đây.
 * Đã được đồng bộ và kiểm chứng trực tiếp trên DOM thực tế của Facebook Ads Library.
 */

const SELECTORS = {

  // ── Facebook Ads Library – Trang kết quả theo keyword ──────────────

  /** Phần tử hiển thị tổng số kết quả, ví dụ "~86 kết quả", "~31.000 kết quả", "1,234 results" */
  resultCount: {
    // Selector thật: div[role="heading"][aria-level="3"]
    headingSelector: 'div[role="heading"][aria-level="3"]',
    xpathEN: '//div[@role="heading"][@aria-level="3"][contains(text(),"results")]',
    xpathVI: '//div[@role="heading"][@aria-level="3"][contains(text(),"kết quả")]',
    // Regex trích xuất số, hỗ trợ: ~86, 1,234, 1.234, 31.000 results/kết quả
    regex: /[~≈]?\s*([\d.,]+)\s*(?:results|kết quả)/i,
  },

  /** Link đến trang Fanpage trên mỗi thẻ quảng cáo */
  pageLink: {
    selector: 'a[href*="facebook.com/"]:not([href*="ads/library"]):not([href*="l.facebook.com"]):not([href*="sharer"]):not([href*="privacy"]):not([href*="policies"]):not([href*="help"]):not([href="#"])',
    hrefPattern: 'view_all_page_id=',
  },

  /** Thẻ quảng cáo đơn lẻ trong danh sách kết quả */
  adCard: {
    selector: 'div[class*="x1plvlek"]',
  },

  // ── Facebook Ads Library – Trang theo Page ID ──────────────────────

  /** Số kết quả trên trang lọc theo Page (active hoặc inactive) */
  pageResultCount: {
    headingSelector: 'div[role="heading"][aria-level="3"]',
    emptyStateHeadingSelector: 'div[role="heading"][aria-level="2"]',
    xpathEN: '//div[@role="heading"][@aria-level="3"][contains(text(),"results")]',
    xpathVI: '//div[@role="heading"][@aria-level="3"][contains(text(),"kết quả")]',
    regex: /[~≈]?\s*([\d.,]+)\s*(?:results|kết quả)/i,
    zeroPhrases: [
      'không có kết quả',
      'no results',
      '0 kết quả',
      '0 results',
      'không có quảng cáo nào khớp',
      'no ads match',
      'không tìm thấy quảng cáo nào',
      'there are no ads to show',
      'no ads found',
    ],
  },

  // ── Facebook Ads Library – Chi tiết quảng cáo ─────────────────────

  /** Nút "Xem chi tiết quảng cáo" / "See ad details" */
  seeAdDetails: {
    textEN: 'See ad details',
    textVI: 'Xem chi tiết quảng cáo',
    textSummaryVI: 'Xem chi tiết bản tóm tắt',
    textSummaryEN: 'See summary details',
    role: 'button',
  },

  /** Link CTA dẫn ra website đích */
  ctaLink: {
    hrefPattern: 'l.facebook.com/l.php',
    selector: 'a[href*="l.facebook.com/l.php"]',
  },

  /** Link bài post gốc (permalink) */
  postLink: {
    hrefPatterns: ['/posts/', '/videos/', '/photos/', '/reel/'],
  },

  // ── Phát hiện chặn / CAPTCHA / yêu cầu đăng nhập ─────────────────

  blocked: {
    loginFormSelector: 'form[action*="login"], input[type="password"]',
    captchaPatterns: ['captcha', 'checkpoint', 'security_check'],
    rateLimitTexts: [
      'you\'re temporarily blocked',
      'bạn tạm thời bị chặn',
      'try again later',
      'thử lại sau',
      'please slow down',
      'hãy giảm tốc độ'
    ],
  },

  // ── Website đích – Đếm sản phẩm (Giai đoạn 3) ────────────────────

  products: {
    shopifySitemapPattern: /sitemap_products_\d+\.xml/,
    shopifyProductUrlPattern: /\/products\//,
    shopifyJsonEndpoint: '/products.json',
    wooSitemapPattern: /product-sitemap\d*\.xml/,
    wooProductUrlPattern: /\/product\//,
    sitemapPaths: ['/sitemap.xml', '/sitemap_index.xml'],
    collectionPaths: [
      '/collections/all',
      '/collections',
      '/shop',
      '/products',
      '/bestseller',
      '/best-sellers',
    ],
  },

  // ── Cấu hình cuộn trang (scroll) ─────────────────────────────────

  scroll: {
    distance: 800,
    waitAfterScroll: 2500,
  },
};
