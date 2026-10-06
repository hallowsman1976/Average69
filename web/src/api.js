import liff from '@line/liff';
import Swal from 'sweetalert2';
import { API_URL, DEMO } from './config.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const okButton = { confirmButtonText: 'ตกลง', confirmButtonColor: '#059669' };

export async function api(action, params = {}) {
  if (DEMO) return demoApi(action, params);

  const idToken = liff.getIDToken();
  if (!idToken) {
    liff.login({ redirectUri: window.location.href });
    throw new ApiError('LOGIN', 'login');
  }

  let res;
  try {
    // text/plain = "simple request" ไม่เกิด CORS preflight (Apps Script ตอบ OPTIONS ไม่ได้)
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, idToken, ...params }),
    });
  } catch {
    throw new ApiError('NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
  }

  const data = await res.json().catch(() => ({
    ok: false,
    code: 'SERVER_ERROR',
    message: 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง',
  }));
  if (data.ok) return data;

  if (data.code === 'TOKEN_EXPIRED' || data.code === 'TOKEN_INVALID') {
    await Swal.fire({ icon: 'info', title: 'กรุณาเข้าสู่ระบบใหม่', text: data.message, ...okButton });
    liff.logout();
    liff.login({ redirectUri: window.location.href });
  }
  throw new ApiError(data.code, data.message);
}

/* ---------- Demo mode: ข้อมูลสมมติ ไม่เรียก backend ---------- */
const demoDb = { registered: false, confirmed: { 2568: false, 2567: true } };

async function demoApi(action, p) {
  await new Promise((r) => setTimeout(r, 300));
  const member = { memberId: '1234', name: 'สมชาย ใจดี', office: 'โรงเรียนตัวอย่าง' };

  if (action === 'init') {
    return {
      ok: true,
      registered: demoDb.registered,
      requireBank: false,
      member,
      years: [
        { year: '2568', open: true, confirmed: demoDb.confirmed[2568] },
        { year: '2567', open: false, confirmed: true },
      ],
    };
  }
  if (action === 'register') {
    demoDb.registered = true;
    return { ok: true };
  }
  if (action === 'confirm') {
    demoDb.confirmed[p.year] = true;
    return { ok: true };
  }
  const confirmed = demoDb.confirmed[p.year];
  return {
    ok: true,
    year: p.year,
    open: p.year === '2568',
    confirmed,
    confirmedAt: confirmed ? '20/03/2568 09:41' : '',
    member: { ...member, bankMasked: '••••4321' },
    income: [
      { label: 'สมนาคุณ', value: 500 },
      { label: 'เงินปันผล 5.87%', value: 18250.5 },
      { label: 'เงินเฉลี่ยคืน 17.87%', value: 4120.25 },
    ],
    total: 22870.75,
    deductions: [
      { label: 'ฉุกเฉิน', value: 3000 },
      { label: 'เงินกู้สุขใจ', value: 5000 },
      { label: 'สสธท.', value: 1200 },
      { label: 'ดอกเบี้ย', value: 310.75 },
    ],
    totalDeduct: 9510.75,
    net: 13360,
  };
}
