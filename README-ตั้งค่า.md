# ระบบเงินปันผลและเฉลี่ยคืนออนไลน์ — คู่มือตั้งค่า

โครงสร้าง: หน้าเว็บ (`web/index.html`, โฮสต์ภายนอก + LIFF) → `fetch` POST → Apps Script `doPost` (`apps-script/Code.gs`) → Google Sheet

## 1) เตรียม Google Sheet
1. แท็บรายปี ตั้งชื่อเป็นเลข พ.ศ. 4 หลัก เช่น `2568` แถวแรกเป็นหัวคอลัมน์ตามที่กำหนด
   - ระบบอ่านตาม **ชื่อหัวคอลัมน์** ต้องมี: `เลขที่สมาชิก, ชื่อสกุล, สังกัด, เลขที่บัญชีธนาคาร, สมนาคุณ, เงินปันผล…, เงินเฉลี่ยคืน…, รวมเงิน, รวมหัก, รับสุทธิ, ยืนยัน`
   - **ทุกคอลัมน์ระหว่าง `รวมเงิน` และ `รวมหัก` ถือเป็นรายการหัก** (เพิ่มประเภทเงินกู้ใหม่ได้โดยแทรกในช่วงนี้)
   - ระบบเพิ่มคอลัมน์ `วันเวลายืนยัน`, `ยืนยันโดย` ท้ายชีตให้เองตอนมีการยืนยันครั้งแรก
2. รัน `setupSheets()` ใน Apps Script editor ครั้งเดียว เพื่อสร้างแท็บ
   - `Form`: userID, memberID, Name, Office, Timestamp (ระบบเขียนเอง; **ลบแถวเพื่อให้สมาชิกผูก LINE ใหม่**)
   - `Config`: คอลัมน์ A = ปี พ.ศ., คอลัมน์ B = `เปิด` หรือ `ปิด` (เปิดรับยืนยัน)

## 2) LINE Developers
1. สร้าง Provider → **LINE Login channel** (Channel ID ใช้เป็น `LINE_CHANNEL_ID`)
2. ในแท็บ LIFF ของ channel → Add: Endpoint URL = URL หน้าเว็บที่โฮสต์ (HTTPS), Scope เลือก **openid** (จำเป็นสำหรับ ID Token) และ profile → ได้ **LIFF ID**
3. ตั้ง channel เป็น Published

## 3) Apps Script
1. เปิดชีต → Extensions → Apps Script วางเนื้อหา `apps-script/Code.gs` และ `appsscript.json` (เปิด Show manifest file ใน Project Settings)
2. Project Settings → Script properties:

| Key | ค่า |
|---|---|
| `LINE_CHANNEL_ID` | Channel ID ของ LINE Login channel |
| `SPREADSHEET_ID` | ไอดีชีต (ไม่ต้องใส่ถ้าสคริปต์ผูกกับชีตนี้) |
| `REQUIRE_BANK_LAST4` | `true` เพื่อบังคับกรอกเลขบัญชี 4 ตัวท้ายตอนลงทะเบียน (แนะนำเปิด; ค่าเริ่มต้นปิด) |

3. Deploy → New deployment → Web app: **Execute as: Me**, **Who has access: Anyone** → คัดลอก URL ที่ลงท้าย `/exec`
4. แก้โค้ดภายหลังต้อง Deploy → Manage deployments → Edit → New version (ไม่เช่นนั้น URL เดิมยังเป็นโค้ดเก่า)

## 4) หน้าเว็บ
1. เปิด `web/index.html` แก้ตัวแปรบนสุด `LIFF_ID` และ `API_URL`
2. อัปโหลดขึ้นโฮสต์ HTTPS (GitHub Pages / Netlify / Cloudflare Pages) แล้วนำ URL ไปใส่เป็น Endpoint URL ของ LIFF
3. เปิดจาก `https://liff.line.me/<LIFF_ID>` ในแอป LINE
4. ดูหน้าตาโดยไม่ต้องใช้ LINE: เปิด `index.html?demo=1` (ข้อมูลสมมติ ไม่เรียก backend)

## การทำงานและความปลอดภัย
- หน้าเว็บส่ง LINE ID Token ทุกคำขอ; `doPost` ตรวจกับ LINE (aud + วันหมดอายุ) แล้วใช้ `sub` เป็น userId ที่เชื่อถือได้
- ส่งแบบ `text/plain` เพื่อเลี่ยง CORS preflight; ห้ามเปลี่ยนเป็น `application/json`
- ลงทะเบียน: เทียบเลขที่สมาชิก + ชื่อสกุล (ตัดคำนำหน้า/ช่องว่าง) + สังกัด กับชีตปีล่าสุดที่มีสมาชิกคนนั้น, ผิดเกิน 5 ครั้ง/30 นาที/userId จะถูกบล็อกชั่วคราว
- 1 สมาชิก = 1 userId (ไม่ซ้ำทั้งสองฝั่ง), เลขบัญชีส่งกลับเฉพาะ 4 ตัวท้าย, ตอบเฉพาะแถวของสมาชิกที่ผูกกับ userId นั้น
- ยืนยันได้เฉพาะปีที่ `Config` เป็น `เปิด` และกดซ้ำไม่ได้ (LockService)
- ความเสี่ยงที่เหลือ: หากไม่เปิด `REQUIRE_BANK_LAST4` ผู้ที่รู้เลขที่สมาชิก+ชื่อ+สังกัดของผู้อื่นและลงทะเบียนก่อนเจ้าตัวจะเห็นข้อมูลของคนนั้นได้

## ยังไม่ได้ทดสอบกับของจริง
ทดสอบเฉพาะหน้าเว็บโหมดสาธิต (`?demo=1`) ส่วน `Code.gs` ยังไม่ได้รันกับ Google Sheet/LINE จริง ให้ทดสอบด้วยแท็บปีตัวอย่าง 1–2 แถวก่อนใช้งานจริง
