/**
 * ชุดทดสอบ Code.gs — รันใน Apps Script editor กับ "สำเนาชีตทดสอบ" เท่านั้น (ห้ามรันกับชีตจริง)
 *   1) seedSampleData()  สร้างแท็บ 2567, 2568, Form, Config พร้อมข้อมูลตัวอย่าง
 *   2) runTests()        เรียก action ตรงๆ ด้วย userId ปลอม (ขึ้นต้น Utest) ข้ามการตรวจ LINE token
 * ผลลัพธ์ดูที่ View > Logs / Execution log
 * ลบไฟล์นี้ออกก่อน deploy ใช้งานจริงได้ (ไม่กระทบระบบ)
 */

var T_HEADERS = ['UID', 'เลขที่สมาชิก', 'ชื่อสกุล', 'สังกัด', 'สมนาคุณ', 'เลขที่บัญชีธนาคาร',
  'เงินปันผล5.87%', 'เงินเฉลี่ยคืน 17.87%', 'รวมเงิน',
  'ฉุกเฉิน', 'ฉุกเฉิน/ดอกเบี้ย 9 วัน', 'เงินกู้สุขใจ', 'สสธท.', 'ชสอ.', 'กสธท.2', 'กสธท.3', 'กสสธ.4',
  'กอส.1', 'กอส.2', 'กอส.3', 'กรอ.', 'กภส.1', 'กภส.2', 'สส.สก.', 'สส.สท', 'ดอกเบี้ย',
  'รวมหัก', 'รับสุทธิ', 'ยืนยัน'];

function t_row_(uid, mid, name, office, gift, bank, div, avg, ded) {
  var d = [];
  for (var i = 0; i < 17; i++) d.push(ded[i] || 0);
  var sumD = d.reduce(function (a, b) { return a + b; }, 0);
  var total = gift + div + avg;
  return [uid, mid, name, office, gift, bank, div, avg, total].concat(d, [sumD, total - sumD, '']);
}

function seedSampleData() {
  var ss = ss_();
  var exist = ['2567', '2568'].filter(function (n) {
    var s = ss.getSheetByName(n);
    return s && s.getLastRow() > 1;
  });
  if (exist.length) throw new Error('พบแท็บ ' + exist.join(',') + ' ที่มีข้อมูลอยู่แล้ว — ใช้สำเนาชีตทดสอบเท่านั้น');

  [['2568', [
    t_row_('U-1001', 1001, 'นายสมชาย ใจดี', 'โรงเรียนตัวอย่าง', 500, '123-4-56789-0', 18250.5, 4120.25, { 0: 3000, 2: 5000, 3: 1200, 16: 310.75 }),
    t_row_('U-1002', 1002, 'นางสาวสมหญิง รักดี', 'สำนักงานเขต', 0, '987-6-54321-0', 9000, 1500, { 3: 800 }),
    t_row_('U-1003', 1003, 'นายไม่มี บัญชี', 'โรงเรียนตัวอย่าง', 0, '', 4000, 700, {})
  ]], ['2567', [
    t_row_('U-1001', 1001, 'นายสมชาย ใจดี', 'โรงเรียนตัวอย่าง', 300, '123-4-56789-0', 15000, 3000, { 0: 2000 })
  ]]].forEach(function (p) {
    var sh = ss.getSheetByName(p[0]) || ss.insertSheet(p[0]);
    sh.clear();
    sh.getRange(1, 6, p[1].length + 1, 1).setNumberFormat('@'); // คอลัมน์เลขบัญชีเป็นข้อความ
    sh.getRange(1, 1, 1, T_HEADERS.length).setValues([T_HEADERS]);
    sh.getRange(2, 1, p[1].length, T_HEADERS.length).setValues(p[1]);
    sh.setFrozenRows(1);
  });

  setupSheets();
  var cfg = ss.getSheetByName(SHEET_CONFIG);
  cfg.getRange(2, 1, 2, 2).setValues([['2568', 'เปิด'], ['2567', 'ปิด']]);
  console.log('สร้างข้อมูลตัวอย่างเสร็จ: สมาชิก 1001, 1002, 1003 / ปี 2568 เปิดรับ, 2567 ปิด');
}

/* ------------------------------- Test runner ------------------------------- */

var t_pass = 0, t_fail = 0;

function t_ok_(cond, msg) {
  if (cond) { t_pass++; console.log('  PASS  ' + msg); }
  else { t_fail++; console.error('  FAIL  ' + msg); }
}

function t_err_(fn, code, msg) {
  try { fn(); t_ok_(false, msg + ' (ไม่เกิด error)'); }
  catch (e) { t_ok_(e && e.code === code, msg + ' (ได้ ' + (e && e.code) + ')'); }
}

function t_reset_() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('REQUIRE_BANK_LAST4');
  var form = getSheet_(SHEET_FORM);
  for (var r = form.getLastRow(); r >= 2; r--) {
    if (String(form.getRange(r, 1).getValue()).indexOf('Utest') === 0) form.deleteRow(r);
  }
  var cache = CacheService.getScriptCache();
  ['Utest-A', 'Utest-B', 'Utest-C', 'Utest-D', 'Utest-E'].forEach(function (u) { cache.remove('regfail_' + u); });
  var sh = ss_().getSheetByName('2568');
  var y = readYear_('2568', '1001');
  if (y) {
    var cc = y.map['ยืนยัน'];
    sh.getRange(2, cc + 1, sh.getLastRow() - 1, 1).clearContent();
    [COL_CONFIRM_AT, COL_CONFIRM_BY].forEach(function (n) {
      var c = y.map[key_(n)];
      if (c !== undefined) sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).clearContent();
    });
  }
}

function runTests() {
  t_pass = 0; t_fail = 0;
  t_reset_();

  console.log('[1] init / register');
  t_ok_(actionInit_('Utest-A').registered === false, 'ยังไม่ลงทะเบียน → registered=false');
  t_err_(function () { actionRegister_('Utest-A', { memberId: '1001', name: 'สมชาย ใจดีผิด', office: 'โรงเรียนตัวอย่าง' }); }, 'NOT_MATCH', 'ชื่อไม่ตรง');
  t_err_(function () { actionRegister_('Utest-A', { memberId: '1001', name: 'สมชาย ใจดี', office: 'ที่อื่น' }); }, 'NOT_MATCH', 'สังกัดไม่ตรง');
  t_err_(function () { actionRegister_('Utest-A', { memberId: '9999', name: 'ใคร', office: 'ไหน' }); }, 'NOT_MATCH', 'ไม่มีเลขที่สมาชิก');
  t_err_(function () { actionRegister_('Utest-A', { memberId: '', name: 'x', office: 'y' }); }, 'BAD_INPUT', 'กรอกไม่ครบ');
  t_ok_(actionRegister_('Utest-A', { memberId: '1001', name: ' สมชาย   ใจดี ', office: 'โรงเรียนตัวอย่าง' }).registered === true, 'ลงทะเบียนสำเร็จ (ตัดคำนำหน้า/ช่องว่างได้)');
  t_err_(function () { actionRegister_('Utest-A', { memberId: '1002', name: 'สมหญิง รักดี', office: 'สำนักงานเขต' }); }, 'ALREADY_REGISTERED', 'userId เดิมลงซ้ำ');
  t_err_(function () { actionRegister_('Utest-B', { memberId: '1001', name: 'สมชาย ใจดี', office: 'โรงเรียนตัวอย่าง' }); }, 'MEMBER_TAKEN', 'เลขสมาชิกซ้ำกับ userId อื่น');

  console.log('[2] rate limit');
  for (var i = 0; i < MAX_REG_FAILS; i++) {
    try { actionRegister_('Utest-C', { memberId: '1002', name: 'ผิด', office: 'ผิด' }); } catch (e) {}
  }
  t_err_(function () { actionRegister_('Utest-C', { memberId: '1002', name: 'สมหญิง รักดี', office: 'สำนักงานเขต' }); }, 'RATE_LIMITED', 'ผิดครบ 5 ครั้ง → ถูกบล็อกแม้กรอกถูก');

  console.log('[3] getData');
  var init = actionInit_('Utest-A');
  t_ok_(init.registered && init.member.memberId === '1001', 'init คืนสมาชิก 1001');
  t_ok_(init.years.length === 2 && init.years[0].year === '2568' && init.years[0].open === true && init.years[1].open === false, 'ปีเรียงใหม่→เก่า, 2568 เปิด, 2567 ปิด');
  var d = actionGetData_('Utest-A', '2568');
  t_ok_(d.net === 13360 && d.total === 22870.75 && d.totalDeduct === 9510.75, 'ยอด รวมเงิน/รวมหัก/รับสุทธิ ถูกต้อง');
  t_ok_(d.deductions.length === 4, 'รายการหักแสดงเฉพาะที่ไม่เป็น 0 (4 รายการ)');
  t_ok_(d.member.bankMasked === '••••7890', 'เลขบัญชีปิดบัง เหลือ 4 ตัวท้าย');
  t_ok_(d.income[1].label.indexOf('5.87') >= 0, 'ป้ายอัตราเงินปันผลดึงจากหัวคอลัมน์');
  t_ok_(JSON.stringify(d).indexOf('123-4-56789') < 0, 'ไม่มีเลขบัญชีเต็มใน response');
  t_err_(function () { actionGetData_('Utest-A', '2500'); }, 'NO_DATA', 'ปีที่ไม่มีแท็บ');
  t_err_(function () { actionGetData_('Utest-A', "2568'"); }, 'BAD_INPUT', 'รูปแบบปีผิด');
  t_err_(function () { actionGetData_('Utest-Z', '2568'); }, 'NOT_REGISTERED', 'userId ที่ไม่ได้ลงทะเบียน');

  console.log('[4] แยกข้อมูลรายคน');
  actionRegister_('Utest-D', { memberId: '1002', name: 'สมหญิง รักดี', office: 'สำนักงานเขต' });
  var d2 = actionGetData_('Utest-D', '2568');
  t_ok_(d2.member.memberId === '1002' && d2.net === 9700, 'สมาชิก 1002 เห็นเฉพาะยอดของตนเอง (net=9,700)');
  t_ok_(actionInit_('Utest-D').years.length === 1, '1002 มีข้อมูลเฉพาะปี 2568');

  console.log('[5] confirm');
  t_err_(function () { actionConfirm_('Utest-A', '2567'); }, 'CLOSED', 'ปีที่ Config=ปิด ยืนยันไม่ได้');
  t_ok_(actionConfirm_('Utest-A', '2568').confirmed === true, 'ยืนยันปี 2568 สำเร็จ');
  t_err_(function () { actionConfirm_('Utest-A', '2568'); }, 'ALREADY_CONFIRMED', 'ยืนยันซ้ำไม่ได้');
  var d3 = actionGetData_('Utest-A', '2568');
  t_ok_(d3.confirmed === true && /^\d\d\/\d\d\/25\d\d \d\d:\d\d$/.test(d3.confirmedAt), 'getData แสดง confirmed + วันเวลา พ.ศ. (' + d3.confirmedAt + ')');
  t_ok_(actionGetData_('Utest-D', '2568').confirmed === false, 'การยืนยันของ 1001 ไม่กระทบ 1002');
  var y = readYear_('2568', '1001');
  t_ok_(y.vals[y.map[key_(COL_CONFIRM_BY)]] === 'Utest-A', 'ชีตบันทึก "ยืนยันโดย" = userId');

  console.log('[6] REQUIRE_BANK_LAST4');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('REQUIRE_BANK_LAST4', 'true');
  t_ok_(actionInit_('Utest-E').requireBank === true, 'init แจ้งว่าต้องกรอกเลขบัญชี');
  t_err_(function () { actionRegister_('Utest-E', { memberId: '1003', name: 'ไม่มี บัญชี', office: 'โรงเรียนตัวอย่าง', bank4: '1234' }); }, 'BANK_MISSING', 'สมาชิกที่ไม่มีเลขบัญชีในชีต');
  t_err_(function () { actionRegister_('Utest-E', { memberId: '1002', name: 'สมหญิง รักดี', office: 'สำนักงานเขต', bank4: '0000' }); }, 'NOT_MATCH', 'เลขบัญชี 4 ตัวท้ายผิด');
  t_err_(function () { actionRegister_('Utest-E', { memberId: '1002', name: 'สมหญิง รักดี', office: 'สำนักงานเขต', bank4: '3210' }); }, 'MEMBER_TAKEN', 'เลขบัญชีถูกแต่ 1002 ผูกกับ Utest-D ไปแล้ว');
  props.deleteProperty('REQUIRE_BANK_LAST4');

  t_reset_();
  console.log('สรุป: ผ่าน ' + t_pass + ' / ไม่ผ่าน ' + t_fail);
  if (t_fail) throw new Error('มีข้อที่ไม่ผ่าน ' + t_fail + ' ข้อ ดู Execution log');
}
