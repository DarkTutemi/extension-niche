/**
 * beauty_30_runner.js - Automated 30-Keyword Beauty Niche Campaign Tester
 * Follows TEST_PROMPT.md: Multi-Plane Verification (Visual, DOM, GraphQL API, Sheet Sync)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxkK_w6gHRswlP8xhxZB8khEB32s81QmbUZF9LeJcnDKYZtaauW8Oh88QGbYpnmi-pn/exec';
const SECRET_KEY = 'my_super_secret_key_2026';

const BEAUTY_KEYWORDS = [
  "retinol serum",
  "vitamin C serum",
  "niacinamide serum",
  "salicylic acid cleanser",
  "glycolic acid toner",
  "face moisturizer dry skin",
  "night cream anti aging",
  "eye cream dark circles",
  "sunscreen SPF50",
  "tinted moisturizer",
  "BB cream",
  "foundation full coverage",
  "concealer waterproof",
  "setting spray long lasting",
  "lip oil",
  "lip tint",
  "lip liner",
  "mascara volume",
  "eyelash serum",
  "lash clusters",
  "press on nails",
  "gel nail strips",
  "eyebrow pencil",
  "brow gel",
  "makeup remover balm",
  "cleansing oil",
  "acne patch",
  "pimple patch",
  "blackhead remover",
  "led light therapy mask"
];

async function checkShopifyProducts(url) {
  return new Promise((resolve) => {
    try {
      const u = new URL('/products.json?limit=250', url);
      const req = https.get(u.href, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            const redirectUrl = new URL(res.headers.location, url);
            https.get(redirectUrl.href, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res2) => {
              let d = '';
              res2.on('data', c => d += c);
              res2.on('end', () => {
                try {
                  const j = JSON.parse(d);
                  resolve(j.products && Array.isArray(j.products) ? { count: j.products.length, isShopify: true } : { count: 0, isShopify: false });
                } catch(e) { resolve({ count: 0, isShopify: false }); }
              });
            }).on('error', () => resolve({ count: 0, isShopify: false }));
            return;
          } catch(e) { return resolve({ count: 0, isShopify: false }); }
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j && Array.isArray(j.products)) {
              resolve({ count: j.products.length, isShopify: true });
            } else {
              resolve({ count: 0, isShopify: false });
            }
          } catch(e) {
            resolve({ count: 0, isShopify: false });
          }
        });
      });
      req.on('error', () => resolve({ count: 0, isShopify: false }));
      req.on('timeout', () => { req.destroy(); resolve({ count: 0, isShopify: false }); });
    } catch(err) {
      resolve({ count: 0, isShopify: false });
    }
  });
}

async function syncToSheet(item) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      action: 'ADD_PAGE',
      secretKey: SECRET_KEY,
      data: item
    });
    const u = new URL(WEBHOOK_URL);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          https.get(res.headers.location, (res2) => {
            let b2 = '';
            res2.on('data', d => b2 += d);
            res2.on('end', () => resolve(b2));
          });
        } else {
          resolve(b);
        }
      });
    });
    req.on('error', e => resolve(JSON.stringify({ ok: false, error: e.message })));
    req.write(payload);
    req.end();
  });
}

module.exports = {
  BEAUTY_KEYWORDS,
  checkShopifyProducts,
  syncToSheet
};
