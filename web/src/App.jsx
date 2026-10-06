import { useCallback, useEffect, useRef, useState } from 'react';
import liff from '@line/liff';
import { api } from './api.js';
import { DEMO, LIFF_ID } from './config.js';
import Register from './components/Register.jsx';
import MemberView from './components/MemberView.jsx';

export default function App() {
  const [view, setView] = useState({ type: 'loading' }); // loading | register | member | error
  const [init, setInit] = useState(null);
  const [profile, setProfile] = useState(null);
  const started = useRef(false);

  // โหลดสถานะสมาชิก แล้วเลือกหน้าลงทะเบียนหรือหน้าข้อมูล
  const load = useCallback(async () => {
    setView({ type: 'loading' });
    try {
      const data = await api('init');
      setInit(data);
      setView({ type: data.registered ? 'member' : 'register' });
    } catch (e) {
      if (e.code === 'LOGIN') return;
      setView({ type: 'error', message: e.message });
    }
  }, []);

  // รีเฟรชข้อมูล init โดยไม่เปลี่ยนหน้า (ให้ MemberView คงปีที่เลือกไว้)
  const refreshInit = useCallback(async () => {
    setInit(await api('init'));
  }, []);

  useEffect(() => {
    // StrictMode รัน effect สองรอบใน dev — กันการเรียก liff.init ซ้ำ
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        if (!DEMO) {
          await liff.init({ liffId: LIFF_ID });
          if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
          }
          // รูปและชื่อจาก LINE ใช้แสดงผลอย่างเดียว ไม่ส่งไป backend (ต้องเปิด scope "profile")
          liff.getProfile().then(setProfile).catch(() => {});
        }
        await load();
      } catch (e) {
        setView({ type: 'error', message: e.message });
      }
    })();
  }, [load]);

  const who =
    view.type === 'register'
      ? 'ลงทะเบียนสมาชิกครั้งแรก'
      : view.type === 'member' && init?.member
        ? `${init.member.name} · สมาชิกเลขที่ ${init.member.memberId}`
        : '';

  return (
    <>
      <header className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white pt-[max(1.25rem,env(safe-area-inset-top))] pb-16 px-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="shrink-0 w-14 h-14 rounded-full ring-2 ring-white/70 bg-white/20 overflow-hidden flex items-center justify-center text-xl font-semibold">
            {profile?.pictureUrl ? (
              <img
                src={profile.pictureUrl}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              '👤'
            )}
          </div>
          <div className="min-w-0">
            <p className="text-emerald-100 text-sm truncate">{profile?.displayName ?? 'สหกรณ์'}</p>
            <h1 className="text-2xl font-semibold leading-tight">เงินปันผลและเฉลี่ยคืน</h1>
            <p className="text-emerald-50/90 text-sm mt-1">{who}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 -mt-10 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {view.type === 'loading' && (
          <div className="bg-white rounded-2xl shadow p-8 text-center text-slate-500">กำลังโหลด...</div>
        )}
        {view.type === 'error' && (
          <div className="bg-white rounded-2xl shadow p-5 sm:p-6 text-center">
            <p className="text-slate-600 mb-4">{view.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-3 font-medium"
            >
              ลองใหม่
            </button>
          </div>
        )}
        {view.type === 'register' && <Register requireBank={init.requireBank} onDone={load} />}
        {view.type === 'member' && <MemberView init={init} onChanged={refreshInit} />}
      </main>
    </>
  );
}
