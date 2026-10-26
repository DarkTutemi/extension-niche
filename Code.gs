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

// ── TÊN SHEET LƯU DỮ LIỆU ──────────────────────────────────────────
const SHEET_NAME = 'FB_Ads_Research';

// ── CẤU HÌNH LIÊN KẾT GOOGLE SHEET ──────────────────────────────────
// - Nếu tạo Apps Script từ trong Google Sheet (Tiện ích mở rộng -> Apps Script): ĐỂ TRỐNG ''.
// - Nếu tạo Apps Script độc lập (Standalone) từ script.google.com: Dán ID của Google Sheet vào đây.
//   (ID là chuỗi ký tự giữa /d/ và /edit trong link Google Sheet)
const SPREADSHEET_ID = '';

// ── CỘT DỮ LIỆU CHUẨN HÓA ──────────────────────────────────────────
const HEADERS = [
  'STT',
  'Ngách',
  'Keyword',
  'Page ID',
  'Tên Page',
  'Link Post Ads',
  'Link Website',
  'Active Ads',
  'Inactive Ads',
  'Active Ratio',
  'Số sản phẩm',
  'Nguồn đếm SP',
  'Ngày kiểm tra',
  'Trạng thái'
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
    'https://www.facebook.com/ads/library/?id=104376421493890',
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
  sheet.getRange(sheet.getLastRow(), 10).setNumberFormat('0.0%');
  Logger.log('✅ THÀNH CÔNG: Đã ghi thử 1 dòng vào Sheet: ' + ss.getName());
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

    const data = payload.data;
    if (!data || !data.pageId || !data.keyword) {
      return createJsonResponse({ 
        ok: false, 
        error: 'Dữ liệu thiếu thông tin bắt buộc (pageId hoặc keyword).' 
      }, 400);
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

    // 7. Chuẩn bị hàng dữ liệu để ghi
    let stt = existingRowIndex > 0 ? sheet.getRange(existingRowIndex, 1).getValue() : lastRow;
    const ratioValue = typeof data.activeRatio === 'number' ? data.activeRatio : 0;

    const rowValues = [
      stt,                                     // STT
      data.niche || 'N/A',                     // Ngách
      data.keyword || '',                      // Keyword
      "'" + String(data.pageId),               // Page ID (dạng text chống mất số 0)
      data.pageName || '',                     // Tên Page
      data.postUrl || '',                      // Link Post Ads
      data.websiteUrl || '',                   // Link Website
      data.activeCount !== null ? data.activeCount : 0,     // Active Ads
      data.inactiveCount !== null ? data.inactiveCount : 0, // Inactive Ads
      ratioValue,                              // Active Ratio (số thập phân)
      data.productCount !== null ? data.productCount : 0,   // Số sản phẩm
      data.productSource || 'N/A',             // Nguồn đếm SP
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
    // Cột J (cột 10) = Active Ratio định dạng %
    sheet.getRange(existingRowIndex, 10).setNumberFormat('0.0%');

    return createJsonResponse({
      ok: true,
      action: actionTaken,
      row: existingRowIndex,
      pageId: data.pageId,
      pageName: data.pageName
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
 * Helper tạo output phản hồi JSON chuẩn
 */
function createJsonResponse(obj, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
