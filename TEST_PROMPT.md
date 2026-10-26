# 🧪 MASTER TEST PROMPT: TOÀN DIỆN & CHUYÊN SÂU FB ADS PRODUCT RESEARCH EXTENSION
## (Chuẩn Kiểm thử ECC: Multi-Plane Verification – Chrome DevTools MCP, Visual, DOM, API, Logfile & Self-Healing)

> **Hướng dẫn sử dụng:**  
> Dán toàn bộ nội dung tài liệu này vào Agent / AI hoặc sử dụng làm tài liệu quy trình kiểm chuẩn (SOP) để thực hiện chu trình kiểm thử, giám sát, bắt lỗi, vá mã nguồn và nâng cấp tự động cho tiện ích mở rộng **FB Ads Product Research**.

---

## 🎯 1. TÔN CHỈ & NGUYÊN TẮC KIỂM THỬ ECC (EXTREME CODE CLEANLINESS)

Một tính năng chỉ được chứng nhận **ĐẠT (PASS)** khi thỏa mãn đồng thời **4 Mặt Phẳng Bằng Chứng (4-Plane Verification)**:

```
                  ┌──────────────────────────────────────────────┐
                  │          MẶT PHẲNG 1: VISUAL EVIDENCE       │
                  │  Capture Screenshot chụp thực tế giao diện   │
                  └──────────────────────┬───────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
        ▼                                ▼                                ▼
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│ MẶT PHẲNG 2: DOM     │      │ MẶT PHẲNG 3: API/NET │      │ MẶT PHẲNG 4: LOGFILE │
│ QuerySelector chuẩn, │      │ GraphQL Requests,    │      │ Storage logs khớp,   │
│ Computed Styles,     │      │ Webhook HTTP POST,   │      │ đếm đúng PASS/SKIP,  │
│ A11y & Visibility    │      │ Response status 200  │      │ Zero empty catch     │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘
```

1. **Không giả định:** Mọi kết luận phải dựa trên dữ liệu thật trích xuất qua `chrome-devtools` MCP (evaluate_script, take_screenshot, get_network_request).
2. **Silent Failure Zero-Tolerance:** Tuyệt đối không chấp nhận bất kỳ khối `catch (_) {}` nào trong toàn bộ codebase. Mọi lỗi phải được ghi log hoặc xử lý có chủ đích.
3. **Tự động vá lỗi (Self-Healing Loop):** Khi phát hiện sai lệch giữa Visual/DOM/API/Log, Agent phải lập tức truy nguyên nguyên nhân gốc rễ (Root Cause), sửa mã nguồn tại chỗ và chạy lại bộ kiểm thử tự động `.ecc/eval-harness.js`.

---

## 🛠️ 2. CHUẨN BỊ MÔI TRƯỜNG & CÔNG CỤ ĐIỀU KHIỂN

### 2.1. Công cụ MCP Chrome DevTools bắt buộc:
* `list_pages`: Liệt kê các tab đang mở.
* `new_page` / `select_page`: Điều hướng và chọn tab mục tiêu.
* `evaluate_script`: Thực thi JavaScript trực tiếp trong ngữ cảnh trang web/side panel.
* `take_screenshot`: Chụp ảnh màn hình lưu vào artifact directory để so sánh trực quan.
* `resize_page`: Giả lập các kích thước màn hình Side Panel chuẩn (360px, 440px, 600px).

### 2.2. Khởi tạo phiên kiểm thử:
```bash
# 1. Chạy bộ đánh giá kiểm tra cú pháp và logic ban đầu
node f:/Clone-shopify/fb-ads-research-extension/.ecc/eval-harness.js

# 2. Khởi động máy chủ cục bộ phục vụ kiểm thử Side Panel / Popup
node -e "const http = require('http'); const fs = require('fs'); const path = require('path'); const server = http.createServer((req, res) => { let filePath = path.join('f:/Clone-shopify/fb-ads-research-extension', req.url === '/' ? 'sidepanel.html' : req.url); if (fs.existsSync(filePath)) { const ext = path.extname(filePath); const contentType = ext === '.html' ? 'text/html' : (ext === '.js' ? 'text/javascript' : 'text/css'); res.writeHead(200, { 'Content-Type': contentType }); res.end(fs.readFileSync(filePath)); } else { res.writeHead(404); res.end('Not found'); } }); server.listen(8089, () => console.log('Listening on http://localhost:8089'));"
```

---

## 📋 3. MA TRẬN 10 KỊCH BẢN KIỂM THỬ ĐẦY ĐỦ (TEST SUITES)

---

### 🔹 SUITE 1: KIỂM THỬ GIAO DIỆN CHROME SIDE PANEL & CO GIÃN RESPONSIVE

* **Mục tiêu:** Xác nhận giao diện hiển thị dạng Side Panel bên phải trình duyệt (chia đôi khung web như Meta Ads Data Advisor), co giãn linh hoạt, không bị vỡ layout, không thanh cuộn ngang thừa.
* **Các bước thực hiện:**
  1. Dùng `resize_page` đổi kích thước tab kiểm thử lần lượt thành:
     * **Cỡ hẹp:** `width: 360`, `height: 850`
     * **Cỡ tiêu chuẩn:** `width: 440`, `height: 900`
     * **Cỡ rộng:** `width: 600`, `height: 1000`
  2. Chạy script kiểm tra DOM:
     ```javascript
     () => {
       const bodyWidth = document.body.clientWidth;
       const scrollWidth = document.body.scrollWidth;
       const hasHorizontalScroll = scrollWidth > bodyWidth;
       const header = document.querySelector('h1')?.textContent;
       const badge = document.querySelector('#sidepanelStatusBadge')?.textContent;
       return { bodyWidth, scrollWidth, hasHorizontalScroll, header, badge };
     }
     ```
  3. Dùng `take_screenshot` chụp ảnh kiểm tra ở từng kích thước.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * `hasHorizontalScroll === false` (100% không có thanh cuộn ngang).
  * Tiêu đề `🔍 FB Ads Product Research` và badge `SIDE PANEL` hiển thị sắc nét.
  * Mọi input, button, select đều căn chỉnh full width theo container.

---

### 🔹 SUITE 2: KIỂM THỬ QUẢN LÝ NGÁCH & TỪ KHÓA (3 CHẾ ĐỘ)

* **Mục tiêu:** Kiểm tra độ tin cậy của 3 chế độ: Link iNote, Nhập tay, Có sẵn 200 SP kèm công cụ chọn chip.
* **Các bước thực hiện:**
  1. **Test Chế độ Link iNote:**
     * Nhập link `https://inote.net/2Z7UdHArWz` vào `#inoteUrl`.
     * Kích hoạt nút `#btnFetchInote`.
     * Kiểm tra trạng thái nạp: Bóc tách đủ 4 ngách (`Beauty`, `Car`, `Pet`, `Home`), mỗi ngách 50 từ khóa.
     * Kiểm tra dữ liệu ngoại tuyến (Offline fallback): Ngắt mạng hoặc link lỗi thì bộ 200 từ khóa nhúng sẵn trong `inote_keywords.json` vẫn kích hoạt ngay.
  2. **Test Chế độ Nhập tay (`tabManual`):**
     * Click `#tabManual`, kiểm tra `#panelManual` hiển thị, ẩn `#panelInote` và `#panelNicheSelect`.
     * Nhập tên ngách: `Fitness Gear`.
     * Nhập textarea: `yoga mat\nresistance bands, massage gun\n\nfoam roller`.
     * Kiểm tra logic tách từ khóa: Phải tách chuẩn thành 4 từ khóa sạch, loại bỏ dòng trống.
  3. **Test Chế độ Có sẵn & Chip Tools (`tabBuiltin`):**
     * Click `#tabBuiltin`.
     * Chọn ngách `Pet`.
     * Click `#btnSelectAllChips`: Kiểm tra 50/50 chip nhận class `.selected`.
     * Click `#btnDeselectAllChips`: Kiểm tra toàn bộ 50 chip bỏ chọn, chipCount về `(0 đã chọn)`.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Cả 3 chế độ chuyển đổi mượt mà, lưu vào `savedConfig` trong storage.
  * Validation: Bấm Start khi chưa chọn từ khóa phải có alert cảnh báo thân thiện, không throw uncaught error.

---

### 🔹 SUITE 3: KIỂM THỬ BỘ LỌC ADS LIBRARY & MIN DATE ENGINE TỰ ĐỘNG

* **Mục tiêu:** Kiểm tra bộ lọc GraphQL chuyên sâu và thuật toán tính toán ngày lùi (Min Date 1-12 tháng).
* **Các bước thực hiện:**
  1. **Kiểm tra tính toán ngày tự động:**
     * Lần lượt đổi `#minMonthsAgo` từ `0` đến `12` và `custom`:
       ```javascript
       () => {
         const results = {};
         const select = document.querySelector('#minMonthsAgo');
         [1, 3, 6, 12].forEach(m => {
           select.value = String(m);
           select.dispatchEvent(new Event('change'));
           results[`${m}_months`] = {
             display: document.querySelector('#minDateDisplay').textContent,
             inputVal: document.querySelector('#startDateMin').value
           };
         });
         return results;
       }
       ```
     * Kiểm tra chéo: So sánh với ngày thực tế `new Date()`, kiểm tra xử lý đúng ngày đầu tháng, cuối tháng và chuyển năm (ví dụ từ tháng 1 lùi 3 tháng sang tháng 10 năm trước).
  2. **Kiểm tra các tham số GraphQL Ads Library:**
     * `mediaType`: `ALL`, `VIDEO`, `IMAGE`, `MEME`.
     * `publisherPlatform`: `ALL`, `FACEBOOK`, `INSTAGRAM`, `AUDIENCE_NETWORK`, `MESSENGER`.
     * `searchType`: `KEYWORD_UNORDERED`, `KEYWORD_EXACT_PHRASE`.
     * `sortMode`: `SORT_BY_TOTAL_IMPRESSIONS`, `SORT_BY_START_DATE`.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * `startDateMin` luôn có định dạng chuẩn `YYYY-MM-DD`.
  * Nhãn `minDateDisplay` hiển thị định dạng người dùng `DD/MM/YYYY`.
  * Khi chọn `custom`, ô chọn ngày hiện ra và cho phép chọn ngày tùy ý.

---

### 🔹 SUITE 4: KIỂM THỬ DUAL CRAWLER ENGINE (GRAPHQL VS DOM)

* **Mục tiêu:** Xác minh 2 động cơ thu thập: Meta GraphQL API Engine (chuẩn 100%, 3s) và DOM Virtual Scroll.
* **Các bước thực hiện:**
  1. **Động cơ Meta GraphQL API:**
     * Kiểm tra cấu trúc truy vấn gửi tới `https://www.facebook.com/api/graphql/`.
     * Xác nhận `doc_id: "26617181747964058"` hoặc query friendly name `AdLibraryMobileFocusedStateProviderRefetchQuery`.
     * Đọc phản hồi JSON: Trích xuất `collation` / `ad_card`, lấy `page_id`, `page_name`, loại bỏ Page ID trùng lặp.
  2. **Động cơ DOM Virtual Scroll:**
     * Kiểm tra selector trong [selectors.js](file:///f:/Clone-shopify/fb-ads-research-extension/selectors.js):
       * Khung bài viết: `div[role="article"]` hoặc `div[class*="x1plvlek"]`.
       * Link CTA: `a[href*="l.facebook.com/l.php"]` hoặc link external.
     * Kiểm tra hàm cuộn trang: Cuộn từng bước ngẫu nhiên (600 - 800px), delay ngẫu nhiên mô phỏng người thật, bắt tín hiệu dừng khi chạm đáy hoặc đạt `maxScrolls`.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Thu được danh sách Fanpage sạch kèm Page ID số duy nhất.
  * Không phát sinh vòng lặp cuộn vô tận nếu trang hết bài viết.

---

### 🔹 SUITE 5: KIỂM THỬ CỔNG 1 – ACTIVE RATIO GATE & RESULT COUNT PARSER

* **Mục tiêu:** Thẩm định độ chính xác khi đọc số lượng ads active/inactive và quyết định PASS/SKIP.
* **Các bước thực hiện:**
  1. Chạy hàm parse số lượng kết quả trên tập mẫu đa ngôn ngữ:
     ```javascript
     const cases = [
       { text: '~31.000 kết quả', expected: 31000 },
       { text: '~86 kết quả', expected: 86 },
       { text: '~1,250 results', expected: 1250 },
       { text: '15 results', expected: 15 },
       { text: '~500 KẾT QUẢ', expected: 500 },
       { text: 'Không có kết quả', expected: null }
     ];
     ```
  2. Thử nghiệm logic tính Active Ratio:
     * **Ca PASS:** Active = 28, Inactive = 6 $\rightarrow$ Ratio = $82.4\% \ge 70\%$ $\rightarrow$ PASS Cổng 1.
     * **Ca SKIP:** Active = 5, Inactive = 15 $\rightarrow$ Ratio = $25.0\% < 70\%$ $\rightarrow$ SKIP Cổng 1 (`SKIP_RATIO`).
     * **Ca ZERO:** Active = 0, Inactive = 0 $\rightarrow$ `SKIP_ZERO`.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Hàm `parseResultCount` vượt qua 100% test case.
  * Các page bị `SKIP_RATIO` lập tức được đóng tab để giải phóng RAM, ghi nhận log vàng cam rõ ràng.

---

### 🔹 SUITE 6: KIỂM THỬ CỔNG 2 – BÓC TÁCH CTA & 5-TIER PRODUCT SCALE GATE

* **Mục tiêu:** Kiểm tra khả năng giải mã website đích và đếm số sản phẩm qua 5 tầng fallback.
* **Các bước thực hiện:**
  1. **Giải mã CTA:**
     * Input test: `https://l.facebook.com/l.php?u=https%3A%2F%2Fglowcare.com%2Fproducts%2Froller%3Futm_source%3Dfb%26fbclid%3D123xyz&h=abc`
     * Kiểm tra output của `unwrapCtaUrl`: Phải trả về sạch: `https://glowcare.com/products/roller`, domain gốc: `https://glowcare.com`.
  2. **Quét 5 Tầng đếm sản phẩm:**
     * **Tầng 1 (Sitemap XML):** Fetch `sitemap.xml` / `sitemap_products_1.xml`, đếm số lượng thẻ `<loc>` hoặc `<url>`.
     * **Tầng 2 (Shopify API):** Fetch `/products.json?limit=250`, đếm mảng `products.length`.
     * **Tầng 3 (WooCommerce):** Fetch `/wp-json/wc/store/v1/products`, đếm JSON products.
     * **Tầng 4 (Collections):** Fetch `/collections/all`, đếm item card.
     * **Tầng 5 (DOM Schema):** Quét `<script type="application/ld+json">` có `@type: "Product"`.
  3. **Đánh giá ngưỡng:**
     * $\ge 15$ sản phẩm $\rightarrow$ **PASS TOÀN DIỆN**.
     * $< 15$ sản phẩm $\rightarrow$ **SKIP_PRODUCTS** (loại bỏ shop rác / 1 sản phẩm).
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Bóc tách website sạch 100%, không dính tracking param.
  * Đếm sản phẩm chuẩn xác, ghi rõ nguồn trích xuất (`productDetectionSource`).

---

### 🔹 SUITE 7: KIỂM THỬ ĐỒNG BỘ GOOGLE SHEETS WEBHOOK & DEDUPLICATION

* **Mục tiêu:** Kiểm tra tính toàn vẹn của gói tin Webhook gửi sang Google Apps Script (`Code.gs`) và cơ chế chống ghi trùng.
* **Các bước thực hiện:**
  1. Kiểm tra cấu trúc payload JSON gửi qua HTTP POST:
     * Chứa đầy đủ: `secretKey`, `pageName`, `pageId`, `adLibraryUrl`, `activeAds`, `inactiveAds`, `activeRatio`, `targetWebsite`, `productCount`, `niche`, `keyword`, `country`, `crawledAt`.
  2. Kiểm tra xác thực bảo mật:
     * Gửi sai `secretKey` $\rightarrow$ Server trả về lỗi 403 Forbidden.
     * Gửi đúng `secretKey` $\rightarrow$ Server trả về 200 OK kèm `status: "SUCCESS"`.
  3. Kiểm tra chống trùng khóa `(Page ID + Keyword)`:
     * Gửi bản ghi lần 1: Dòng mới xuất hiện, STT tự tăng.
     * Gửi lại bản ghi cùng Page ID & Keyword lần 2 với số liệu mới: Apps Script **cập nhật đè lên dòng cũ**, không phát sinh thêm dòng mới.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Tự động tạo tiêu đề (header) nếu sheet trống.
  * Định dạng %, URL clickable, màu sắc chuẩn.

---

### 🔹 SUITE 8: KIỂM THỬ TAB LOGFILE & DASHBOARD TOÀN MÀN HÌNH (`log.html`)

* **Mục tiêu:** Đảm bảo hệ thống log vận hành hoàn hảo cả trên Side Panel lẫn tab độc lập `log.html`.
* **Các bước thực hiện:**
  1. Nạp danh sách log mẫu gồm đủ các cấp độ: `INFO`, `RUNNING`, `PASS`, `SKIP`, `SAVED`, `WARN`, `ERROR`.
  2. Click chuyển giữa 2 tab: `🎯 Thiết lập & Quét` ⇄ `📋 Logfile`.
  3. Kiểm tra thanh thống kê: Đếm đúng Tổng dòng, số PASS, SKIP, ERROR.
  4. Kiểm tra bộ lọc cấp độ (`logLevelFilter`): Chọn `ERROR` chỉ hiện các dòng lỗi; chọn `PASS` chỉ hiện dòng đạt chuẩn.
  5. Kiểm tra tìm kiếm trực tiếp (`logSearchInput`): Gõ từ khóa tìm kiếm theo tên page hoặc domain.
  6. Kiểm tra các nút hành động:
     * Nút **📋 Copy**: Kiểm tra clipboard nhận đúng chuỗi text dạng `[HH:MM:SS] [LEVEL] message`.
     * Nút **💾 Tải .log**: Kiểm tra trình duyệt kích hoạt tải tệp `.log`.
     * Nút **🗑️ Xóa log**: Gửi message `CLEAR_LOGS` và làm sạch danh sách.
     * Nút **↗️ Mở tab mới**: Mở trang `log.html` toàn màn hình.
  7. Kiểm tra tính năng Realtime trên `log.html`: Khi extension nền ghi log mới, `log.html` tự động cập nhật ngay lập tức qua `chrome.storage.onChanged`.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Khung log chiếm trọn chiều cao side panel (`calc(100vh - 240px)`).
  * Checkbox "Tự cuộn" luôn cuộn xuống đáy khi có dòng log mới.

---

### 🔹 SUITE 9: KIỂM THỬ ĐỘ BỀN, ALARM KEEPALIVE & PHỤC HỒI (RESILIENCE)

* **Mục tiêu:** Đảm bảo Service Worker MV3 không bị Chrome ngắt sau 30s và hệ thống có thể tiếp tục (Resume) mượt mà khi gặp sự cố.
* **Các bước thực hiện:**
  1. Kiểm tra Alarm Keepalive:
     ```javascript
     chrome.alarms.get('research-keepalive', (alarm) => console.log('Keepalive active:', !!alarm));
     ```
  2. Kiểm tra State Persistence:
     * Khi đang chạy ở keyword thứ 3, page thứ 10 $\rightarrow$ bấm **⏹ Stop**.
     * Kiểm tra trạng thái lưu trong `chrome.storage.local`: `status === 'PAUSED'`, các chỉ số `currentKeywordIndex`, `currentPageIndex` được bảo toàn.
     * Bấm **↻ Resume**: Quá trình tiếp tục chạy từ đúng trang đang dang dở, không quét lại từ đầu.
  3. Kiểm tra Hàng đợi gửi bù (`pendingSheetWrites`):
     * Giả lập mất kết nối mạng khi đang gửi Sheets $\rightarrow$ bản ghi được đưa vào `pendingSheetWrites`.
     * Khi mạng phục hồi hoặc khi bấm Resume $\rightarrow$ extension tự động gửi bù toàn bộ bản ghi còn nợ.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Không bao giờ bị mất dữ liệu tiến trình giữa chừng.
  * Nút Resume chỉ sáng khi ở trạng thái `PAUSED`.

---

### 🔹 SUITE 10: RÀ SOÁT MÃ NGUỒN CHUẨN ECC (SILENT FAILURE HUNTER)

* **Mục tiêu:** Quét toàn bộ codebase để diệt tận gốc các lỗi tiềm ẩn và bẫy lỗi im lặng.
* **Các bước thực hiện:**
  1. Thực thi script audit tìm kiếm các mẫu vi phạm:
     * `catch\s*\([^\)]*\)\s*\{\s*\}` (catch rỗng)
     * Promise thiếu `.catch()`
     * `console.error` mà không có recovery logic
  2. Chạy bộ kiểm thử tự động:
     ```bash
     node f:/Clone-shopify/fb-ads-research-extension/.ecc/eval-harness.js
     ```
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * **17/17 tiêu chí PASS 100%.**
  * Số lượng catch block rỗng: **0**.

---

## 🔄 4. QUY TRÌNH PHÁT HIỆN LỖI & TỰ SỬA LỖI (SELF-HEALING PROTOCOL)

Khi phát hiện bất kỳ bài test nào bị **FAIL**:

```
[BƯỚC 1: CÔ LẬP LỖI]
    │  Đọc log console, trích xuất Stack Trace, chụp ảnh màn hình hiện trạng
    ▼
[BƯỚC 2: TÁI HIỆN BẰNG SCRATCH SCRIPT]
    │  Tạo file scratch trong thư mục làm việc để tái hiện lỗi cô lập trong 5 dòng code
    ▼
[BƯỚC 3: SỬA MÃ NGUỒN TẬN GỐC]
    │  Chỉnh sửa file tương ứng (selectors.js / background.js / popup.js / sidepanel.html)
    │  TUYỆT ĐỐI KHÔNG dùng timeout bừa bãi hoặc try/catch che giấu lỗi
    ▼
[BƯỚC 4: BỔ SUNG VÀO EVAL HARNESS]
    │  Thêm test case gây lỗi vào .ecc/eval-harness.js để chống tái phát (Regression Guard)
    ▼
[BƯỚC 5: KIỂM TRA HỒI QUY TOÀN BỘ]
    │  Chạy lại node .ecc/eval-harness.js đảm bảo 17+ tests đều PASS
    ▼
[BƯỚC 6: CAPTURE HÌNH ẢNH MINH CHỨNG VÀ BÁO CÁO]
```

---

## 🏆 5. CHECKLIST ĐÁNH GIÁ CUỐI CÙNG TRƯỚC KHI BÀN GIAO

- [ ] Extension hiển thị dạng **Chrome Side Panel** bên phải màn hình khi click icon trên toolbar.
- [ ] Giao diện co giãn tự nhiên từ 320px đến 600px+ mà không xuất hiện thanh cuộn ngang.
- [ ] Chế độ iNote nạp chuẩn 200 từ khóa chia 4 ngách từ link `https://inote.net/2Z7UdHArWz`.
- [ ] Chế độ Nhập tay nhận diện danh sách từ khóa nhiều dòng sạch sẽ.
- [ ] Nút "Chọn tất cả" và "Bỏ chọn" chip hoạt động tức thì.
- [ ] Dropdown Min Date (1-12 tháng) tính ngày lùi chuẩn xác và hiển thị Live Preview `DD/MM/YYYY`.
- [ ] Cả 2 Engine (`GRAPHQL` và `DOM`) đều hoạt động ổn định.
- [ ] Cổng 1 (Active Ratio $\ge 70\%$) và Cổng 2 (Website $\ge 15$ SP) phân loại chuẩn 100%.
- [ ] Webhook Google Sheets ghi dữ liệu an toàn qua `secretKey`, chống trùng dòng.
- [ ] Tab Logfile và Dashboard `log.html` lọc level, search, copy, xuất file `.log` mượt mà.
- [ ] Bộ kiểm thử `.ecc/eval-harness.js` đạt điểm tuyệt đối **17/17 PASS**.
