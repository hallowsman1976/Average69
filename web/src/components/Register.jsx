import { useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '../api.js';
import { OFFICES } from '../config.js';

const okButton = { confirmButtonText: 'ตกลง', confirmButtonColor: '#059669' };
const inputCls =
  'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export default function Register({ requireBank, onDone }) {
  const [form, setForm] = useState({ memberId: '', name: '', office: '', bank4: '' });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    const params = {
      memberId: form.memberId.trim(),
      name: form.name.trim(),
      office: form.office.trim(),
      bank4: requireBank ? form.bank4.trim() : '',
    };
    Swal.fire({ title: 'กำลังตรวจสอบข้อมูล...', allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
    try {
      await api('register', params);
      await Swal.fire({ icon: 'success', title: 'ลงทะเบียนสำเร็จ', ...okButton });
      onDone();
    } catch (err) {
      Swal.close();
      if (err.code !== 'LOGIN') Swal.fire({ icon: 'error', title: 'ลงทะเบียนไม่สำเร็จ', text: err.message, ...okButton });
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-5 sm:p-6">
      <h2 className="text-lg font-semibold mb-1">ลงทะเบียนสมาชิก</h2>
      <p className="text-sm text-slate-500 mb-4">กรอกข้อมูลให้ตรงกับทะเบียนสมาชิกเพื่อผูกกับบัญชี LINE นี้ (ทำครั้งเดียว)</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">เลขที่สมาชิก</span>
          <input value={form.memberId} onChange={set('memberId')} inputMode="numeric" required className={inputCls} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">ชื่อ-สกุล</span>
          <input value={form.name} onChange={set('name')} required placeholder="เช่น สมชาย ใจดี" className={inputCls} />
        </label>

        <label className="block">
          <span className="text-sm font-medium">สังกัด</span>
          <select value={form.office} onChange={set('office')} required className={`${inputCls} bg-white`}>
            <option value="" disabled>
              -- เลือกสังกัด --
            </option>
            {OFFICES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        {requireBank && (
          <label className="block">
            <span className="text-sm font-medium">เลขบัญชีธนาคาร 4 ตัวท้าย</span>
            <input
              value={form.bank4}
              onChange={set('bank4')}
              inputMode="numeric"
              maxLength={4}
              required
              placeholder="เช่น 1234"
              className={inputCls}
            />
          </label>
        )}

        <button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[.99] text-white py-3 font-medium transition">
          ลงทะเบียน
        </button>
      </form>
    </div>
  );
}
