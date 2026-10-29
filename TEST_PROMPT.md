# 🧪 MASTER TEST PROMPT: TOÀN DIỆN & CHUYÊN SÂU FB ADS PRODUCT RESEARCH EXTENSION
## (Chuẩn Kiểm thử ECC: 100% Meta GraphQL API, Quản lý Vòng đời Tab Nghiêm ngặt, 2 Cổng Sàng lọc, Trích xuất Link Post/Reel Tương tác & Đồng bộ AppSheet)

> **Hướng dẫn sử dụng:**  
> Dán toàn bộ nội dung tài liệu này vào Agent / AI hoặc sử dụng làm tài liệu quy trình kiểm chuẩn (SOP) để thực hiện chu trình kiểm thử, giám sát, bắt lỗi, vá mã nguồn và tự động hóa cho tiện ích mở rộng **FB Ads Product Research**.

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

1. **Không giả định:** Mọi kết luận phải dựa trên dữ liệu thật trích xuất qua `chrome-devtools` MCP (`evaluate_script`, `take_screenshot`, `get_network_request`).
2. **Quy tắc Quản lý Vòng đời Tab nghiêm ngặt (Strict Tab Lifecycle):**
   - **Tab Mẹ (Tìm kiếm Từ Khóa):** Mở ra và **TUYỆT ĐỐI KHÔNG ĐƯỢC ĐÓNG** khi cào xong, giữ làm tab gốc duy trì phiên làm việc xuyên suốt.
   - **Tab Con (Từng Fanpage):** Mở riêng cho từng Page. Rớt Cổng 1 hoặc Cổng 2 $\rightarrow$ Đóng tab ngay để giải phóng RAM. Đạt chuẩn $\rightarrow$ Giữ tab tiếp tục nhấp link ads, kiểm tra website, crawl toàn bộ ads kèm CTA qua API, upload Google Sheet xong mới đóng tab.
3. **Cào 100% bằng Meta GraphQL API:** Tuyệt đối không dùng cuộn chuột DOM giả lập hay giới hạn số lần cuộn (`maxScrolls`). Tự động phân trang bằng con trỏ GraphQL Cursor để cào TOÀN BỘ Page của từ khóa. Tích hợp bộ **Fallback 4 Tầng thông minh** chống trả về 0 kết quả.
4. **Giải mã 100% chính xác Link Post / Reel Facebook để soi tương tác:** Bóc tách Video ID từ tên file CDN Facebook (`_(\d{14,18})_`) và giải mã `storyID` Base64 (`S:_I<pageId>:<postId>`) để tạo link `https://www.facebook.com/story.php?story_fbid=...&id=...` và `/reel/...` giúp người dùng click vào là xem được ngay lượt Like, Comment, Share.
5. **Chống lỗi SyntaxError & Trùng lặp Script (Re-injection Guard):** Cơ chế ping `CHECK_READY` trước khi inject content script và sử dụng `globalThis` an toàn, loại bỏ hoàn toàn lỗi `Identifier has already been declared`.
6. **Silent Failure Zero-Tolerance:** Không chấp nhận bất kỳ khối `catch (_) {}` nào trong codebase. Mọi lỗi phải được ghi log hoặc có cơ chế retry phục hồi.
7. **Tự động vá lỗi (Self-Healing Loop):** Khi phát hiện sai lệch giữa Visual/DOM/API/Log, Agent phải lập tức truy nguyên nguyên nhân gốc rễ, sửa mã nguồn tại chỗ và kiểm tra lại bằng `.ecc/eval-harness.js`.

---

## 🛠️ 2. CHUẨN BỊ MÔI TRƯỜNG & CÔNG CỤ ĐIỀU KHIỂN

### 2.1. Công cụ MCP Chrome DevTools:
* `list_pages`: Liệt kê các tab đang mở (nhận diện Tab Mẹ Ads Library, Tab Con Page, Tab Side Panel).
* `new_page` / `select_page`: Điều hướng và chọn tab mục tiêu.
* `evaluate_script`: Thực thi JavaScript trực tiếp trong ngữ cảnh trang web/side panel.
* `take_screenshot`: Chụp ảnh màn hình lưu vào artifact directory để so sánh trực quan.
* `resize_page`: Giả lập các kích thước màn hình Side Panel chuẩn (360px, 440px, 600px).

### 2.2. Khởi tạo phiên kiểm thử:
```bash
# 1. Chạy bộ đánh giá kiểm tra cú pháp và logic ban đầu (yêu cầu 32/32 PASS)
node f:/Clone-shopify/fb-ads-research-extension/.ecc/eval-harness.js

# 2. Khởi động máy chủ cục bộ phục vụ kiểm thử Side Panel / Popup
python -m http.server 8089 --directory f:\Clone-shopify\fb-ads-research-extension
```

---

## 📋 3. MA TRẬN 10 KỊCH BẢN KIỂM THỬ ĐẦY ĐỦ (TEST SUITES)

---

### 🔹 SUITE 1: KIỂM THỬ GIAO DIỆN CHROME SIDE PANEL & PHÂN TÁCH 2 CỔNG LỌC

* **Mục tiêu:** Xác nhận giao diện hiển thị dạng Side Panel bên phải trình duyệt (chia đôi khung web), co giãn linh hoạt, đã loại bỏ hoàn toàn ô "Tối đa lần cuộn", và phân tách rõ ràng 2 Cổng Lọc.
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
       const hasMaxScrolls = !!document.querySelector('#maxScrolls');
       const activeThreshold = document.querySelector('#activeThreshold')?.value;
       const minProducts = document.querySelector('#minProducts')?.value;
       const maxPagesVal = document.querySelector('#maxPages')?.value;
       return { 
         hasHorizontalScroll, 
         hasMaxScrolls, // Phải là FALSE (đã xóa bỏ)
         activeThreshold, // 70
         minProducts, // 15
         maxPagesVal // 0 (Toàn bộ không giới hạn)
       };
     }
     ```
  3. Dùng `take_screenshot` chụp ảnh kiểm tra ở từng kích thước.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * `hasHorizontalScroll === false` (100% không có thanh cuộn ngang).
  * `hasMaxScrolls === false` (Ô "Tối đa lần cuộn" đã bị xóa sổ hoàn toàn).
  * Khu vực **🎯 Tiêu chuẩn sàng lọc (2 Cổng)** phân định rõ:
    * `Cổng 1: Ngưỡng active (%)`: mặc định 70%.
    * `Cổng 2: SP website tối thiểu`: dropdown chuẩn (≥ 15 SP, ≥ 20 SP, ≥ 10 SP, ≥ 5 SP, Tất cả).
  * Khu vực **⚡ Thu thập & Vận hành (100% API)**:
    * `Số lượng Page thu thập`: mặc định `0` (⚡ Toàn bộ không giới hạn).

---

### 🔹 SUITE 2: KIỂM THỬ QUẢN LÝ NGÁCH & TỪ KHÓA (3 CHẾ ĐỘ)

* **Mục tiêu:** Kiểm tra độ tin cậy của 3 chế độ: Link iNote, Nhập tay, Có sẵn 200 SP kèm công cụ chọn chip.
* **Các bước thực hiện:**
  1. **Test Chế độ Link iNote:**
     * Nhập link `https://inote.net/2Z7UdHArWz` vào `#inoteUrl` và click `#btnFetchInote`.
     * Xác nhận bóc tách đủ 4 ngách (`Beauty`, `Car`, `Pet`, `Home`), mỗi ngách 50 từ khóa.
     * Offline fallback: Nếu mạng lỗi, bộ 200 từ khóa nhúng sẵn trong `inote_keywords.json` vẫn kích hoạt ngay.
  2. **Test Chế độ Nhập tay (`tabManual`):**
     * Click `#tabManual`, nhập tên ngách `Car Accessories`.
     * Nhập textarea: `magnetic phone mount\ncar wax, dash cam\n\nwindshield shade`.
     * Xác nhận tách chuẩn thành 4 từ khóa sạch, tự loại bỏ dòng trống.
  3. **Test Chế độ Có sẵn & Chip Tools (`tabBuiltin`):**
     * Click `#tabBuiltin`, chọn ngách `Car (50 từ khóa)`.
     * Click `#btnSelectAllChips`: 50/50 chip nhận class `.selected`.
     * Click `#btnDeselectAllChips`: Toàn bộ 50 chip bỏ chọn, chipCount về `(0 đã chọn)`.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Cả 3 chế độ chuyển đổi mượt mà, tự lưu vào `savedConfig` trong storage.
  * Validation: Bấm Start khi chưa chọn từ khóa phải có alert cảnh báo thân thiện.

---

### 🔹 SUITE 3: KIỂM THỬ BỘ LỌC ADS LIBRARY, TÍNH TOÁN NGÀY LÙI, CHUẨN HÓA ENUM & LOWERCASE URL PARAMS

* **Mục tiêu:** Kiểm tra bộ lọc chuyên sâu, thuật toán tính ngày lùi (Min Date 1-12 tháng), chuẩn hóa Enum GraphQL và ép chữ thường toàn bộ param trên URL (chống lỗi rớt bộ lọc dẫn tới 110 ads).
* **Các bước thực hiện:**
  1. **Kiểm tra tính toán ngày tự động:**
     * Lần lượt đổi `#minMonthsAgo` từ `1`, `3`, `6`, `12` tháng.
     * Kiểm tra chéo: So sánh với ngày thực tế, xử lý đúng ngày đầu tháng, cuối tháng và chuyển năm (ví dụ lùi 3 tháng từ 29/10/2026 $\rightarrow$ 29/07/2026).
  2. **Kiểm tra chuẩn hóa Enum `sortMode` cho Meta GraphQL:**
     * Meta GraphQL schema (`AdLibrarySearchPaginationQuery`) **chỉ chấp nhận**: `SORT_BY_TOTAL_IMPRESSIONS` hoặc `SORT_BY_RELEVANCY_MONTHLY_GROUPED`.
     * Nếu người dùng chọn "Ngày bắt đầu mới nhất (Recent)", trên Web URL gửi `sort_data[mode]=start_date`, nhưng biến GraphQL `sortData.mode` **phải được tự động ép về enum hợp lệ** (`SORT_BY_TOTAL_IMPRESSIONS`), tuyệt đối không gửi `SORT_BY_START_DATE` làm sập truy vấn GraphQL.
  3. **Chuẩn hóa chữ thường cho tham số URL (`buildPageUrl` & `buildAdLibraryUrlForStatus`):**
     * Facebook Ads Library URL router chỉ nhận diện chữ thường: `media_type=video`, `publisher_platforms[0]=facebook`.
     * Nếu truyền chữ HOA (`VIDEO`, `FACEBOOK`), Facebook sẽ bỏ qua bộ lọc và hiển thị tất cả ads (ví dụ 110 ads thay vì 64 ads).
     * Hàm `buildPageUrl` và `buildAdLibraryUrlForStatus` bắt buộc phải chuyển sang chữ thường bằng `.toLowerCase()` và chỉ gắn `publisher_platforms` khi khác `'all'`.
  4. **Làm sạch từ khóa tự động (Quote Sanitization):**
     * Tự động gọt sạch dấu ngoặc kép thừa ở 2 đầu từ khóa (`replace(/^["']+|["']+$/g, '')`), tránh lỗi lồng ngoặc kép `""Bibles and Coffee""` làm mất kết quả.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * `startDateMin` luôn có định dạng chuẩn `YYYY-MM-DD`.
  * Nhãn `minDateDisplay` hiển thị định dạng người dùng `DD/MM/YYYY`.
  * URL tab con Page luôn chứa `media_type=video` và `publisher_platforms[0]=facebook` dạng chữ thường.
  * Không bao giờ phát sinh lỗi GraphQL schema invalid enum.

---

### 🔹 SUITE 4: KIỂM THỬ 100% META GRAPHQL API CRAWLER & BỘ FALLBACK 4 TẦNG THÔNG MINH

* **Mục tiêu:** Xác minh động cơ thu thập hoàn toàn bằng Meta GraphQL API, tự động phân trang bằng con trỏ Cursor, lấy TOÀN BỘ Page và kích hoạt Fallback 4 tầng khi không có kết quả ban đầu.
* **Các bước thực hiện:**
  1. **Kiểm tra cấu trúc truy vấn gửi tới `https://www.facebook.com/api/graphql/`:**
     * `doc_id: '24922295957467452'` (hoặc doc_id phân trang hợp lệ).
     * Bóc tách Token bảo mật tự động: `fb_dtsg`, `lsd`, `userId` từ thẻ `<script>` DOM bằng đa regex (kể cả dạng token Base64 timestamp).
  2. **Kiểm tra Bộ Fallback 4 Tầng chống "0 kết quả":**
     * **Tầng 1:** Tìm kiếm chính xác (Exact Phrase) với đầy đủ bộ lọc người dùng chọn.
     * **Tầng 2:** Nếu trả về 0 kết quả $\rightarrow$ tự động mở rộng sang tìm kiếm cụm từ (`KEYWORD_UNORDERED`).
     * **Tầng 3:** Nếu vẫn 0 kết quả do bộ lọc ngày (`startDateMin`) $\rightarrow$ tự động thử lại toàn thời gian (All-time, `startDate = null`).
     * **Tầng 4:** Nếu vẫn 0 kết quả do lọc video $\rightarrow$ tự động mở rộng sang tất cả định dạng (`mediaType = 'all'`).
  3. **Kiểm tra vòng lặp phân trang Cursor:**
     * Đọc `page_info.has_next_page` và `page_info.end_cursor`.
     * Lấy toàn bộ Page cho đến khi hết cursor hoặc đạt `maxPages`.
  4. **Kiểm tra định dạng log chuẩn:**
     * In đúng dòng log: `[INFO] 📋 Tìm thấy tất cả xxx Page hàng đầu cho "<từ khóa>"`.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Thu thập sạch sẽ danh sách Fanpage kèm Page ID số duy nhất, loại bỏ 100% trùng lặp.
  * Tốc độ phản hồi cực nhanh ~2-3 giây cho mỗi đợt truy vấn.
  * Không bao giờ bị rớt sang 0 Page khi dữ liệu thực tế trên Facebook vẫn tồn tại.

---

### 🔹 SUITE 5: KIỂM THỬ QUY TRÌNH VÒNG ĐỜI TAB & CỔNG 1 (ACTIVE RATIO $\ge 70\%$)

* **Mục tiêu:** Thẩm định việc kiểm soát Tab trực quan: Tab Mẹ luôn giữ mở; Tab Con của từng Page mở ra kiểm tra Cổng 1 với bộ lọc đồng bộ, đóng khi không đạt, giữ khi đạt.
* **Các bước thực hiện:**
  1. **Kiểm tra Tab Mẹ (Tìm kiếm Từ Khóa):**
     * Khi bắt đầu cào từ khóa, Extension mở hoặc tái sử dụng tab Facebook Ads Library.
     * Sau khi cào xong danh sách Page, **KHÔNG ĐƯỢC ĐÓNG TAB NÀY**.
     * Log minh chứng: `[INFO] 🔒 Giữ nguyên tab tìm kiếm từ khóa #... để duy trì phiên làm việc`.
  2. **Kiểm tra Tab Con từng Page & Cổng 1:**
     * Mở tab mới với URL chứa đầy đủ bộ lọc đã chuẩn hóa chữ thường: `[INFO] 📄 Mở tab #...: https://www.facebook.com/ads/library/?...`.
     * Log giữ tab: `[INFO] 🔒 Giữ tab #... để kiểm định Cổng 1 (Active Ratio)...`.
     * **Cơ chế đọc Active Count ưu tiên DOM trực tiếp (`DOM_VISIBLE`):**
       * Đọc trực tiếp con số hiển thị trên trang (`~64 results`), đảm bảo số liệu ghi nhận trên log khớp 100% với con số người dùng nhìn thấy trên tab.
       * Tuyệt đối không lấy `conn.edges.length` (kích thước trang phân trang) làm tổng số active ads.
     * **Chống bẫy lỗi Active Ratio 50%:**
       * Đối với thương hiệu Dropship/E-commerce thông thường, Facebook xóa ads đã tắt sau vài ngày (inactive = 0).
       * Khi truy vấn `inactive` trên tab đang mở trang `active`, content script **tuyệt đối không đọc DOM active làm fallback** (vì sẽ gây `active == inactive` dẫn đến ratio 50% sai lệch), mà trả về `0` (`INACTIVE_DEFAULT`).
     * Tính toán: $\text{Active Ratio} = \frac{\text{Active}}{\text{Active} + \text{Inactive}}$.
     * **Trường hợp RỚT (< 70%):**
       * In log: `[SKIP] ⏭ <Tên Page>: ratio=...% < ngưỡng 70% → KHÔNG ĐẠT CỔNG 1 (SKIP)`.
       * In log đóng tab: `[INFO] 🗑️ Đóng tab #... của [<Tên Page>] do không đạt Cổng 1`.
       * **Đóng tab này ngay lập tức**, chuyển sang Page kế tiếp.
     * **Trường hợp ĐẠT ($\ge 70\%$):**
       * In log: `[PASS] ✓ <Tên Page>: active=..., inactive=..., ratio=...% → ĐẠT CHUẨN CỔNG 1 (PASS)`.
       * In log giữ tab: `[INFO] 📌 GIỮ NGUYÊN tab #... [<Tên Page>] để thực hiện công đoạn tiếp theo: Nhấp vào link quảng cáo & kiểm tra website...`.
       * **TIẾP TỤC GIỮ NGUYÊN TAB NÀY!**
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Tab Mẹ không bao giờ bị đóng trong suốt quá trình chạy.
  * Tab Con rớt Cổng 1 được đóng dứt khoát; Tab Con đạt Cổng 1 được giữ nguyên.
  * Mọi hành động mở, giữ, đóng tab đều in rõ số hiệu Tab `#ID` và URL đầy đủ trên logfile.
  * Không bao giờ bị lỗi rớt về ratio 50% do đọc nhầm DOM active cho inactive.

---

### 🔹 SUITE 6: KIỂM THỬ NHẤP LINK ADS & CỔNG 2 (QUY MÔ KHO HÀNG SHOPIFY)

* **Mục tiêu:** Trên tab đang giữ của Page đạt Cổng 1, nhấp/trích xuất link quảng cáo tới website và thẩm định quy mô kho hàng qua 5 tầng fallback.
* **Các bước thực hiện:**
  1. **Nhấp / Trích xuất link quảng cáo trên tab đang giữ:**
     * In log: `[INFO] 🔗 Đang nhấp/trích xuất link quảng cáo trên tab #... [<Tên Page>]...`.
     * Bóc tách URL website sạch (loại bỏ `fbclid`, `utm_*`).
     * In log: `[INFO] 🔗 [<Tên Page>]: Phát hiện website đích https://...`.
  2. **Quét 5 Tầng đếm sản phẩm (`countProducts`):**
     * Tầng 1: Đọc API Shopify `/products.json?limit=250`.
     * Tầng 2 & 3: Quét sơ đồ trang web `/sitemap_products_1.xml` hoặc `/sitemap.xml`.
     * Tầng 4 & 5: Quét danh mục `/collections/all` và Schema JSON-LD `Product`.
  3. **Đánh giá Cổng 2:**
     * **Trường hợp RỚT (< 15 SP hoặc không có web):**
       * In log: `[SKIP] ⏭ <Tên Page>: sản phẩm=... < 15 → KHÔNG ĐẠT CỔNG 2 (Shop quá nhỏ/rác)`.
       * In log đóng tab: `[INFO] 🗑️ Đóng tab #... của [<Tên Page>] do không đạt Cổng 2`.
       * **Đóng tab này lại**, chuyển sang Page tiếp theo.
     * **Trường hợp ĐẠT ($\ge 15$ SP):**
       * In log: `[PASS] ✅ <Tên Page>: ... sản phẩm (...) → ĐẠT CHUẨN CỔNG 2 (WINNER STORE 🏆)`.
       * In log giữ tab: `[INFO] 📌 TIẾP TỤC GIỮ TAB #... [<Tên Page>] để crawl toàn bộ link quảng cáo kèm CTA qua API...`.
       * **TIẾP TỤC GIỮ NGUYÊN TAB NÀY!**
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Nhận diện chính xác shop đạt $\ge 15$ SP là WINNER STORE.
  * Loại bỏ ngay các shop 1 sản phẩm bán chộp giật và đóng tab sạch sẽ.

---

### 🔹 SUITE 7: KIỂM THỬ BÓC TÁCH CREATIVES, TRÍCH XUẤT LINK POST/REEL TƯƠNG TÁC & ĐỒNG BỘ APPSHEET

* **Mục tiêu:** Trên tab đang giữ của Page WINNER, cào toàn bộ danh sách ads kèm nút CTA qua API, bóc tách chính xác 100% link bài post / reel trên Facebook để soi tương tác (Like, Comment, Share) và upload đồng bộ lên Google Sheets.
* **Các bước thực hiện:**
  1. **Crawl toàn bộ Ads Creatives qua API:**
     * In log: `[INFO] 🎬 Đang crawl toàn bộ quảng cáo kèm CTA của Page [<Tên Page>] qua API trên tab #...`.
     * Bóc tách các trường: Dạng bài (`VIDEO`/`IMAGE`/`CAROUSEL`), Nút CTA (`SHOP_NOW`, `GET_OFFER`...), Link sản phẩm đích sạch.
  2. **Trích xuất Video ID và tạo Link Post / Reel Facebook chuẩn xác 100%:**
     * **Phương pháp trích xuất Media ID từ URL CDN Facebook:**
       * Hàm `extractFbMediaIdFromUrl` nhận diện chính xác cụm 14-18 chữ số dạng `.../<cluster>_<videoId>_<hash>_n.mp4` từ `video_sd_url`, `video_hd_url`, `video_preview_image_url`.
     * **Sinh đồng thời cả 2 định dạng URL:**
       * **Canonical Story URL:** `https://www.facebook.com/story.php?story_fbid=${videoId}&id=${targetPageId}` $\rightarrow$ Mở trực tiếp giao diện bài post đầy đủ với lượt Like, toàn bộ bình luận, chia sẻ và avatar Page.
       * **Reel URL:** `https://www.facebook.com/reel/${videoId}` $\rightarrow$ Mở trình phát video Reel trực quan.
     * **Giải thuật bóc tách HTML nội bộ (`resolveCanonicalStoryFromReel`):**
       * Giải mã Base64 `storyID` (`S:_I<pageId>:<postId>`) và quét `top_level_post_id` / `content_owner_id_new` khi cần truy nguyên nguồn gốc bài viết.
     * **Hỗ trợ bài đăng dạng Ảnh (Image Ads):** Trích xuất Photo ID từ link ảnh để tạo `story.php?story_fbid=${photoId}&id=${pageId}`.
     * In log: `[INFO] 📦 Đã bóc tách thành công X ads creative (Y Video/Reel links, Z Images/Carousels) cho [<Tên Page>]`.
  3. **Upload Google Sheets & AppSheet (Schema Tinh Gọn):**
      * In log: [INFO] 📤 Đang upload dữ liệu Store và X ads creative lên Google Sheet....
      * **Bảng 1 (FB_Ads_Research):** Gồm 13 cột chuẩn hóa (STT, Ngách, Keyword, Page ID, Tên Page, Link Website, Active Ads, Inactive Ads, Active Ratio, Số sản phẩm, Nguồn đếm SP, Ngày kiểm tra, Trạng thái).
      * **Bảng 2 (FB_Ads_Creatives):** Gồm 12 cột chuẩn AppSheet tập trung vào CTA, link sản phẩm đích, link thư viện FB, tiêu đề và tóm tắt creative.
      * In log: [SAVED] 💾 [<Tên Page>]: Đã upload thành công lên Google Sheet!.
   4. **Dọn dẹp Tab sau khi hoàn tất trọn vẹn:**
      * In log: [INFO] 🗑️ Hoàn tất quy trình phân tích & upload cho [<Tên Page>]. Đóng tab #... để giải phóng bộ nhớ.
      * Đóng tab này lại, nghỉ ngẫu nhiên 2s-5s rồi mới sang Page tiếp theo.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Dữ liệu upload lên Google Sheet đầy đủ 13 cột chuẩn hóa, định dạng Active Ratio cột I hiển thị dạng % chuẩn xác.
  * Tốc độ trích xuất nhanh gấp 3 lần do không phải fetch ngầm giải mã các dark post ẩn.

---

### 🔹 SUITE 8: KIỂM THỬ TAB LOGFILE & DASHBOARD TOÀN MÀN HÌNH (`log.html`)

* **Mục tiêu:** Đảm bảo hệ thống log vận hành mượt mà cả trên Side Panel lẫn tab độc lập `log.html`.
* **Các bước thực hiện:**
  1. Kiểm tra hiển thị log đa cấp độ: `INFO`, `RUNNING`, `PASS`, `SKIP`, `SAVED`, `WARN`, `ERROR`.
  2. Click chuyển giữa 2 tab: `🔍 Nghiên cứu` ⇄ `📋 Logfile`.
  3. Kiểm tra thanh thống kê: Đếm đúng Tổng dòng, số PASS, SKIP, ERROR.
  4. Kiểm tra các chức năng:
     * Lọc cấp độ (`logLevelFilter`): Chọn `PASS` chỉ hiện các dòng đạt chuẩn; chọn `SKIP` chỉ hiện dòng bị loại.
     * Tìm kiếm trực tiếp (`logSearchInput`): Tìm nhanh theo tên Page hoặc mã tab `#ID`.
     * Nút **📋 Copy**: Sao chép toàn bộ log có định dạng timestamp `[HH:MM:SS]`.
     * Nút **💾 Tải .log**: Xuất file `.log` về máy tính.
     * Nút **↗️ Mở tab mới**: Mở trang `log.html` toàn màn hình.
  5. Kiểm tra Realtime Sync: Khi background ghi log mới, cả Side Panel và `log.html` tự động cập nhật ngay lập tức qua `chrome.storage.onChanged`.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Checkbox "Tự cuộn" luôn cuộn xuống đáy khi có log mới.
  * Không bao giờ bị đơ giao diện khi số lượng log lên đến hàng trăm dòng.

---

### 🔹 SUITE 9: KIỂM THỬ ĐỘ BỀN, ALARM KEEPALIVE & PHỤC HỒI (RESILIENCE)

* **Mục tiêu:** Đảm bảo Service Worker MV3 không bị Chrome ngắt sau 30s và hệ thống phục hồi hoàn hảo khi tạm dừng hoặc mất mạng.
* **Các bước thực hiện:**
  1. Kiểm tra Alarm Keepalive:
     ```javascript
     chrome.alarms.get('research-keepalive', (alarm) => console.log('Keepalive active:', !!alarm));
     ```
  2. Kiểm tra State Persistence (Stop / Resume):
     * Khi đang chạy ở Page thứ 4 $\rightarrow$ bấm **⏹ Stop**.
     * Kiểm tra trạng thái lưu: `status === 'STOPPED'`, các chỉ số `currentKeywordIndex`, `currentPageIndex` được bảo toàn.
     * Bấm **↻ Resume**: Quá trình tiếp tục chạy từ đúng Page đang dang dở, không quét lại từ đầu.
  3. Kiểm tra Hàng đợi gửi bù (`pendingSheetWrites`):
     * Giả lập mất kết nối mạng khi đang gửi Sheets $\rightarrow$ bản ghi được đưa vào `pendingSheetWrites`.
     * Khi mạng phục hồi hoặc khi kết thúc quét $\rightarrow$ extension tự động flush gửi bù toàn bộ bản ghi tồn đọng.
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * Không bao giờ bị mất dữ liệu tiến trình giữa chừng.
  * Service Worker duy trì trạng thái liên tục qua các chu kỳ keepalive 25s.

---

### 🔹 SUITE 10: RÀ SOÁT MÃ NGUỒN CHUẨN ECC (RUNTIME, SYNTAXERROR & AN TOÀN NẠP SCRIPT)

* **Mục tiêu:** Quét toàn bộ codebase để đảm bảo không có lỗi `SyntaxError` khi nạp lại extension, không có `ReferenceError` ngầm và diệt sạch bẫy lỗi im lặng.
* **Các bước thực hiện:**
  1. **Kiểm tra chống lỗi SyntaxError do khai báo trùng lặp:**
     * Toàn bộ các biến toàn cục trong `selectors.js` và `content_fb.js` (như `SELECTORS`, `FB_GRAPHQL_DOC_ID`) phải sử dụng từ khóa `var` kết hợp `globalThis` (`var SELECTORS = globalThis.SELECTORS || { ... }`).
     * Tuyệt đối không dùng `const` hoặc `let` ở phạm vi ngoài cùng (top-level) trong các file content script được inject nhiều lần.
  2. **Cơ chế ping `CHECK_READY` trong `injectContentScript`:**
     * Trong `background.js`, hàm `injectContentScript` gửi message ping `{ type: 'CHECK_READY' }` đến tab trước.
     * Nếu tab đã có content script đang chạy $\rightarrow$ bỏ qua không inject đè.
     * Nếu chưa có $\rightarrow$ mới thực hiện `chrome.scripting.executeScript`.
  3. **Kiểm tra khai báo các hàm tiện ích thời gian:**
     * `function sleep(ms)` phải được khai báo chuẩn trong cả `background.js` và `content_fb.js`.
     * `function sleepRandom(minSec, maxSec)` hoạt động chuẩn xác.
  4. **Kiểm tra an toàn cho Google Sheet Webhook trong [`Code.gs`](file:///f:/Clone-shopify/fb-ads-research-extension/Code.gs):**
     * Biến `SPREADSHEET_ID` được gán ID chính xác `'186rhrVieyBJztWzKiDTwkf6Q-H3Zh8yWsfHgkfqQ28c'`.
     * Có khối kiểm tra an toàn `if (!ss)` trước khi gọi `getSheetByName`, ngăn ngừa 100% lỗi `Cannot read properties of null`.
  5. **Chạy bộ kiểm thử tự động:**
     ```bash
     node f:/Clone-shopify/fb-ads-research-extension/.ecc/eval-harness.js
     ```
* **Tiêu chuẩn nghiệm thu (Pass Criteria):**
  * **32/32 tiêu chí PASS 100%.**
  * Số lượng catch block rỗng: **0** (Zero empty catch blocks).
  * Cú pháp JavaScript hợp lệ (`node -c` không báo lỗi trên mọi file).

---

## 🔄 4. QUY TRÌNH PHÁT HIỆN LỖI & TỰ SỬA LỖI (SELF-HEALING PROTOCOL)

Khi phát hiện bất kỳ bài test nào bị **FAIL**:

```
[BƯỚC 1: CÔ LẬP LỖI]
    │  Đọc log console, trích xuất Stack Trace, kiểm tra logfile runtime
    ▼
[BƯỚC 2: TÁI HIỆN BẰNG SCRATCH SCRIPT]
    │  Tạo scratch test trong .ecc/ hoặc chạy dòng lệnh đơn để cô lập nguyên nhân
    ▼
[BƯỚC 3: SỬA MÃ NGUỒN TẬN GỐC]
    │  Chỉnh sửa file tương ứng (background.js / content_fb.js / selectors.js / popup.js / Code.gs)
    │  TUYỆT ĐỐI KHÔNG dùng timeout bừa bãi hoặc try/catch che giấu lỗi
    ▼
[BƯỚC 4: BỔ SUNG VÀO EVAL HARNESS]
    │  Thêm test case gây lỗi vào .ecc/eval-harness.js để chống tái phát (Regression Guard)
    ▼
[BƯỚC 5: KIỂM TRA HỒI QUY TOÀN BỘ]
    │  Chạy lại node .ecc/eval-harness.js đảm bảo 32/32 tests đều PASS
    ▼
[BƯỚC 6: COMMIT, PUSH GIT VÀ BÁO CÁO MINH CHỨNG]
```

---

## 🏆 5. CHECKLIST ĐÁNH GIÁ CUỐI CÙNG TRƯỚC KHI BÀN GIAO

- [ ] Extension hiển thị dạng **Chrome Side Panel** bên phải màn hình khi click icon trên toolbar.
- [ ] Giao diện chia tách mạch lạc: **🎯 Tiêu chuẩn sàng lọc (2 Cổng)** và **⚡ Thu thập & Vận hành (100% API)**.
- [ ] Đã **xóa bỏ hoàn toàn ô "Tối đa lần cuộn"**, `Số lượng Page thu thập` mặc định là `⚡ Toàn bộ (Không giới hạn)`.
- [ ] Tab Mẹ tìm kiếm từ khóa được giữ mở liên tục, **không bao giờ bị đóng** khi tìm kiếm xong.
- [ ] Tự động làm sạch dấu ngoặc kép thừa trong từ khóa và chuẩn hóa enum `sortData.mode` cho GraphQL schema.
- [ ] Tích hợp bộ **Fallback 4 Tầng thông minh**: Exact $\rightarrow$ Unordered $\rightarrow$ Bỏ lọc ngày $\rightarrow$ mediaType=all để không bao giờ bị 0 kết quả ngoài ý muốn.
- [ ] Ghi chuẩn dòng log: `[INFO] 📋 Tìm thấy tất cả xxx Page hàng đầu cho "<từ khóa>"`.
- [ ] Tab Con của từng Page được mở riêng; đóng ngay khi rớt Cổng 1 hoặc Cổng 2; giữ nguyên khi đạt chuẩn để crawl ads và upload Google Sheet.
- [ ] Chuẩn hóa chữ thường cho mọi tham số bộ lọc trên URL (`media_type=video`, `publisher_platforms[0]=facebook`) tránh việc Facebook Ads Library bỏ qua bộ lọc và hiển thị sai tổng số ads (110 thay vì 64).
- [ ] Ngăn chặn triệt để bẫy đọc nhầm DOM active cho inactive gây tụt Active Ratio về 50.0% giả lập.
- [ ] Đồng bộ toàn bộ cấu hình bộ lọc (`mediaType`, `publisherPlatform`, `startDateMin`) vào mọi truy vấn Meta GraphQL.
- [ ] Hiển thị đầy đủ chuỗi URL không bị cắt ngắn trên bảng log khi mở tab.
- [ ] Đồng bộ Cột F (`Link Post Ads`) trên Google Sheet hiển thị đường link **iNote (`https://inote.net/<id>`)** gom sạch toàn bộ chiến dịch đang hoạt động của Page.
- [ ] Định dạng link chiến dịch trong iNote bảo toàn chuẩn `https://l.facebook.com/l.php?u=...` kèm toàn bộ tracking parameters nguyên bản (`fbclid`, `h`, `aem`).
- [ ] Cơ chế lặp phân trang GraphQL qua `page_info.end_cursor` & `has_next_page` cào đủ 100% chiến dịch của Page (đã kiểm định cào đủ 184 ads cho DallasWind US).
- [ ] Tích hợp nút **`🗑️ Xóa sạch dữ liệu Google Sheet`** (`CLEAR_ALL`) trực tiếp trong Cài đặt extension để reset sheet tiện lợi.
- [ ] Tuyệt đối **không phát sinh SyntaxError** `Identifier has already been declared` khi nạp lại extension nhờ cơ chế ping `CHECK_READY` và `globalThis`.
- [ ] Hàm `sleep(ms)` và `sleepRandom()` hoạt động trơn tru trong background, không phát sinh `sleep is not defined`.
- [ ] Google Apps Script Webhook hoạt động ổn định với `SPREADSHEET_ID` chuẩn, định dạng cột Active Ratio `%` tại Cột 10 chuẩn chỉ.
- [ ] Bộ kiểm thử `.ecc/eval-harness.js` đạt điểm tuyệt đối **43/43 PASS**.
