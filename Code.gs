/**
 * Code.gs – Google Apps Script Webhook tiếp nhận dữ liệu nghiên cứu sản phẩm
 * =========================================================================
 * Nhận POST JSON từ Chrome Extension FB Ads Product Research,
 * kiểm tra SECRET_KEY, chống ghi trùng theo (Page ID + Keyword),
 * tự tăng STT và ghi dữ liệu có cấu trúc vào Google Sheet.
 *
 * CÁCH TRIỂN KHAI (DEPLOY):
 * 1. Mở Google Sheet mới -> Tiện ích mở rộng (Extensions) -> Apps Script.
 * 2. Dán toàn bộ nội dung file này vào editor.
 * 3. Chạy hàm `setupSecretKey()` một lần để đặt Secret Key (hoặc cài trong Cài đặt dự án -> Thuộc tính tập lệnh).
 * 4. Bấm "Triển khai" (Deploy) -> "Tùy chọn triển khai mới" (New deployment).
 *    - Loại: Ứng dụng web (Web App)
 *    - Thực thi dưới dạng (Execute as): Tôi (Me)
 *    - Ai có quyền truy cập (Who has access): Bất kỳ ai (Anyone)
 * 5. Sao chép "URL ứng dụng web" (Web App URL) và dán vào Popup Extension.
 */

// ── TÊN SHEET LƯU DỮ LIỆU STORE & CHI TIẾT ADS CREATIVES ─────────────
const SHEET_NAME = 'FB_Ads_Research';
const CREATIVES_SHEET_NAME = 'FB_Ads_Creatives';

// ── CẤU HÌNH LIÊN KẾT GOOGLE SHEET ──────────────────────────────────
// - Nếu tạo Apps Script từ trong Google Sheet (Tiện ích mở rộng -> Apps Script): ĐỂ TRỐNG ''.
// - Nếu tạo Apps Script độc lập (Standalone) từ script.google.com: Dán ID của Google Sheet vào đây.
//   (ID là chuỗi ký tự giữa /d/ và /edit trong link Google Sheet)
const SPREADSHEET_ID = '186rhrVieyBJztWzKiDTwkf6Q-H3Zh8yWsfHgkfqQ28c';

// ── CỘT DỮ LIỆU CHUẨN HÓA STORE ─────────────────────────────────────
const HEADERS = [
  'STT',
  'Ngách',
  'Keyword',
  'Page ID',
  'Tên Page',
  'Link Website',
  'Active Ads',
  'Inactive Ads',
  'Active Ratio',
  'Số sản phẩm',
  'Nguồn đếm SP',
  'Ngày kiểm tra',
  'Trạng thái'
];

// ── CỘT DỮ LIỆU CHUẨN HÓA CHI TIẾT ADS CREATIVES (CHUẨN APPSHEET) ───
const CREATIVE_HEADERS = [
  'STT',
  'Page ID',
  'Tên Page',
  'Ad ID',
  'Dạng bài (Media)',
  'Nút CTA',
  'Loại CTA',
  'Link Sản Phẩm (Ads URL)',
  'Link Thư Viện FB',
  'Tiêu đề Quảng Cáo',
  'Nội dung tóm tắt',
  'Ngày kiểm tra'
];

/**
 * Hàm hỗ trợ thiết lập SECRET_KEY nhanh trong Script Properties
 * Chạy hàm này 1 lần trong Apps Script Editor để đặt key bảo mật
 */
function setupSecretKey() {
  const defaultKey = 'my_super_secret_key_2026'; // Đổi thành key tùy chọn của bạn
  PropertiesService.getScriptProperties().setProperty('SECRET_KEY', defaultKey);
  Logger.log('Đã lưu SECRET_KEY thành công: ' + defaultKey);
}

/**
 * Hàm kiểm tra kết nối và ghi thử trực tiếp từ Apps Script Editor
 * Bấm chọn hàm này trên thanh công cụ và bấm 'Chạy' (Run) để kiểm tra & cấp quyền
 */
function testDirectWrite() {
  setupSecretKey();
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss && typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID.trim()) {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (e) {
      Logger.log('❌ Lỗi mở Sheet: ' + e.message);
      throw e;
    }
  }
  if (!ss) {
    throw new Error('Chưa tìm thấy Sheet! Nếu dùng script độc lập, vui lòng điền SPREADSHEET_ID ở dòng 26.');
  }
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    initSheetHeader(sheet);
  }
  const testRow = [
    sheet.getLastRow(),
    'Pet',
    'dog calming bed',
    '104376421493890',
    'Muddy Mat (Test Kết Nối)',
    'https://muddymats.com',
    22,
    1,
    0.957,
    96,
    'Shopify JSON',
    new Date(),
    'PASS'
  ];
  sheet.appendRow(testRow);
  sheet.getRange(sheet.getLastRow(), 9).setNumberFormat('0.0%');
  Logger.log('✅ THÀNH CÔNG: Đã ghi thử 1 dòng vào Sheet: ' + ss.getName());
}

/**
 * Hàm xóa toàn bộ dữ liệu trên cả 2 sheet và khởi tạo lại tiêu đề mới
 * Chạy hàm này trực tiếp trong Apps Script Editor để dọn sạch bảng tính
 */
function clearAllData() {
  setupSecretKey();
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss && typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID.trim()) {
    try {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (e) {
      Logger.log('❌ Lỗi mở Sheet: ' + e.message);
      throw e;
    }
  }
  if (!ss) {
    throw new Error('Chưa tìm thấy Sheet! Nếu dùng script độc lập, vui lòng điền SPREADSHEET_ID ở dòng 26.');
  }

  let sheet1 = ss.getSheetByName(SHEET_NAME);
  if (sheet1) {
    sheet1.clear();
    initSheetHeader(sheet1);
    Logger.log('✅ Đã clear dữ liệu và reset tiêu đề sheet: ' + SHEET_NAME);
  }

  let sheet2 = ss.getSheetByName(CREATIVES_SHEET_NAME);
  if (sheet2) {
    sheet2.clear();
    initCreativesSheetHeader(sheet2);
    Logger.log('✅ Đã clear dữ liệu và reset tiêu đề sheet: ' + CREATIVES_SHEET_NAME);
  }

  Logger.log('🎉 ĐÃ CLEAR TOÀN BỘ DỮ LIỆU THÀNH CÔNG!');
}

/**
 * Xử lý yêu cầu POST gửi từ Chrome Extension
 */
function doPost(e) {
  // 1. Sử dụng LockService để chống xung đột khi có nhiều request đồng thời
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(30000); // Đợi tối đa 30 giây

  if (!hasLock) {
    return createJsonResponse({
      ok: false,
      error: 'Hệ thống đang bận ghi dữ liệu, vui lòng thử lại sau.'
    }, 429);
  }

  try {
    // 2. Parse dữ liệu đầu vào
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ ok: false, error: 'Thiếu dữ liệu POST body' }, 400);
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({ ok: false, error: 'Dữ liệu không đúng định dạng JSON: ' + parseErr.message }, 400);
    }

    // 3. Kiểm tra xác thực SECRET_KEY
    const storedSecret = PropertiesService.getScriptProperties().getProperty('SECRET_KEY');
    if (!storedSecret) {
      return createJsonResponse({ 
        ok: false, 
        error: 'Chưa cấu hình SECRET_KEY trên Google Apps Script (chạy hàm setupSecretKey trước).' 
      }, 500);
    }

    if (!payload.secretKey || payload.secretKey !== storedSecret) {
      return createJsonResponse({ 
        ok: false, 
        error: 'Xác thực thất bại: SECRET_KEY không hợp lệ.' 
      }, 401);
    }

    // 4. Mở hoặc tạo Sheet đích (hỗ trợ cả Script container-bound và Standalone)
    let ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss && typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID.trim()) {
      try {
        ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
      } catch (err) {
        return createJsonResponse({ 
          ok: false, 
          error: 'Không thể mở Google Sheet với SPREADSHEET_ID: ' + err.message 
        }, 500);
      }
    }
    if (!ss) {
      const propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      if (propId && propId.trim()) {
        try {
          ss = SpreadsheetApp.openById(propId.trim());
        } catch (err) {
          return createJsonResponse({ 
            ok: false, 
            error: 'Không thể mở Google Sheet với Script Property SPREADSHEET_ID: ' + err.message 
          }, 500);
        }
      }
    }
    if (!ss) {
      return createJsonResponse({ 
        ok: false, 
        error: 'Lỗi: Không tìm thấy Google Sheet liên kết! Nếu script tạo từ script.google.com, vui lòng điền SPREADSHEET_ID ở dòng 26 trong Code.gs hoặc tạo Apps Script từ trong Google Sheet (Tiện ích mở rộng -> Apps Script).' 
      }, 500);
    }

    // ── XỬ LÝ LỆNH CLEAR TOÀN BỘ SHEET NẾU CÓ ACTION CLEAR_ALL ──
    if (payload.action === 'CLEAR_ALL' || payload.action === 'CLEAR') {
      let sheet1 = ss.getSheetByName(SHEET_NAME);
      if (sheet1) {
        sheet1.clear();
        initSheetHeader(sheet1);
      }
      let sheet2 = ss.getSheetByName(CREATIVES_SHEET_NAME);
      if (sheet2) {
        sheet2.clear();
        initCreativesSheetHeader(sheet2);
      }
      return createJsonResponse({ 
        ok: true, 
        message: 'Đã clear toàn bộ dữ liệu 2 sheet và reset tiêu đề thành công!' 
      });
    }

    const data = payload.data;
    if (!data || !data.pageId || !data.keyword) {
      return createJsonResponse({ 
        ok: false, 
        error: 'Dữ liệu thiếu thông tin bắt buộc (pageId hoặc keyword).' 
      }, 400);
    }

    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // 5. Khởi tạo Header nếu sheet còn trống
    if (sheet.getLastRow() === 0) {
      initSheetHeader(sheet);
    }

    // 6. Kiểm tra chống ghi trùng theo khóa: (Page ID + Keyword)
    // Cột C = Keyword (cột 3), Cột D = Page ID (cột 4)
    const lastRow = sheet.getLastRow();
    let existingRowIndex = -1;

    if (lastRow > 1) {
      const existingData = sheet.getRange(2, 3, lastRow - 1, 2).getValues(); // lấy cột C và D
      for (let i = 0; i < existingData.length; i++) {
        const rowKeyword = String(existingData[i][0]).trim().toLowerCase();
        const rowPageId = String(existingData[i][1]).trim();

        if (rowPageId === String(data.pageId).trim() && rowKeyword === String(data.keyword).trim().toLowerCase()) {
          existingRowIndex = i + 2; // hàng thật trong sheet (bắt đầu từ hàng 2)
          break;
        }
      }
    }

    // 7. Chuẩn bị hàng dữ liệu để ghi (tương thích đa năng với mọi định dạng gửi từ Extension & Script)
    let stt = existingRowIndex > 0 ? sheet.getRange(existingRowIndex, 1).getValue() : lastRow;
    
    // Xử lý Active Ratio (hỗ trợ cả số thập phân 0.957, số phần trăm 95.7, hoặc chuỗi '95.7%')
    let ratioValue = 0;
    if (typeof data.activeRatio === 'number') {
      ratioValue = data.activeRatio > 1 ? data.activeRatio / 100 : data.activeRatio;
    } else if (typeof data.ratio === 'number') {
      ratioValue = data.ratio > 1 ? data.ratio / 100 : data.ratio;
    } else if (typeof data.ratio === 'string') {
      const parsed = parseFloat(data.ratio.replace('%', '').trim());
      ratioValue = isNaN(parsed) ? 0 : parsed / 100;
    } else if (typeof data.activeRatio === 'string') {
      const parsed = parseFloat(data.activeRatio.replace('%', '').trim());
      ratioValue = isNaN(parsed) ? 0 : parsed / 100;
    }

    const activeVal = data.activeCount != null ? data.activeCount : (data.activeAds != null ? data.activeAds : 0);
    const inactiveVal = data.inactiveCount != null ? data.inactiveCount : (data.inactiveAds != null ? data.inactiveAds : 0);
    const productVal = data.productCount != null ? data.productCount : (data.productsCount != null ? data.productsCount : 0);
    const sourceVal = data.productSource || (data.isShopify ? 'Shopify JSON' : 'Sitemap') || 'N/A';

    const rowValues = [
      stt,                                     // STT
      data.niche || 'N/A',                     // Ngách
      data.keyword || '',                      // Keyword
      "'" + String(data.pageId),               // Page ID (dạng text chống mất số 0)
      data.pageName || '',                     // Tên Page
      data.websiteUrl || '',                   // Link Website
      activeVal,                               // Active Ads
      inactiveVal,                             // Inactive Ads
      ratioValue,                              // Active Ratio (số thập phân)
      productVal,                              // Số sản phẩm
      sourceVal,                               // Nguồn đếm SP
      data.checkedAt || new Date().toLocaleString('vi-VN'), // Ngày kiểm tra
      data.status || 'PASS'                    // Trạng thái
    ];

    let actionTaken = 'INSERTED';

    if (existingRowIndex > 0) {
      // Đã tồn tại -> CẬP NHẬT đè dòng cũ
      sheet.getRange(existingRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      actionTaken = 'UPDATED';
    } else {
      // Chưa tồn tại -> THÊM dòng mới vào cuối
      sheet.appendRow(rowValues);
      existingRowIndex = sheet.getLastRow();
    }

    // 8. Định dạng số hiển thị cho dòng vừa ghi
    // Cột I (cột 9) = Active Ratio định dạng %
    sheet.getRange(existingRowIndex, 9).setNumberFormat('0.0%');

    // 9. Xử lý ghi chi tiết toàn bộ Ads Creatives vào tab FB_Ads_Creatives (chuẩn AppSheet)
    let creativesCount = 0;
    if (data.ads && Array.isArray(data.ads) && data.ads.length > 0) {
      let cSheet = ss.getSheetByName(CREATIVES_SHEET_NAME);
      if (!cSheet) {
        cSheet = ss.insertSheet(CREATIVES_SHEET_NAME);
      }
      if (cSheet.getLastRow() === 0) {
        initCreativeSheetHeader(cSheet);
      }

      const cLastRow = cSheet.getLastRow();
      const existingAdMap = new Map();
      if (cLastRow > 1) {
        const existingData = cSheet.getRange(2, 4, cLastRow - 1, 1).getValues(); // Cột D = Ad ID
        for (let i = 0; i < existingData.length; i++) {
          const aId = String(existingData[i][0]).trim();
          if (aId) existingAdMap.set(aId, i + 2);
        }
      }

      const newRows = [];
      for (const ad of data.ads) {
        const adIdStr = String(ad.adId || ad.adArchiveId || '').trim();
        if (!adIdStr) continue;

        const existingRow = existingAdMap.get(adIdStr);
        const rowData = [
          existingRow || (cLastRow + newRows.length + 1),
          "'" + String(data.pageId),
          data.pageName || '',
          "'" + adIdStr,
          ad.mediaFormat || (ad.videos?.length ? 'VIDEO' : 'IMAGE'), // VIDEO / IMAGE / CAROUSEL
          ad.ctaText || 'Mua ngay',                                  // Nút CTA: Mua ngay, Đăng ký...
          ad.ctaType || 'SHOP_NOW',                                  // Mã CTA: SHOP_NOW, SIGN_UP...
          ad.destinationUrl || ad.linkUrl || '',                     // Link sản phẩm (Ads URL)
          ad.adLibraryUrl || `https://www.facebook.com/ads/library/?id=${adIdStr}`,
          ad.title || '',
          ad.body ? String(ad.body).slice(0, 300) : '',
          data.checkedAt || new Date().toLocaleString('vi-VN')
        ];

        if (existingRow) {
          cSheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
        } else {
          newRows.push(rowData);
          existingAdMap.set(adIdStr, cLastRow + newRows.length);
        }
        creativesCount++;
      }

      if (newRows.length > 0) {
        cSheet.getRange(cLastRow + 1, 1, newRows.length, CREATIVE_HEADERS.length).setValues(newRows);
      }
    }

    return createJsonResponse({
      ok: true,
      action: actionTaken,
      row: existingRowIndex,
      pageId: data.pageId,
      pageName: data.pageName,
      creativesRecorded: creativesCount
    });

  } catch (err) {
    return createJsonResponse({
      ok: false,
      error: 'Lỗi server Apps Script: ' + err.message
    }, 500);
  } finally {
    // Giải phóng lock
    lock.releaseLock();
  }
}

/**
 * Xử lý yêu cầu GET để kiểm tra trạng thái hoạt động của Web App
 */
function doGet(e) {
  return ContentService.createTextOutput(
    'FB Ads Research Webhook đang hoạt động bình thường! Vui lòng dùng phương thức POST để gửi dữ liệu.'
  ).setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Tạo Header và định dạng giao diện chuyên nghiệp cho Sheet
 */
function initSheetHeader(sheet) {
  // Thêm Header
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

  // Định dạng Header: Nền xanh tối #1e293b, chữ trắng, in đậm, căn giữa
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setBackground('#1e293b')
             .setFontColor('#ffffff')
             .setFontWeight('bold')
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle');

  sheet.setRowHeight(1, 35);
  sheet.setFrozenRows(1); // Cố định dòng 1 khi cuộn

  // Tự động căn chỉnh độ rộng cột
  for (let c = 1; c <= HEADERS.length; c++) {
    sheet.autoResizeColumn(c);
  }
}

/**
 * Tạo Header cho Sheet Chi Tiết Ads Creatives (dành cho AppSheet)
 */
function initCreativeSheetHeader(sheet) {
  sheet.getRange(1, 1, 1, CREATIVE_HEADERS.length).setValues([CREATIVE_HEADERS]);
  const headerRange = sheet.getRange(1, 1, 1, CREATIVE_HEADERS.length);
  headerRange.setBackground('#0f172a') // Slate 900
             .setFontColor('#38bdf8') // Sky blue text
             .setFontWeight('bold')
             .setHorizontalAlignment('center')
             .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 35);
  sheet.setFrozenRows(1);
  for (let c = 1; c <= CREATIVE_HEADERS.length; c++) {
    sheet.autoResizeColumn(c);
  }
}

/**
 * Helper tạo output phản hồi JSON chuẩn
 */
function createJsonResponse(obj, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
