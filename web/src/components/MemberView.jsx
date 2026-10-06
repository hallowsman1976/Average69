import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '../api.js';
import { baht } from '../format.js';

const okButton = { confirmButtonText: 'ตกลง', confirmButtonColor: '#059669' };

export default function MemberView({ init, onChanged }) {
  const { years } = init;
  const [year, setYear] = useState(years[0]?.year);

  if (!years.length) {
    return (
      <div className="bg-white rounded-2xl shadow p-5 sm:p-6">
        <p className="text-center text-slate-500 py-6">ยังไม่มีข้อมูลเงินปันผลและเฉลี่ยคืนของคุณ</p>
      </div>
    );
  }

  const selected = years.some((y) => y.year === year) ? year : years[0].year;

  return (
    <>
      <div className="bg-white rounded-2xl shadow p-4 mb-4 flex items-center gap-3">
        <label htmlFor="year" className="text-sm font-medium shrink-0">
          เลือกปี
        </label>
        <select
          id="year"
          value={selected}
          onChange={(e) => setYear(e.target.value)}
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {years.map((y) => (
            <option key={y.year} value={y.year}>
              {`ปี พ.ศ. ${y.year}${y.confirmed ? ' ✓ ยืนยันแล้ว' : y.open ? ' · รอยืนยัน' : ''}`}
            </option>
          ))}
        </select>
      </div>
      <YearDetail year={selected} init={init} onChanged={onChanged} />
    </>
  );
}

function YearDetail({ year, init, onChanged }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  // โหลดใหม่เมื่อเปลี่ยนปี หรือ init เปลี่ยน (หลังยืนยันแล้วสถานะต้องอัปเดต)
  useEffect(() => {
    let active = true; // กันผลลัพธ์เก่ามาทับเมื่อเปลี่ยนปี
    setState((s) => ({ ...s, loading: true, error: null }));
    api('getData', { year })
      .then((data) => active && setState({ loading: false, data, error: null }))
      .catch((e) => active && e.code !== 'LOGIN' && setState({ loading: false, data: null, error: e.message }));
    return () => {
      active = false;
    };
  }, [year, init]);

  if (state.loading) return <Card><p className="text-center text-slate-500 py-6">กำลังโหลด...</p></Card>;
  if (state.error) return <Card><p className="text-center text-slate-500 py-6">{state.error}</p></Card>;
  return <Detail d={state.data} onChanged={onChanged} />;
}

async function confirmYear(d, onChanged) {
  const r = await Swal.fire({
    icon: 'question',
    title: 'ยืนยันข้อมูล?',
    html: `รับสุทธิ ปี พ.ศ. ${d.year}<br><b class="text-2xl">฿ ${baht(d.net)}</b><br><span class="text-sm text-slate-500">เมื่อยืนยันแล้วจะแก้ไขไม่ได้</span>`,
    showCancelButton: true,
    confirmButtonText: 'ยืนยัน',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#059669',
  });
  if (!r.isConfirmed) return;

  Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
  try {
    await api('confirm', { year: d.year });
    await Swal.fire({ icon: 'success', title: 'ยืนยันข้อมูลเรียบร้อย', ...okButton });
    await onChanged();
  } catch (e) {
    Swal.close();
    if (e.code !== 'LOGIN') Swal.fire({ icon: 'error', title: 'ไม่สามารถยืนยันได้', text: e.message, ...okButton });
  }
}

const Card = ({ children }) => <div className="bg-white rounded-2xl shadow p-5 sm:p-6">{children}</div>;

const Section = ({ title, color, children }) => (
  <section className="bg-white rounded-2xl shadow p-4 sm:p-5 mb-4">
    <h3 className="font-semibold mb-1 flex items-center gap-2">
      <span className={`w-1.5 h-5 rounded-full ${color}`} />
      {title}
    </h3>
    {children}
  </section>
);

const Row = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
    <span className="text-slate-600 text-sm sm:text-base">{label}</span>
    <span className="font-medium tabular-nums">{baht(value)}</span>
  </div>
);

const Total = ({ label, value, cls }) => (
  <div className="flex justify-between pt-3 mt-1 border-t border-slate-200 font-semibold">
    <span>{label}</span>
    <span className={`tabular-nums ${cls}`}>{baht(value)}</span>
  </div>
);

function Detail({ d, onChanged }) {
  const m = d.member;

  let action;
  if (d.confirmed) {
    action = (
      <div className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 text-center">
        <p className="font-semibold">✓ ยืนยันข้อมูลแล้ว</p>
        {d.confirmedAt && <p className="text-sm mt-0.5">เมื่อ {d.confirmedAt}</p>}
      </div>
    );
  } else if (d.open) {
    action = (
      <button
        onClick={() => confirmYear(d, onChanged)}
        className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[.99] text-white py-4 text-lg font-semibold shadow transition"
      >
        ยืนยันข้อมูล
      </button>
    );
  } else {
    action = (
      <div className="rounded-2xl bg-slate-200 text-slate-600 p-4 text-center text-sm">
        ยังไม่เปิดรับการยืนยันสำหรับปีนี้
      </div>
    );
  }

  return (
    <>
      <Section title="ข้อมูลสมาชิก" color="bg-slate-400">
        <dl className="text-sm sm:text-base divide-y divide-slate-100">
          <Info label="ชื่อ-สกุล" value={m.name} />
          <Info label="เลขที่สมาชิก" value={m.memberId} />
          <Info label="สังกัด" value={m.office} />
          <Info label="บัญชีธนาคาร" value={m.bankMasked || '-'} />
        </dl>
      </Section>

      <Section title="รายรับ" color="bg-emerald-500">
        {d.income.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
        <Total label="รวมเงิน" value={d.total} cls="text-emerald-700" />
      </Section>

      <Section title="รายการหัก" color="bg-rose-500">
        {d.deductions.length ? (
          d.deductions.map((r) => <Row key={r.label} label={r.label} value={r.value} />)
        ) : (
          <p className="text-sm text-slate-400 py-2">ไม่มีรายการหัก</p>
        )}
        <Total label="รวมหัก" value={d.totalDeduct} cls="text-rose-600" />
      </Section>

      <section className="rounded-2xl shadow bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-5 mb-4 text-center">
        <p className="text-emerald-50 text-sm">รับสุทธิ ปี พ.ศ. {d.year}</p>
        <p className="text-3xl sm:text-4xl font-bold tabular-nums mt-1">฿ {baht(d.net)}</p>
      </section>

      {action}
    </>
  );
}

const Info = ({ label, value }) => (
  <div className="flex justify-between gap-3 py-2">
    <dt className="text-slate-500">{label}</dt>
    <dd className="font-medium text-right tabular-nums">{value}</dd>
  </div>
);
