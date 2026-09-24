/**
 * ระบบเงินปันผลและเฉลี่ยคืนออนไลน์ — Backend (Google Apps Script Web App)
 *
 * รับคำขอ POST จากหน้าเว็บภายนอก (LIFF) เป็น JSON ในรูป text/plain
 *   { action, idToken, ...params }
 * และตอบกลับเป็น JSON { ok, ... } หรือ { ok:false, code, message }
 *
 * Script Properties ที่ต้องตั้ง (Project Settings > Script properties):
 *   SPREADSHEET_ID       ไอดีของ Google Sheet (ไม่ต้องตั้งถ้าสคริปต์ผูกกับชีตอยู่แล้ว)
 *   LINE_CHANNEL_ID      Channel ID ของ LINE Login channel (ใช้ตรวจ aud ของ ID Token)
 *   REQUIRE_BANK_LAST4   'true' = ตอนลงทะเบียนต้องกรอกเลขบัญชี 4 ตัวท้ายด้วย (ค่าเริ่มต้น false)
 */

var TZ = 'Asia/Bangkok';
var SHEET_FORM = 'Form';
var SHEET_CONFIG = 'Config';
var CONFIRM_VALUE = 'ยืนยันแล้ว';
var COL_CONFIRM_AT = 'วันเวลายืนยัน';
var COL_CONFIRM_BY = 'ยืนยันโดย';
var MAX_REG_FAILS = 5;
var REG_FAIL_WINDOW_SEC = 1800;

/* ============================== Entry points ============================== */

function doPost(e) {
  try {
    var req = parseBody_(e);
    var userId = verifyIdToken_(req.idToken);
    var result;
    switch (req.action) {
      case 'init':    result = actionInit_(userId); break;
      case 'register': result = actionRegister_(userId, req); break;
      case 'getData': result = actionGetData_(userId, req.year); break;
      case 'confirm': result = actionConfirm_(userId, req.year); break;
      default: throw new AppError('BAD_ACTION', 'คำสั่งไม่ถูกต้อง');
    }
    result.ok = true;
    return json_(result);
  } catch (err) {
    if (!(err instanceof AppError)) {
      console.error(err && err.stack ? err.stack : err);
      err = new AppError('SERVER_ERROR', 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง');
    }
    return json_({ ok: false, code: err.code, message: err.message });
  }
}

function doGet() {
  return json_({ ok: true, service: 'dividend-api' });
}

/* ================================ Actions ================================ */

function actionInit_(userId) {
  var rec = getFormRecord_(userId);
  var out = { registered: !!rec, requireBank: requireBank_() };
  if (rec) {
    out.member = { memberId: rec.memberId, name: rec.name, office: rec.office };
    out.years = listMemberYears_(rec.memberId);
  }
  return out;
}

function actionRegister_(userId, req) {
  var memberId = normId_(req.memberId);
  var name = String(req.name || '').trim();
  var office = String(req.office || '').trim();
  if (!memberId || !name || !office) {
    throw new AppError('BAD_INPUT', 'กรุณากรอกข้อมูลให้ครบถ้วน');
  }

  var cache = CacheService.getScriptCache();
  var failKey = 'regfail_' + userId;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_REG_FAILS) {
    throw new AppError('RATE_LIMITED', 'กรอกข้อมูลผิดหลายครั้ง กรุณารอ 30 นาทีแล้วลองใหม่ หรือติดต่อเจ้าหน้าที่');
  }

  var found = findLatestMemberRow_(memberId);
  var ok = false;
  var bankMissing = false;
  if (found) {
    var vals = found.y.vals, map = found.y.map;
    var sheetName = vals[map['ชื่อสกุล']];
    var sheetOffice = vals[map['สังกัด']];
    ok = normName_(sheetName) === normName_(name) &&
         normText_(sheetOffice) === normText_(office);
    if (ok && requireBank_()) {
      var digits = String(vals[map['เลขที่บัญชีธนาคาร']] || '').replace(/\D/g, '');
      if (digits.length < 4) {
        ok = false;
        bankMissing = true;
      } else {
        ok = digits.slice(-4) === String(req.bank4 || '').replace(/\D/g, '');
      }
    }
  }
  if (!ok) {
    cache.put(failKey, String(fails + 1), REG_FAIL_WINDOW_SEC);
    if (bankMissing) {
      throw new AppError('BANK_MISSING', 'ไม่พบเลขบัญชีในทะเบียน กรุณาติดต่อเจ้าหน้าที่');
    }
    throw new AppError('NOT_MATCH', 'ข้อมูลไม่ตรงกับทะเบียนสมาชิก กรุณาตรวจสอบอีกครั้ง');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = getSheet_(SHEET_FORM);
    var data = readTable_(sh);
    var cUser = data.map['userid'], cMem = data.map['memberid'];
    for (var i = 0; i < data.rows.length; i++) {
      if (String(data.rows[i][cUser]).trim() === userId) {
        throw new AppError('ALREADY_REGISTERED', 'บัญชี LINE นี้ลงทะเบียนแล้ว');
      }
      if (normId_(data.rows[i][cMem]) === memberId) {
        throw new AppError('MEMBER_TAKEN', 'เลขที่สมาชิกนี้ถูกผูกกับบัญชี LINE อื่นแล้ว หากเป็นความผิดพลาดกรุณาติดต่อเจ้าหน้าที่');
      }
    }
    var row = [];
    for (var c = 0; c < data.headers.length; c++) row.push('');
    row[data.map['userid']] = userId;
    row[data.map['memberid']] = memberId;
    row[data.map['name']] = String(found.y.vals[found.y.map['ชื่อสกุล']]);
    row[data.map['office']] = String(found.y.vals[found.y.map['สังกัด']]);
    row[data.map['timestamp']] = new Date();
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  cache.remove(failKey);
  return { registered: true };
}

function actionGetData_(userId, year) {
  var rec = requireMember_(userId);
  year = checkYear_(year);
  var y = readYear_(year, rec.memberId);
  if (!y) throw new AppError('NO_DATA', 'ไม่พบข้อมูลของคุณในปี พ.ศ. ' + year);
  return buildData_(year, y);
}

function actionConfirm_(userId, year) {
  var rec = requireMember_(userId);
  year = checkYear_(year);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (!readConfig_()[year]) {
      throw new AppError('CLOSED', 'ปีนี้ยังไม่เปิดรับการยืนยัน');
    }
    var y = readYear_(year, rec.memberId);
    if (!y) throw new AppError('NO_DATA', 'ไม่พบข้อมูลของคุณในปี พ.ศ. ' + year);
    var cConfirm = y.map['ยืนยัน'];
    if (cConfirm === undefined) throw new AppError('CONFIG_ERROR', 'ชีตปีนี้ไม่มีคอลัมน์ "ยืนยัน" กรุณาติดต่อเจ้าหน้าที่');
    if (isConfirmed_(y.vals[cConfirm])) {
      throw new AppError('ALREADY_CONFIRMED', 'คุณยืนยันข้อมูลปีนี้ไปแล้ว');
    }
    var cAt = ensureColumn_(y, COL_CONFIRM_AT);
    var cBy = ensureColumn_(y, COL_CONFIRM_BY);
    var sh = y.sheet, r = y.rowNum;
    sh.getRange(r, cConfirm + 1).setValue(CONFIRM_VALUE);
    sh.getRange(r, cAt + 1).setValue(new Date());
    sh.getRange(r, cBy + 1).setValue(userId);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { confirmed: true };
}

/* ============================== Data building ============================== */

function buildData_(year, y) {
  var h = y.headers, v = y.vals, m = y.map;
  var iTotal = m['รวมเงิน'], iDeductSum = m['รวมหัก'], iNet = m['รับสุทธิ'];
  if (iTotal === undefined || iDeductSum === undefined || iNet === undefined) {
    throw new AppError('CONFIG_ERROR', 'ชีตปีนี้ขาดคอลัมน์ รวมเงิน / รวมหัก / รับสุทธิ กรุณาติดต่อเจ้าหน้าที่');
  }

  var income = [];
  var cGift = m['สมนาคุณ'];
  if (cGift !== undefined) income.push({ label: label_(h[cGift]), value: num_(v[cGift]) });
  var cDiv = findColPrefix_(h, 'เงินปันผล');
  if (cDiv >= 0) income.push({ label: label_(h[cDiv]), value: num_(v[cDiv]) });
  var cAvg = findColPrefix_(h, 'เงินเฉลี่ยคืน');
  if (cAvg >= 0) income.push({ label: label_(h[cAvg]), value: num_(v[cAvg]) });

  // รายการหัก = ทุกคอลัมน์ระหว่าง "รวมเงิน" และ "รวมหัก" (เพิ่มประเภทเงินกู้ใหม่ในชีตได้เลย)
  var deductions = [];
  for (var c = iTotal + 1; c < iDeductSum; c++) {
    var val = num_(v[c]);
    if (val !== 0) deductions.push({ label: label_(h[c]), value: val });
  }

  var cConfirm = m['ยืนยัน'];
  var confirmed = cConfirm !== undefined && isConfirmed_(v[cConfirm]);
  var cAt = m[COL_CONFIRM_AT];
  var at = (confirmed && cAt !== undefined && v[cAt] instanceof Date) ? thaiDateTime_(v[cAt]) : '';

  var bankDigits = String(v[m['เลขที่บัญชีธนาคาร']] || '').replace(/\D/g, '');
  return {
    year: year,
    open: !!readConfig_()[year],
    confirmed: confirmed,
    confirmedAt: at,
    member: {
      memberId: normId_(v[m['เลขที่สมาชิก']]),
      name: String(v[m['ชื่อสกุล']] || ''),
      office: String(v[m['สังกัด']] || ''),
      bankMasked: bankDigits ? '••••' + bankDigits.slice(-4) : ''
    },
    income: income,
    total: num_(v[iTotal]),
    deductions: deductions,
    totalDeduct: num_(v[iDeductSum]),
    net: num_(v[iNet])
  };
}

function listMemberYears_(memberId) {
  var cfg = readConfig_();
  var out = [];
  var years = listYearSheets_();
  for (var i = 0; i < years.length; i++) {
    var y = readYear_(years[i], memberId);
    if (!y) continue;
    var cConfirm = y.map['ยืนยัน'];
    out.push({
      year: years[i],
      open: !!cfg[years[i]],
      confirmed: cConfirm !== undefined && isConfirmed_(y.vals[cConfirm])
    });
  }
  return out;
}

function findLatestMemberRow_(memberId) {
  var years = listYearSheets_();
  for (var i = 0; i < years.length; i++) {
    var y = readYear_(years[i], memberId);
    if (y && y.map['ชื่อสกุล'] !== undefined && y.map['สังกัด'] !== undefined) {
      return { year: years[i], y: y };
    }
  }
  return null;
}

/* =============================== Sheet helpers =============================== */

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new AppError('CONFIG_ERROR', 'ยังไม่ได้ตั้งค่า SPREADSHEET_ID');
  return ss;
}

function getSheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new AppError('CONFIG_ERROR', 'ไม่พบชีต "' + name + '" กรุณาติดต่อเจ้าหน้าที่');
  return sh;
}

/** อ่านตารางทั้งชีตโดยใช้แถวแรกเป็นหัวคอลัมน์ (คีย์ตัวพิมพ์เล็ก ไม่มีช่องว่าง) */
function readTable_(sh) {
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new AppError('CONFIG_ERROR', 'ชีต "' + sh.getName() + '" ว่างเปล่า');
  var values = sh.getRange(1, 1, Math.max(lastRow, 1), lastCol).getValues();
  var headers = values[0];
  var map = {};
  headers.forEach(function (hd, i) {
    var k = key_(hd).toLowerCase();
    if (k && map[k] === undefined) map[k] = i;
  });
  ['userid', 'memberid', 'name', 'office', 'timestamp'].forEach(function (k) {
    if (sh.getName() === SHEET_FORM && map[k] === undefined) {
      throw new AppError('CONFIG_ERROR', 'ชีต Form ขาดคอลัมน์ ' + k);
    }
  });
  return { headers: headers, map: map, rows: values.slice(1) };
}

function getFormRecord_(userId) {
  var data = readTable_(getSheet_(SHEET_FORM));
  var cUser = data.map['userid'];
  for (var i = 0; i < data.rows.length; i++) {
    if (String(data.rows[i][cUser]).trim() === userId) {
      var r = data.rows[i];
      return {
        memberId: normId_(r[data.map['memberid']]),
        name: String(r[data.map['name']] || ''),
        office: String(r[data.map['office']] || '')
      };
    }
  }
  return null;
}

function requireMember_(userId) {
  var rec = getFormRecord_(userId);
  if (!rec) throw new AppError('NOT_REGISTERED', 'ยังไม่ได้ลงทะเบียนสมาชิก');
  return rec;
}

/** รายชื่อแท็บปี (ตัวเลข 4 หลัก) เรียงจากใหม่ไปเก่า */
function listYearSheets_() {
  return ss_().getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (n) { return /^\d{4}$/.test(n); })
    .sort()
    .reverse();
}

/** อ่านแถวของสมาชิกในแท็บปี; คืน null ถ้าไม่มีแท็บหรือไม่พบสมาชิก */
function readYear_(year, memberId) {
  var sh = ss_().getSheetByName(year);
  if (!sh || sh.getLastRow() < 2) return null;
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function (hd, i) {
    var k = key_(hd);
    if (k && map[k] === undefined) map[k] = i;
  });
  var cMem = map['เลขที่สมาชิก'];
  if (cMem === undefined) return null;
  var ids = sh.getRange(2, cMem + 1, sh.getLastRow() - 1, 1).getValues();
  var rowNum = 0;
  for (var i = 0; i < ids.length; i++) {
    if (normId_(ids[i][0]) === memberId) { rowNum = i + 2; break; }
  }
  if (!rowNum) return null;
  var vals = sh.getRange(rowNum, 1, 1, lastCol).getValues()[0];
  return { sheet: sh, headers: headers, map: map, rowNum: rowNum, vals: vals };
}

/** คืน index (0-based) ของคอลัมน์ที่ต้องการ ถ้าไม่มีให้เพิ่มหัวคอลัมน์ท้ายชีต */
function ensureColumn_(y, name) {
  var k = key_(name);
  if (y.map[k] !== undefined) return y.map[k];
  var idx = y.headers.length;
  y.sheet.getRange(1, idx + 1).setValue(name);
  y.headers.push(name);
  y.map[k] = idx;
  return idx;
}

/** Config: คอลัมน์ A = ปี พ.ศ., คอลัมน์ B = เปิด/ปิดรับยืนยัน */
function readConfig_() {
  var sh = getSheet_(SHEET_CONFIG);
  var out = {};
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
    var y = String(r[0]).trim();
    var s = String(r[1]).trim().toLowerCase();
    if (/^\d{4}$/.test(y)) out[y] = ['เปิด', 'open', 'true', 'yes', 'y', '1'].indexOf(s) >= 0;
  });
  return out;
}

/* ============================== LINE ID Token ============================== */

function verifyIdToken_(idToken) {
  if (!idToken) throw new AppError('TOKEN_INVALID', 'กรุณาเข้าสู่ระบบด้วย LINE');
  var channelId = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ID');
  if (!channelId) throw new AppError('CONFIG_ERROR', 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID');

  var cache = CacheService.getScriptCache();
  var ck = 'tok_' + sha256_(idToken);
  var hit = cache.get(ck);
  if (hit) return hit;

  var res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: channelId },
    muteHttpExceptions: true
  });
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() !== 200 || !body.sub) {
    var expired = /expired/i.test(String(body.error_description || ''));
    throw new AppError(expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      expired ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' : 'ไม่สามารถยืนยันตัวตนกับ LINE ได้');
  }
  if (String(body.aud) !== String(channelId)) {
    throw new AppError('TOKEN_INVALID', 'ไม่สามารถยืนยันตัวตนกับ LINE ได้');
  }
  var ttl = Math.max(1, Math.min(300, Number(body.exp) - Math.floor(Date.now() / 1000)));
  cache.put(ck, body.sub, ttl);
  return body.sub;
}

/* ================================== Utils ================================== */

function AppError(code, message) {
  this.name = 'AppError';
  this.code = code;
  this.message = message;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new AppError('BAD_REQUEST', 'รูปแบบคำขอไม่ถูกต้อง');
  }
}

function requireBank_() {
  return PropertiesService.getScriptProperties().getProperty('REQUIRE_BANK_LAST4') === 'true';
}

function checkYear_(year) {
  year = String(year || '').trim();
  if (!/^\d{4}$/.test(year)) throw new AppError('BAD_INPUT', 'ปีไม่ถูกต้อง');
  return year;
}

function key_(s) { return String(s === null || s === undefined ? '' : s).replace(/\s+/g, ''); }
function label_(s) { return String(s).replace(/\s+/g, ' ').trim(); }
function normId_(v) { return String(v === null || v === undefined ? '' : v).trim().replace(/\.0+$/, ''); }
function normText_(s) { return String(s || '').replace(/[\s​]+/g, ''); }
function normName_(s) {
  return normText_(s).replace(/^(นางสาว|น\.ส\.|นาย|นาง|ด\.ช\.|ด\.ญ\.|ดร\.)/, '');
}
function isConfirmed_(v) { return /^ยืนยัน/.test(String(v || '').trim()); }

function num_(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v || '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function findColPrefix_(headers, prefix) {
  for (var i = 0; i < headers.length; i++) {
    if (key_(headers[i]).indexOf(prefix) === 0) return i;
  }
  return -1;
}

function thaiDateTime_(d) {
  var be = Number(Utilities.formatDate(d, TZ, 'yyyy')) + 543;
  return Utilities.formatDate(d, TZ, 'dd/MM/') + be + Utilities.formatDate(d, TZ, ' HH:mm');
}

function sha256_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/* ============================ One-time setup helper ============================ */

/** รันครั้งเดียวจาก editor เพื่อสร้างแท็บ Form และ Config พร้อมหัวคอลัมน์ */
function setupSheets() {
  var ss = ss_();
  var form = ss.getSheetByName(SHEET_FORM) || ss.insertSheet(SHEET_FORM);
  if (form.getLastRow() === 0) {
    form.appendRow(['userID', 'memberID', 'Name', 'Office', 'Timestamp']);
    form.setFrozenRows(1);
  }
  var cfg = ss.getSheetByName(SHEET_CONFIG) || ss.insertSheet(SHEET_CONFIG);
  if (cfg.getLastRow() === 0) {
    cfg.appendRow(['ปี พ.ศ.', 'เปิดรับยืนยัน']);
    cfg.setFrozenRows(1);
  }
}
