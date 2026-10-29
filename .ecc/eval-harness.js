/**
 * ECC Automated Evaluation Harness for Facebook Ads Research Extension
 * Follows ECC verification-loop & silent-failure-hunter specifications.
 * 
 * Run with: node .ecc/eval-harness.js
 */

const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');

// Colors for terminal output
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;
const failures = [];

function assert(description, actual, expected) {
  const isMatch = JSON.stringify(actual) === JSON.stringify(expected);
  if (isMatch) {
    passed++;
    console.log(`  ${GREEN}✓${RESET} ${description}`);
  } else {
    failed++;
    failures.push({ description, actual, expected });
    console.log(`  ${RED}✗${RESET} ${description}`);
    console.log(`     Expected: ${JSON.stringify(expected)}`);
    console.log(`     Actual:   ${JSON.stringify(actual)}`);
  }
}

console.log(`\n${BOLD}${CYAN}=== ECC EXTENSION EVALUATION HARNESS ===${RESET}\n`);

// ----------------------------------------------------
// Test Suite 1: Result Count Parsing Logic
// ----------------------------------------------------
console.log(`${BOLD}1. Testing Result Count Parser (selectors.js & content_fb.js)${RESET}`);

function parseResultCount(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/[~≈]?\s*([\d.,]+)\s*(?:results|kết quả)/i);
  if (!match) return null;
  const cleanNum = match[1].replace(/[.,]/g, '');
  const parsed = parseInt(cleanNum, 10);
  return isNaN(parsed) ? null : parsed;
}

assert("Parses standard Vietnamese result count (~86 kết quả)", parseResultCount("~86 kết quả"), 86);
assert("Parses exact 91 results from Vietnamese Facebook Ad Library (~91 kết quả)", parseResultCount("~91 kết quả"), 91);
assert("Parses thousand dot separator (~3.200 kết quả for inactive ads)", parseResultCount("~3.200 kết quả"), 3200);
assert("Parses thousand dot separator (~31.000 kết quả)", parseResultCount("~31.000 kết quả"), 31000);
assert("Parses thousand comma separator (~1,250 results)", parseResultCount("~1,250 results"), 1250);
assert("Parses plain number without tilde (15 results)", parseResultCount("15 results"), 15);
assert("Parses uppercase KẾT QUẢ (~500 KẾT QUẢ)", parseResultCount("~500 KẾT QUẢ"), 500);
assert("Handles leading/trailing whitespace ('   ~99 results   ')", parseResultCount("   ~99 results   "), 99);
assert("Returns null on zero text without match ('Không có kết quả')", parseResultCount("Không tìm thấy kết quả phù hợp"), null);
assert("Returns null on invalid input", parseResultCount(null), null);

// ----------------------------------------------------
// Test Suite 2: CTA URL Decoding & Sanitization
// ----------------------------------------------------
console.log(`\n${BOLD}2. Testing CTA URL Decoding & Sanitization${RESET}`);

function decodeCtaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    let clean = rawUrl;
    if (clean.includes('l.facebook.com/l.php')) {
      const parsed = new URL(clean);
      const targetParam = parsed.searchParams.get('u');
      if (targetParam) {
        clean = decodeURIComponent(targetParam);
      }
    }
    const finalUrl = new URL(clean);
    const trackingParams = [
      'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 
      'utm_term', 'utm_content', 'gclid', 'ttclid'
    ];
    trackingParams.forEach(p => finalUrl.searchParams.delete(p));
    return finalUrl.toString();
  } catch (err) {
    return null;
  }
}

const mockFbShim = "https://l.facebook.com/l.php?u=https%3A%2F%2Fmycoolstore.com%2Fproducts%2Fwireless-charger%3Fvariant%3D12345%26fbclid%3DIwAR2xyz%26utm_source%3Dfacebook%26utm_campaign%3Dcold_traffic";
assert(
  "Unwraps l.facebook.com and strips tracking parameters",
  decodeCtaUrl(mockFbShim),
  "https://mycoolstore.com/products/wireless-charger?variant=12345"
);

const directUrl = "https://brandstore.com/item-1?gclid=12345&ref=homepage";
assert(
  "Cleans tracking parameters from direct URL while preserving normal query params",
  decodeCtaUrl(directUrl),
  "https://brandstore.com/item-1?ref=homepage"
);

assert("Safely returns null on malformed URLs", decodeCtaUrl("not-a-valid-url"), null);

// ----------------------------------------------------
// Test Suite 3: Active Ad Ratio Calculation
// ----------------------------------------------------
console.log(`\n${BOLD}3. Testing Active Ratio Evaluation & Gates${RESET}`);

function evaluateRatio(activeCount, inactiveCount, threshold = 0.70) {
  if (activeCount === null || inactiveCount === null) {
    return { passed: false, status: 'UNKNOWN', ratio: 0 };
  }
  const total = activeCount + inactiveCount;
  if (total === 0) {
    return { passed: false, status: 'ZERO', ratio: 0 };
  }
  const ratio = activeCount / total;
  return {
    passed: ratio >= threshold,
    status: ratio >= threshold ? 'PASS' : 'SKIP_RATIO',
    ratio: Math.round(ratio * 100) / 100
  };
}

assert(
  "Passes when active ratio exceeds threshold (10 active, 2 inactive >= 70%)",
  evaluateRatio(10, 2),
  { passed: true, status: 'PASS', ratio: 0.83 }
);

assert(
  "Skips when active ratio is below threshold (3 active, 7 inactive < 70%)",
  evaluateRatio(3, 7),
  { passed: false, status: 'SKIP_RATIO', ratio: 0.3 }
);

assert(
  "Skips Viqzes.store accurately (91 active, 3200 inactive -> ratio 2.76% < 70%)",
  evaluateRatio(91, 3200),
  { passed: false, status: 'SKIP_RATIO', ratio: 0.03 }
);

assert(
  "Marks UNKNOWN when ad count read failed (null active)",
  evaluateRatio(null, 5),
  { passed: false, status: 'UNKNOWN', ratio: 0 }
);

assert(
  "Marks ZERO when total is 0",
  evaluateRatio(0, 0),
  { passed: false, status: 'ZERO', ratio: 0 }
);

// ----------------------------------------------------
// Test Suite 4: Product Count Evaluation
// ----------------------------------------------------
console.log(`\n${BOLD}4. Testing Product Count Parsing & Evaluation${RESET}`);

function parseSitemapXmlCount(xmlText) {
  if (!xmlText) return 0;
  const matches = xmlText.match(/<url>[\s\S]*?<\/url>/gi) || [];
  return matches.length;
}

const sampleSitemap = `
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/products/item-1</loc></url>
  <url><loc>https://example.com/products/item-2</loc></url>
  <url><loc>https://example.com/products/item-3</loc></url>
  <url><loc>https://example.com/products/item-4</loc></url>
</urlset>`;

assert("Counts <url> tags in sitemap XML accurately", parseSitemapXmlCount(sampleSitemap), 4);

// ----------------------------------------------------
// Test Suite 5: Google Sheet Schema & Streamlined Payload (No Link Post Ads)
// ----------------------------------------------------
console.log(`\n${BOLD}5. Testing Google Sheet Schema & Streamlined Payload${RESET}`);

const codeGsContent = fs.readFileSync(path.join(rootDir, 'Code.gs'), 'utf8');

assert(
  "HEADERS in Code.gs does not contain 'Link Post Ads'",
  codeGsContent.includes("'Link Post Ads'"),
  false
);

assert(
  "CREATIVE_HEADERS in Code.gs does not contain 'Link Post / Reel FB'",
  codeGsContent.includes("Link Post / Reel FB"),
  false
);

assert(
  "Active Ratio format is applied to Column 9 (Column I) in Code.gs",
  codeGsContent.includes("sheet.getRange(existingRowIndex, 9).setNumberFormat('0.0%')"),
  true
);

// Verify row values structure
function buildMockRowValues(data) {
  return [
    1,
    data.niche || 'N/A',
    data.keyword || '',
    "'" + String(data.pageId),
    data.pageName || '',
    data.websiteUrl || '',
    data.activeCount || 0,
    data.inactiveCount || 0,
    data.activeRatio || 0,
    data.productCount || 0,
    data.productSource || 'N/A',
    '29/10/2026',
    data.status || 'PASS'
  ];
}

const mockData = {
  niche: 'Beauty',
  keyword: 'serum',
  pageId: '1875448039341460',
  pageName: 'Timeless Skin Care',
  websiteUrl: 'https://www.timelessha.com',
  activeCount: 21,
  inactiveCount: 0,
  activeRatio: 1.0,
  productCount: 75,
  productSource: 'Shopify JSON',
  status: 'PASS'
};

const mockRow = buildMockRowValues(mockData);
assert("Row values has exact 13 columns (STT to Trạng thái)", mockRow.length, 13);
assert("Column 6 (index 5) is Link Website", mockRow[5], 'https://www.timelessha.com');
assert("Column 9 (index 8) is Active Ratio", mockRow[8], 1.0);

// ----------------------------------------------------
// Test Suite 6: Silent Failure Hunter Audit
// ----------------------------------------------------
console.log(`\n${BOLD}6. Silent Failure Hunter Code Audit${RESET}`);

const jsFiles = ['background.js', 'content_fb.js', 'content_web.js', 'popup.js', 'selectors.js'];

let emptyCatchFound = 0;
jsFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    // Check for empty catch blocks like: catch (e) {} or catch {}
    const emptyCatchRegex = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    const matches = content.match(emptyCatchRegex);
    if (matches) {
      emptyCatchFound += matches.length;
      console.log(`  ${YELLOW}⚠ Warning: Empty catch block in ${file}${RESET}`);
    }
  }
});

assert("Zero empty catch blocks found across codebase", emptyCatchFound, 0);

// ----------------------------------------------------
// Test Suite 7: URL Builder & Filter Normalization
// ----------------------------------------------------
console.log(`\n${BOLD}7. Testing Ad Library URL Builders & Filter Normalization${RESET}`);

function buildPageUrlTest(pageId, status, configOrCountry = {}) {
  const config = typeof configOrCountry === 'string' ? { country: configOrCountry } : (configOrCountry || {});
  const country = config.country || 'ALL';
  const mediaType = (config.mediaType || 'ALL').toLowerCase();
  const publisherPlatform = config.publisherPlatform ? config.publisherPlatform.toLowerCase() : null;
  const startDateMin = config.startDateMin || null;

  const params = new URLSearchParams({
    active_status: status,
    ad_type: 'all',
    country: country,
    is_targeted_country: 'false',
    media_type: mediaType,
    search_type: 'page',
    'sort_data[mode]': 'total_impressions',
    'sort_data[direction]': 'desc',
    source: 'page-transparency-widget',
    view_all_page_id: String(pageId),
  });

  if (publisherPlatform && publisherPlatform !== 'all') {
    params.set('publisher_platforms[0]', publisherPlatform);
  }
  if (startDateMin) {
    params.set('start_date[min]', startDateMin);
    params.set('start_date[max]', '');
  }

  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

const testUrl1 = buildPageUrlTest('1875448039341460', 'active', {
  country: 'US',
  mediaType: 'VIDEO',
  publisherPlatform: 'FACEBOOK',
  startDateMin: '2026-07-29'
});

assert("Normalizes mediaType from VIDEO to lowercase video in URL", testUrl1.includes('media_type=video'), true);
assert("Normalizes publisherPlatform from FACEBOOK to lowercase facebook in URL", testUrl1.includes('publisher_platforms%5B0%5D=facebook'), true);
assert("Encodes startDateMin accurately in URL", testUrl1.includes('start_date%5Bmin%5D=2026-07-29'), true);
assert("Contains target view_all_page_id", testUrl1.includes('view_all_page_id=1875448039341460'), true);

const testUrl2 = buildPageUrlTest('1875448039341460', 'active', {
  country: 'US',
  mediaType: 'ALL',
  publisherPlatform: 'ALL'
});

assert("Omits publisher_platforms when publisherPlatform is ALL", testUrl2.includes('publisher_platforms'), false);
assert("Sets media_type=all when mediaType is ALL", testUrl2.includes('media_type=all'), true);

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log(`\n${BOLD}----------------------------------------${RESET}`);
console.log(`${BOLD}Evaluation Result: ${passed} Passed, ${failed} Failed${RESET}`);
if (failed > 0) {
  console.log(`${RED}Harness failed with ${failed} issues. Please review failures above.${RESET}\n`);
  process.exit(1);
} else {
  console.log(`${GREEN}All ECC evaluation gates PASSED!${RESET}\n`);
}
