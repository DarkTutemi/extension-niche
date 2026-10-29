/**
 * popup.js – Giao diện điều khiển extension FB Ads Product Research
 * ==================================================================
 * Hỗ trợ 3 chế độ ngách: Link iNote, Nhập tay từng ngách, Ngách có sẵn (200 SP).
 * Bộ lọc Ads Library chuyên sâu: Media, Nền tảng, Kiểu tìm kiếm, Sắp xếp,
 * và dropdown Min Date tự động tính từ 1 đến 12 tháng gần nhất.
 */

// ── Dữ liệu keyword đầy đủ từ iNote (50 từ khóa / ngách = 200 SP) ────
const NICHE_KEYWORDS = {
  Beauty: [
    "retinol serum", "hyaluronic acid serum", "vitamin C serum", "niacinamide serum",
    "salicylic acid cleanser", "glycolic acid toner", "face moisturizer dry skin",
    "night cream anti aging", "eye cream dark circles", "sunscreen SPF50",
    "tinted moisturizer", "BB cream", "foundation full coverage", "concealer waterproof",
    "setting spray long lasting", "lip oil", "lip tint", "lip liner", "mascara volume",
    "eyelash serum", "lash clusters", "press on nails", "gel nail strips", "eyebrow pencil",
    "brow gel", "makeup remover balm", "cleansing oil", "acne patch", "pimple patch",
    "blackhead remover", "led light therapy mask", "gua sha", "face roller", "jade roller",
    "hair growth serum", "scalp massager", "anti hair loss shampoo", "dry shampoo",
    "hair oil", "body scrub", "body lotion", "stretch mark cream", "cellulite cream",
    "intimate wash", "teeth whitening strips", "electric toothbrush", "perfume dupe",
    "setting powder", "cream blush", "contour stick"
  ],
  Car: [
    "car air freshener", "car perfume", "steering wheel cover", "car seat cover",
    "car seat gap filler", "car trash can", "car vacuum cleaner", "car organizer",
    "trunk organizer", "car phone holder", "magnetic phone mount", "car charger",
    "dash cam", "car Bluetooth adapter", "car headrest hook", "car sun shade",
    "windshield sun shade", "car window shade", "car floor mats", "car seat cushion",
    "lumbar support car", "neck pillow car", "car cleaning kit", "car wash foam",
    "microfiber cloth car", "car scratch remover", "car wax", "ceramic coating car",
    "tire inflator", "tire pressure gauge", "jump starter", "battery charger car",
    "windshield wipers", "rain repellent", "car cover", "car snow cover",
    "car led lights", "interior ambient light", "chrome garnish", "carbon fiber wrap",
    "car decals", "dicky light", "car door edge guard", "car bumper protector",
    "car dent puller", "car jack", "wheel lock", "car key cover", "pet car seat cover",
    "car emergency kit"
  ],
  Pet: [
    "calming chews for dogs", "dog calming bed", "dog anxiety vest", "lick mat",
    "slow feeder dog bowl", "dog puzzle toy", "interactive cat toy", "indestructible dog toy",
    "dog chew toy", "cat tree tower", "cat tree for large cats", "cat scratching post",
    "cat litter mat", "cat litter box", "self cleaning litter box", "pet hair remover",
    "pet grooming glove", "dog brush", "deshedding tool", "pet hair vacuum",
    "dog shampoo", "cat shampoo", "pet conditioner", "pet dental chew", "dog toothbrush",
    "pet toothpaste", "dog joint supplement", "hip and joint chews", "senior dog mobility aid",
    "dog ramp", "dog stairs", "pet stroller", "dog car seat", "pet carrier backpack",
    "dog harness", "no pull dog harness", "retractable dog leash", "cat harness",
    "pet GPS tracker", "automatic pet feeder", "water fountain for cats", "pet water bottle",
    "pet heating pad", "pet cooling mat", "bird bath copper disc", "ant traps pet safe",
    "pet stain remover", "enzymatic cleaner pet", "dog poop bags", "pet first aid kit"
  ],
  Home: [
    "portable blender", "smoothie blender", "air fryer", "electric spin scrubber",
    "electric brush cleaner", "shower caddy", "shower head filter", "led strip lights",
    "ambient room decor", "solar lights", "sunset lamp", "galaxy projector",
    "cable management", "cable organizer", "desk organizer", "foldable desk",
    "standing desk converter", "ergonomic chair", "lumbar support cushion",
    "meal prep containers", "glass food storage", "reusable glass straws",
    "silicone baking mat", "kitchen scale", "knife sharpener", "vegetable chopper",
    "garlic press", "oil sprayer", "dish drying rack", "sink organizer",
    "garbage disposal cleaner", "drain cleaner", "mold remover", "grout cleaner",
    "cleaning slime", "lint remover", "fabric shaver", "clothes drying rack",
    "vacuum storage bags", "closet organizer", "shoe rack", "under bed storage",
    "laundry hamper", "wall hooks", "adhesive shelves", "blackout curtains",
    "soundproof curtains", "door draft stopper", "ant traps", "pest control indoor"
  ]
};

// ── Tham chiếu DOM ───────────────────────────────────────────────────
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Main Top Navigation
const elTabNavResearch    = $('#tabNavResearch');
const elTabNavLogs        = $('#tabNavLogs');
const elLogCountBadge     = $('#logCountBadge');
const elViewResearch      = $('#viewResearch');
const elViewLogs          = $('#viewLogs');
const elLinkViewAllLogs   = $('#linkViewAllLogs');

// Tab Logfile Elements
const elLogLiveBadge      = $('#logLiveBadge');
const elBtnOpenLogTab     = $('#btnOpenLogTab');
const elStatFullTotal     = $('#statFullTotal');
const elStatFullPass      = $('#statFullPass');
const elStatFullSkip      = $('#statFullSkip');
const elStatFullError     = $('#statFullError');
const elLogLevelFilter    = $('#logLevelFilter');
const elLogSearchInput    = $('#logSearchInput');
const elBtnCopyFullLog    = $('#btnCopyFullLog');
const elBtnExportFullLog  = $('#btnExportFullLog');
const elBtnClearFullLog   = $('#btnClearFullLog');
const elCheckAutoScroll   = $('#checkAutoScroll');
const elFullLogPanel      = $('#fullLogPanel');

// State tab chính & log cache
let currentNavTab = 'research'; // 'research' | 'logs'
let cachedLogs = [];

// Chế độ ngách
let currentNicheMode = 'inote'; // 'inote' | 'manual' | 'builtin'

const elTabInote          = $('#tabInote');
const elTabManual         = $('#tabManual');
const elTabBuiltin        = $('#tabBuiltin');

const elPanelInote        = $('#panelInote');
const elPanelManual       = $('#panelManual');
const elPanelNicheSelect  = $('#panelNicheSelect');
const elChipsSection      = $('#chipsSection');

const elInoteUrl          = $('#inoteUrl');
const elBtnFetchInote     = $('#btnFetchInote');
const elInoteStatus       = $('#inoteStatus');

const elManualNicheName   = $('#manualNicheName');
const elManualKeywordsText = $('#manualKeywordsText');

const elBtnSelectAllChips = $('#btnSelectAllChips');
const elBtnDeselectAllChips = $('#btnDeselectAllChips');

const elNiche             = $('#niche');
const elCountry           = $('#country');
const elChips             = $('#keywordChips');
const elChipCount         = $('#chipCount');
const elCustomKeyword     = $('#customKeyword');

const elConfigToggle      = $('#configToggle');
const elConfigArrow       = $('#configArrow');
const elConfigBody        = $('#configBody');

const elBtnStart          = $('#btnStart');
const elBtnStop           = $('#btnStop');
const elBtnResume         = $('#btnResume');
const elBtnClearLog       = $('#btnClearLog');

const elProgressSection   = $('#progressSection');
const elStatusBadge       = $('#statusBadge');
const elCurrentKeyword    = $('#currentKeyword');
const elCurrentPage       = $('#currentPage');
const elProgressText      = $('#progressText');
const elPassCount         = $('#passCount');
const elSkipCount         = $('#skipCount');
const elErrorCount        = $('#errorCount');
const elLogPanel          = $('#logPanel');

// Bộ lọc nâng cao & Cấu hình
const elMinMonthsAgo      = $('#minMonthsAgo');
const elMinDateDisplay    = $('#minDateDisplay');
const elStartDateMin      = $('#startDateMin');

const configInputs = {
  activeThreshold:   $('#activeThreshold'),
  minProducts:       $('#minProducts'),
  maxPages:          $('#maxPages'),
  delayMin:          $('#delayMin'),
  delayMax:          $('#delayMax'),
  tabType:           $('#tabType'),
  sheetsUrl:         $('#sheetsUrl'),
  secretKey:         $('#secretKey'),
  mediaType:         $('#mediaType'),
  publisherPlatform: $('#publisherPlatform'),
  searchType:        $('#searchType'),
  sortMode:          $('#sortMode'),
  crawlerEngine:     $('#crawlerEngine'),
};

// State cục bộ
let selectedKeywords = new Set();

// ══════════════════════════════════════════════════════════════════════
//  TÍNH TOÁN NGÀY TỰ ĐỘNG (MIN DATE DROPDOWN: 1 - 12 THÁNG)
// ══════════════════════════════════════════════════════════════════════

function calculateMonthsAgoDate(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function updateMinDateUI() {
  const val = elMinMonthsAgo.value;
  if (val === '0') {
    elStartDateMin.value = '';
    elStartDateMin.style.display = 'none';
    elMinDateDisplay.textContent = '📅 Tất cả thời gian (Không giới hạn)';
  } else if (val === 'custom') {
    elStartDateMin.style.display = 'block';
    if (!elStartDateMin.value) {
      elStartDateMin.value = calculateMonthsAgoDate(3);
    }
    const parts = elStartDateMin.value.split('-');
    if (parts.length === 3) {
      elMinDateDisplay.textContent = `📅 Chạy từ: ${parts[2]}/${parts[1]}/${parts[0]} (Tùy chọn)`;
    }
  } else {
    const months = parseInt(val, 10);
    const dateStr = calculateMonthsAgoDate(months);
    elStartDateMin.value = dateStr;
    elStartDateMin.style.display = 'none';
    const [y, m, d] = dateStr.split('-');
    elMinDateDisplay.textContent = `📅 Chạy từ: ${d}/${m}/${y} (${months} tháng gần nhất)`;
  }
}

// ══════════════════════════════════════════════════════════════════════
//  PARSE VÀ NẠP DỮ LIỆU TỪ INOTE
// ══════════════════════════════════════════════════════════════════════

function parseInoteText(rawText) {
  const niches = {};
  let currentNiche = 'Chung';
  const lines = rawText.split('\n');

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const cleanTitle = line
        .replace(/^[#\s]+/, '')
        .replace(/—.*$/, '')
        .replace(/[-–].*$/, '')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .trim();

      if (cleanTitle) {
        currentNiche = cleanTitle;
        if (!niches[currentNiche]) niches[currentNiche] = [];
      }
      continue;
    }

    const kwMatch = line.match(/^\d+[\.\)]\s*(.+)$/) || line.match(/^[-*•]\s*(.+)$/);
    const kw = kwMatch ? kwMatch[1].trim() : line;
    if (kw && kw.length > 1 && !kw.startsWith('#')) {
      if (!niches[currentNiche]) niches[currentNiche] = [];
      niches[currentNiche].push(kw);
    }
  }
  return niches;
}

async function fetchAndApplyInote(url) {
  if (!url) return;
  elInoteStatus.textContent = '⏳ Đang tải dữ liệu từ iNote...';
  try {
    let html = '';
    // Thử gửi qua background script trước (hưởng full quyền mạng không bị CORS)
    if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'FETCH_INOTE',
          payload: { url },
        });
        if (resp && resp.ok && resp.html) {
          html = resp.html;
        }
      } catch (bgErr) {
        console.debug('[Popup] Background fetch bypass fallback:', bgErr.message);
      }
    }

    if (!html) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    }

    const match = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
    const rawText = match ? match[1] : html;

    const parsedNiches = parseInoteText(rawText);
    const nicheNames = Object.keys(parsedNiches);
    if (nicheNames.length === 0) throw new Error('Không tìm thấy tiêu đề ngách (#) trong iNote');

    // Cập nhật NICHE_KEYWORDS
    for (const [name, kws] of Object.entries(parsedNiches)) {
      NICHE_KEYWORDS[name] = kws;
    }

    // Cập nhật select #niche
    elNiche.innerHTML = '';
    let totalKw = 0;
    for (const name of nicheNames) {
      const count = NICHE_KEYWORDS[name].length;
      totalKw += count;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = `${name} (${count} từ khóa)`;
      elNiche.appendChild(opt);
    }

    elInoteStatus.textContent = `✅ Đã nạp ${nicheNames.length} ngách (${totalKw} từ khóa) từ iNote`;
    elNiche.value = nicheNames[0];
    renderChips(nicheNames[0]);
    saveConfig();
  } catch (err) {
    elInoteStatus.textContent = `⚠️ Lỗi tải: ${err.message}. Đang dùng bộ 200 từ khóa có sẵn.`;
    console.debug('[Popup] inote fetch error:', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  CHUYỂN ĐỔI CHẾ ĐỘ NGÁCH (INOTE / MANUAL / BUILTIN)
// ══════════════════════════════════════════════════════════════════════

function switchNicheMode(mode) {
  currentNicheMode = mode;
  [elTabInote, elTabManual, elTabBuiltin].forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  if (mode === 'inote') {
    elPanelInote.style.display = 'block';
    elPanelManual.style.display = 'none';
    elPanelNicheSelect.style.display = 'flex';
    elChipsSection.style.display = 'block';
    renderChips(elNiche.value || 'Beauty');
  } else if (mode === 'manual') {
    elPanelInote.style.display = 'none';
    elPanelManual.style.display = 'block';
    elPanelNicheSelect.style.display = 'none';
    elChipsSection.style.display = 'none';
  } else if (mode === 'builtin') {
    elPanelInote.style.display = 'none';
    elPanelManual.style.display = 'none';
    elPanelNicheSelect.style.display = 'flex';
    elChipsSection.style.display = 'block';
    // Đảm bảo ngách mặc định hiển thị
    if (!elNiche.value) elNiche.value = 'Beauty';
    renderChips(elNiche.value);
  }
  saveConfig();
}

// ══════════════════════════════════════════════════════════════════════
//  CHUYỂN ĐỔI TAB CHÍNH (THIẾT LẬP / LOGFILE)
// ══════════════════════════════════════════════════════════════════════

function switchNavTab(tab) {
  currentNavTab = tab;
  elTabNavResearch.classList.toggle('active', tab === 'research');
  elTabNavLogs.classList.toggle('active', tab === 'logs');

  if (tab === 'research') {
    elViewResearch.style.display = 'block';
    elViewLogs.style.display = 'none';
  } else {
    elViewResearch.style.display = 'none';
    elViewLogs.style.display = 'block';
    renderFullLogPanel();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  KHỞI TẠO (INIT)
// ══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  await loadSavedConfig();
  updateMinDateUI();
  await loadStateAndUpdate();
  setupListeners();
});

// ── Đọc cấu hình đã lưu từ storage ──────────────────────────────────
async function loadSavedConfig() {
  let savedConfig = null;
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      const data = await chrome.storage.local.get('savedConfig');
      savedConfig = data.savedConfig;
    } else if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('fb_ads_savedConfig');
      if (raw) savedConfig = JSON.parse(raw);
    }
  } catch (err) {
    console.debug('[Popup] loadSavedConfig error:', err);
  }

  if (!savedConfig) {
    renderChips(elNiche.value || 'Beauty');
    return;
  }

  for (const [key, el] of Object.entries(configInputs)) {
    if (savedConfig[key] !== undefined && el) {
      el.value = savedConfig[key];
    }
  }

  if (savedConfig.minMonthsAgo !== undefined) {
    elMinMonthsAgo.value = savedConfig.minMonthsAgo;
  }
  if (savedConfig.startDateMin !== undefined) {
    elStartDateMin.value = savedConfig.startDateMin;
  }
  if (savedConfig.inoteUrl) {
    elInoteUrl.value = savedConfig.inoteUrl;
  }
  if (savedConfig.manualNicheName) {
    elManualNicheName.value = savedConfig.manualNicheName;
  }
  if (savedConfig.manualKeywordsText) {
    elManualKeywordsText.value = savedConfig.manualKeywordsText;
  }
  if (savedConfig.country) elCountry.value = savedConfig.country;
  if (savedConfig.niche) elNiche.value = savedConfig.niche;

  if (savedConfig.nicheMode) {
    switchNicheMode(savedConfig.nicheMode);
  } else {
    renderChips(elNiche.value || 'Beauty', savedConfig.selectedKeywords || []);
  }
}

// ── Lưu cấu hình vào storage ────────────────────────────────────────
function saveConfig() {
  const config = {};
  for (const [key, el] of Object.entries(configInputs)) {
    if (el) config[key] = el.value;
  }
  config.niche = elNiche.value;
  config.country = elCountry.value;
  config.selectedKeywords = [...selectedKeywords];
  config.minMonthsAgo = elMinMonthsAgo.value;
  config.startDateMin = elStartDateMin.value;
  config.nicheMode = currentNicheMode;
  config.inoteUrl = elInoteUrl.value;
  config.manualNicheName = elManualNicheName.value;
  config.manualKeywordsText = elManualKeywordsText.value;

  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      chrome.storage.local.set({ savedConfig: config }).catch(err => {
        console.debug('[Popup] Save config error:', err.message);
      });
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('fb_ads_savedConfig', JSON.stringify(config));
    }
  } catch (err) {
    console.debug('[Popup] Save config error:', err);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  KEYWORD CHIPS
// ══════════════════════════════════════════════════════════════════════

function renderChips(niche, preSelected = []) {
  elChips.innerHTML = '';
  selectedKeywords.clear();

  const keywords = NICHE_KEYWORDS[niche];
  if (!keywords || keywords.length === 0) {
    elChips.innerHTML = '<span style="color:#475569;font-size:.78rem">← Chọn ngách để hiện keyword</span>';
    updateChipCount();
    return;
  }

  for (const kw of keywords) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = kw;
    chip.dataset.keyword = kw;

    if (preSelected.includes(kw)) {
      chip.classList.add('selected');
      selectedKeywords.add(kw);
    }

    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      if (chip.classList.contains('selected')) {
        selectedKeywords.add(kw);
      } else {
        selectedKeywords.delete(kw);
      }
      updateChipCount();
      saveConfig();
    });

    elChips.appendChild(chip);
  }
  updateChipCount();
}

function updateChipCount() {
  const totalInNiche = (NICHE_KEYWORDS[elNiche.value] || []).length;
  elChipCount.textContent = `(${selectedKeywords.size}/${totalInNiche} đã chọn)`;
}

// ══════════════════════════════════════════════════════════════════════
//  EVENT LISTENERS
// ══════════════════════════════════════════════════════════════════════

function setupListeners() {
  // Main Top Navigation
  elTabNavResearch.addEventListener('click', () => switchNavTab('research'));
  elTabNavLogs.addEventListener('click', () => switchNavTab('logs'));
  if (elLinkViewAllLogs) {
    elLinkViewAllLogs.addEventListener('click', () => switchNavTab('logs'));
  }

  // Tabs chuyển chế độ ngách
  elTabInote.addEventListener('click', () => switchNicheMode('inote'));
  elTabManual.addEventListener('click', () => switchNicheMode('manual'));
  elTabBuiltin.addEventListener('click', () => switchNicheMode('builtin'));

  // Nút tải iNote
  elBtnFetchInote.addEventListener('click', () => {
    fetchAndApplyInote(elInoteUrl.value.trim());
  });

  // Chọn / Bỏ chọn tất cả chips
  elBtnSelectAllChips.addEventListener('click', () => {
    const keywords = NICHE_KEYWORDS[elNiche.value] || [];
    selectedKeywords = new Set(keywords);
    $$('#keywordChips .chip').forEach(c => c.classList.add('selected'));
    updateChipCount();
    saveConfig();
  });

  elBtnDeselectAllChips.addEventListener('click', () => {
    selectedKeywords.clear();
    $$('#keywordChips .chip').forEach(c => c.classList.remove('selected'));
    updateChipCount();
    saveConfig();
  });

  // Dropdown Min Date (1 - 12 tháng)
  elMinMonthsAgo.addEventListener('change', () => {
    updateMinDateUI();
    saveConfig();
  });

  elStartDateMin.addEventListener('change', () => {
    const parts = elStartDateMin.value.split('-');
    if (parts.length === 3) {
      elMinDateDisplay.textContent = `📅 Chạy từ: ${parts[2]}/${parts[1]}/${parts[0]} (Tùy chọn)`;
    }
    saveConfig();
  });

  // Đổi ngách → render lại chips
  elNiche.addEventListener('change', () => {
    renderChips(elNiche.value);
    saveConfig();
  });

  // Toggle cấu hình nâng cao
  elConfigToggle.addEventListener('click', () => {
    const isOpen = elConfigBody.classList.toggle('show');
    elConfigArrow.classList.toggle('open', isOpen);
  });

  // Tự lưu config khi thay đổi
  for (const el of Object.values(configInputs)) {
    if (!el) continue;
    el.addEventListener('change', saveConfig);
    el.addEventListener('input', saveConfig);
  }
  elCountry.addEventListener('change', saveConfig);
  elInoteUrl.addEventListener('input', saveConfig);
  elManualNicheName.addEventListener('input', saveConfig);
  elManualKeywordsText.addEventListener('input', saveConfig);

  // ── Nút Start ──────────────────────────────────────────────────
  elBtnStart.addEventListener('click', async () => {
    let niche = '';
    let keywords = [];

    if (currentNicheMode === 'manual') {
      niche = elManualNicheName.value.trim() || 'Custom';
      const raw = elManualKeywordsText.value || '';
      keywords = raw.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 1);
      if (keywords.length === 0) {
        alert('Vui lòng nhập ít nhất 1 từ khóa trong danh sách nhập tay.');
        return;
      }
    } else {
      niche = elNiche.value;
      if (!niche) {
        alert('Vui lòng chọn một ngách sản phẩm.');
        return;
      }
      keywords = [...selectedKeywords];
      const customRaw = elCustomKeyword.value.trim();
      if (customRaw) {
        const customs = customRaw.split(',').map(s => s.trim()).filter(Boolean);
        for (const c of customs) {
          if (!keywords.includes(c)) keywords.push(c);
        }
      }
      if (keywords.length === 0) {
        alert('Vui lòng chọn ít nhất 1 keyword hoặc nhập keyword tùy chỉnh.');
        return;
      }
    }

    const country = elCountry.value || 'ALL';

    const config = {
      activeThreshold:   parseInt(configInputs.activeThreshold.value, 10) / 100,
      minProducts:       parseInt(configInputs.minProducts.value, 10) || 0,
      maxPages:          parseInt(configInputs.maxPages.value, 10) || 0,
      maxScrolls:        0,
      delayMin:          parseInt(configInputs.delayMin.value, 10),
      delayMax:          parseInt(configInputs.delayMax.value, 10),
      tabType:           configInputs.tabType.value,
      sheetsUrl:         configInputs.sheetsUrl.value.trim(),
      secretKey:         configInputs.secretKey.value.trim(),
      mediaType:         configInputs.mediaType.value,
      publisherPlatform: configInputs.publisherPlatform.value,
      searchType:        configInputs.searchType.value,
      sortMode:          configInputs.sortMode.value,
      startDateMin:      elStartDateMin.value,
      crawlerEngine:     configInputs.crawlerEngine.value,
    };

    // Validate
    if (config.delayMin > config.delayMax) {
      alert('Delay tối thiểu phải nhỏ hơn hoặc bằng delay tối đa.');
      return;
    }

    const now = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    cachedLogs.push({
      timestamp: now,
      type: 'RUNNING',
      message: `🚀 Đang khởi động cào dữ liệu cho ngách "${niche}" (${keywords.length} từ khóa, Engine=${config.crawlerEngine || 'GRAPHQL'})...`
    });
    renderLogs(cachedLogs);

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'START_RESEARCH',
        payload: { niche, keywords, country, config },
      });
      if (resp && resp.error) {
        alert('Lỗi: ' + resp.error);
      }
    } catch (err) {
      console.error('Start error:', err);
    }
  });

  // ── Nút Stop ───────────────────────────────────────────────────
  elBtnStop.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_RESEARCH' });
    } catch (err) {
      console.error('Stop error:', err);
    }
  });

  // ── Nút Resume ─────────────────────────────────────────────────
  elBtnResume.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'RESUME_RESEARCH' });
    } catch (err) {
      console.error('Resume error:', err);
    }
  });

  // ── Nút Clear Log (Compact preview) ───────────────────────────
  elBtnClearLog.addEventListener('click', async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' });
      }
      cachedLogs = [];
      renderLogs([]);
    } catch (err) {
      console.error('Clear log error:', err);
    }
  });

  // ── Điều khiển Tab Logfile ─────────────────────────────────────
  elLogLevelFilter.addEventListener('change', renderFullLogPanel);
  elLogSearchInput.addEventListener('input', renderFullLogPanel);

  // Copy full log
  elBtnCopyFullLog.addEventListener('click', async () => {
    try {
      const lines = cachedLogs.map(e => `[${e.timestamp || ''}] [${e.type || 'INFO'}] ${e.message || ''}`);
      await navigator.clipboard.writeText(lines.join('\n'));
      const orig = elBtnCopyFullLog.textContent;
      elBtnCopyFullLog.textContent = '✅ Đã copy!';
      setTimeout(() => { elBtnCopyFullLog.textContent = orig; }, 1500);
    } catch (err) {
      console.debug('[Popup] Copy log error:', err.message);
      alert('Không thể sao chép: ' + err.message);
    }
  });

  // Export full log file
  elBtnExportFullLog.addEventListener('click', () => {
    try {
      const lines = cachedLogs.map(e => `[${e.timestamp || ''}] [${e.type || 'INFO'}] ${e.message || ''}`);
      const text = lines.join('\n');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const dateTag = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
      a.href = url;
      a.download = `fb_ads_research_${dateTag}.log`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.debug('[Popup] Export log error:', err.message);
    }
  });

  // Clear full log
  elBtnClearFullLog.addEventListener('click', async () => {
    if (!confirm('Xóa toàn bộ dữ liệu logfile hiện tại?')) return;
    try {
      if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' });
      }
      cachedLogs = [];
      renderLogs([]);
    } catch (err) {
      console.debug('[Popup] Clear full log error:', err.message);
    }
  });

  // Mở log trong tab riêng (full-screen browser tab)
  elBtnOpenLogTab.addEventListener('click', () => {
    try {
      if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
        chrome.tabs.create({ url: chrome.runtime.getURL('log.html') });
      } else {
        window.open('log.html', '_blank');
      }
    } catch (err) {
      console.debug('[Popup] Open log tab error:', err.message);
    }
  });

  // Nút Reload Extension (cập nhật ngay mã nguồn Service Worker từ disk)
  const btnReload = document.getElementById('btnReloadExtension');
  if (btnReload) {
    btnReload.addEventListener('click', () => {
      btnReload.textContent = '⏳ Reloading...';
      try {
        if (typeof chrome !== 'undefined' && chrome?.runtime?.reload) {
          chrome.runtime.reload();
        } else {
          window.location.reload();
        }
      } catch (err) {
        window.location.reload();
      }
    });
  }

  // Lắng nghe thay đổi storage
  if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.fbAdsResearchState || changes.researchState) {
        const newState = changes.fbAdsResearchState?.newValue || changes.researchState?.newValue;
        if (newState) updateUIFromState(newState);
      }
      if (changes.fbAdsResearchLogs || changes.researchLogs) {
        const newLogs = changes.fbAdsResearchLogs?.newValue || changes.researchLogs?.newValue;
        if (newLogs) renderLogs(newLogs);
      }
    });
  }

  // Lắng nghe broadcast trực tiếp từ background Service Worker
  if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'NEW_LOG_ENTRY') {
        if (msg.payload?.logs) {
          renderLogs(msg.payload.logs);
        } else if (msg.payload?.entry) {
          cachedLogs.push(msg.payload.entry);
          renderLogs(cachedLogs);
        }
      }
    });
  }
}

// ══════════════════════════════════════════════════════════════════════
//  STATE & LOGS UI
// ══════════════════════════════════════════════════════════════════════

async function loadStateAndUpdate() {
  let state = null;
  let logs = [];

  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      const data = await chrome.storage.local.get([
        'fbAdsResearchState', 'fbAdsResearchLogs',
        'researchState', 'researchLogs'
      ]);
      state = data.fbAdsResearchState || data.researchState;
      logs = data.fbAdsResearchLogs || data.researchLogs || [];
    } else if (typeof localStorage !== 'undefined') {
      const rawLogs = localStorage.getItem('fbAdsResearchLogs') || localStorage.getItem('researchLogs');
      if (rawLogs) logs = JSON.parse(rawLogs);
      const rawState = localStorage.getItem('fbAdsResearchState') || localStorage.getItem('researchState');
      if (rawState) state = JSON.parse(rawState);
    }
  } catch (err) {
    console.debug('[Popup] loadStateAndUpdate error:', err.message);
  }

  // Nếu chưa có log trong storage, nạp log chào mừng ban đầu
  if (!logs || logs.length === 0) {
    const now = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    logs = [{
      timestamp: now,
      type: 'INFO',
      message: '⚡ FB Ads Product Research Extension v2.0 sẵn sàng. Chọn ngách & từ khóa rồi bấm "Bắt đầu cào tự động" để chạy.'
    }];
    if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'INIT_SESSION_LOG' }).catch(err => {
        console.debug('[Popup] INIT_SESSION_LOG skipped:', err.message);
      });
    }
  }

  if (state) updateUIFromState(state);
  renderLogs(logs);
}

function updateUIFromState(state) {
  if (!state) return;
  const { status = 'IDLE', currentKeywordIndex = 0, currentPageIndex = 0, pages = [], keywords = [] } = state;

  elStatusBadge.textContent = status;
  elStatusBadge.className   = `badge badge-${status.toLowerCase()}`;

  if (elLogLiveBadge) {
    elLogLiveBadge.textContent = status;
    elLogLiveBadge.className = `status-badge status-${status}`;
  }

  const elSidepanelStatus = document.getElementById('sidepanelStatusBadge');
  if (elSidepanelStatus) {
    elSidepanelStatus.textContent = `SIDE PANEL: ${status}`;
    elSidepanelStatus.className = `status-badge status-${status}`;
  }

  const isRunning = status === 'RUNNING';
  const isPaused  = status === 'PAUSED';

  elBtnStart.disabled  = isRunning;
  elBtnStop.disabled   = !isRunning && !isPaused;
  elBtnResume.disabled = !isPaused;

  if (status !== 'IDLE') {
    elProgressSection.style.display = 'block';

    const kw = keywords[currentKeywordIndex] || '—';
    elCurrentKeyword.textContent = `${kw} (${currentKeywordIndex + 1}/${keywords.length})`;

    const curPage = pages[currentPageIndex];
    elCurrentPage.textContent = curPage
      ? `${curPage.pageName || curPage.pageId} (${currentPageIndex + 1}/${pages.length})`
      : '—';

    const perKwExpected = (state.config?.maxPages > 0) ? state.config.maxPages : (pages.length || 10);
    const totalExpected = keywords.length * perKwExpected;
    const processed     = (currentKeywordIndex * perKwExpected) + currentPageIndex;
    const pct = totalExpected > 0 ? Math.min(100, Math.round((processed / totalExpected) * 100)) : 0;
    elProgressText.textContent = `${pct}% (${processed}/${totalExpected} page)`;

    const pass  = pages.filter(p => p.status === 'PASS' || p.status === 'SAVED').length;
    const skip  = pages.filter(p => p.status === 'SKIP_RATIO' || p.status === 'SKIP_PRODUCTS').length;
    const error = pages.filter(p => p.status === 'ERROR' || p.status === 'BLOCKED').length;

    elPassCount.textContent  = pass;
    elSkipCount.textContent  = skip;
    elErrorCount.textContent = error;
  }
}

function renderLogMessageNodes(container, text) {
  if (!text) return;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let lastIdx = 0;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      container.appendChild(document.createTextNode(text.substring(lastIdx, match.index)));
    }
    const a = document.createElement('a');
    a.href = match[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = match[0];
    a.style.color = '#818cf8';
    a.style.textDecoration = 'underline';
    a.style.wordBreak = 'break-all';
    container.appendChild(a);
    lastIdx = urlRegex.lastIndex;
  }
  if (lastIdx < text.length) {
    container.appendChild(document.createTextNode(text.substring(lastIdx)));
  }
}

function renderLogs(logs) {
  cachedLogs = logs || [];

  if (elLogCountBadge) {
    elLogCountBadge.textContent = cachedLogs.length;
  }

  // 1. Render Compact preview in Research tab
  if (elLogPanel) {
    if (cachedLogs.length === 0) {
      elLogPanel.innerHTML = '<div style="color:#475569;text-align:center;padding:12px">Chưa có log</div>';
    } else {
      elLogPanel.innerHTML = '';
      // Hiển thị tối đa 40 dòng gần nhất trong preview
      const previewLogs = cachedLogs.slice(-40);
      for (const entry of previewLogs) {
        const div = document.createElement('div');
        div.className = `log-entry log-${entry.type || 'INFO'}`;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = entry.timestamp || '';

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'log-badge';
        badgeSpan.textContent = entry.type || 'INFO';

        const msgSpan = document.createElement('span');
        msgSpan.className = 'log-msg';
        renderLogMessageNodes(msgSpan, entry.message || '');

        div.appendChild(timeSpan);
        div.appendChild(badgeSpan);
        div.appendChild(msgSpan);
        elLogPanel.appendChild(div);
      }
      elLogPanel.scrollTop = elLogPanel.scrollHeight;
    }
  }

  // 2. Render Full Logfile tab
  renderFullLogPanel();
}

function renderFullLogPanel() {
  if (!elFullLogPanel) return;

  const selectedLevel = elLogLevelFilter ? elLogLevelFilter.value : 'ALL';
  const query = elLogSearchInput ? elLogSearchInput.value.trim().toLowerCase() : '';

  // Tính thống kê
  let passCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const entry of cachedLogs) {
    const t = entry.type || 'INFO';
    if (t === 'PASS' || t === 'SAVED') passCount++;
    else if (t === 'SKIP') skipCount++;
    else if (t === 'ERROR' || t === 'WARN') errorCount++;
  }

  if (elStatFullTotal) elStatFullTotal.textContent = cachedLogs.length;
  if (elStatFullPass)  elStatFullPass.textContent  = passCount;
  if (elStatFullSkip)  elStatFullSkip.textContent  = skipCount;
  if (elStatFullError) elStatFullError.textContent = errorCount;

  // Lọc entries
  const filtered = cachedLogs.filter(entry => {
    const t = entry.type || 'INFO';
    if (selectedLevel !== 'ALL' && t !== selectedLevel) return false;
    if (query) {
      const text = `${entry.timestamp || ''} ${entry.type || ''} ${entry.message || ''}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    elFullLogPanel.innerHTML = `
      <div style="color:#64748b;text-align:center;padding:40px 0;font-size:0.8rem">
        ${cachedLogs.length === 0 ? 'Chưa có dữ liệu logfile.' : 'Không tìm thấy log khớp bộ lọc.'}
      </div>
    `;
    return;
  }

  elFullLogPanel.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const entry of filtered) {
    const div = document.createElement('div');
    div.className = `log-entry log-${entry.type || 'INFO'}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = entry.timestamp || '';

    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'log-badge';
    badgeSpan.textContent = entry.type || 'INFO';

    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-msg';
    renderLogMessageNodes(msgSpan, entry.message || '');

    div.appendChild(timeSpan);
    div.appendChild(badgeSpan);
    div.appendChild(msgSpan);
    frag.appendChild(div);
  }

  elFullLogPanel.appendChild(frag);

  if (elCheckAutoScroll && elCheckAutoScroll.checked) {
    elFullLogPanel.scrollTop = elFullLogPanel.scrollHeight;
  }
}
