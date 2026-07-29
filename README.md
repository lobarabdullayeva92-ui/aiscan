# AI Scan — Mammografiya AI diagnostika platformasi (`plan_project_new`)

> Bu README **butun `plan_project_new` (AI Scan) loyihasi** haqida. Ushbu `doctor/`
> papka esa platformaning **vrach (doctor) sahifasi**ga oid kodlarni alohida, toza
> modullar ko'rinishida jamlaydi (pastdagi "Doctor sahifasi" bo'limi).

AI Scan — ko'krak bezi o'smalarini (benign/malignant) **erta aniqlash va tashxislash**
uchun mo'ljallangan sun'iy intellekt platformasi. Mammografiya (DICOM) tasvirlarini
yuklash, annotatsiyalash, AI bilan deteksiya/klassifikatsiya, model o'qitish,
radiomika tahlili va klinik hisobot chiqarishni bitta veb-tizimda birlashtiradi.

- **Jonli manzil:** https://aiscan.airi.uz  (kirish: `/app`, vrach: `/doctor`)
- **Texnologiya:** FastAPI (Python 3.12) + vanilla JS SPA, Docker
- **AI:** Ultralytics YOLO (deteksiya/klassifikatsiya), WBF ansambl, radiomika + bulcha belgi-tanlash (Xamdamov A2), GMIC (MIL fine-tune)

---

## 🧩 Asosiy imkoniyatlar

| Modul | Tavsif |
|------|--------|
| **DICOM yuklash & ko'rish** | `/api/upload` — DICOM, avtomatik de-identifikatsiya (PHI tozalash), window/level, ko'p-kadr, katta tasvir renderi |
| **Annotatsiya** | bbox / polygon, BI-RADS; real-vaqt hamkorlik (WebSocket); COCO/YOLO eksport; DICOM SEG/SR eksport |
| **AI inferens** | Deteksiya (YOLO), klassifikatsiya (`_cls.pt` yoki GMIC), **WBF ansambl**, yuklashda avto-inferens |
| **Noaniqlik/issiqlik xaritasi** | modellar kelishmovchiligi xaritasi; smart-click segmentatsiya (flood-fill) |
| **Model o'qitish** | Run/stop/status, datasetlar, metrikalar/grafiklar, eksport, baholash, solishtirish; **masofaviy GPU** |
| **Radiomika** | radiomik belgilar + **bulcha belgi-tanlash** (`boolfs`, A2) + minimal-masofa klassifikator |
| **PACS/MWL** | PACS integratsiyasi, worklist import, XLSX import |
| **Hisobotlar** | Klinik hisobot, AI report, DICOM SR eksport |
| **Vrach paneli** | `/doctor` — soddalashtirilgan diagnostika (quyida) |
| **Auth & xavfsizlik** | JWT + HttpOnly cookie, rollar, TOTP (ixtiyoriy), login lockout, audit log, CSP |

---

## 🏗 Arxitektura

```
app/
├── main.py            # FastAPI ilova, barcha API + sahifa marshrutlari (~6600 satr)
├── auth.py            # JWT, foydalanuvchilar, ROLES, TOTP, lockout
├── db.py              # SQLite (users, settings, audit ...)
├── inference.py       # YOLO deteksiya/klassifikatsiya, WBF ansambl
├── radiomics.py       # radiomik belgilar
├── boolfs/            # bulcha belgi-tanlash (Xamdamov A2)
├── gmic_infer.py      # GMIC (NYU) MIL klassifikator
├── dicom_utils.py     # DICOM render, window/level
├── deidentify.py      # PHI anonimlashtirish
├── annotations.py     # annotatsiya saqlash
├── exporters.py       # COCO/YOLO/mask eksport
├── dicom_seg.py / dicom_sr.py   # DICOM SEG/SR
├── pacs.py / mwl_scu.py         # PACS/MWL
├── train_worker.py / remote_train.py  # o'qitish (lokal/masofaviy GPU)
├── report_gen.py / report_findings.py # hisobotlar
├── ws.py              # WebSocket (real-vaqt hamkorlik)
├── static/            # index.html (SPA), app.js, landing.html, doctor.*
└── models/            # *.pt (YOLO), gmic/, *_cls.pt (klassifikator)
```

**Sahifalar:** `/` (landing) · `/app` (asosiy SPA) · `/doctor` (vrach paneli). `main.py`
qo'shimcha xizmatlarni reverse-proxy qiladi: `/mentor /english /iclaude /surgery /manim
/thai /harakat /safety /docsearch /ppe /iqttalim`.

---

## 🔐 Autentifikatsiya va rollar
- **Rollar:** `admin`, `reviewer`, `annotator`, `doctor`
- **Token:** JWT (`Authorization: Bearer`, localStorage `mamograf_jwt`) + HttpOnly cookie (rasm uchun)
- **Endpointlar:** `/api/auth/login|logout|me|change-password`, TOTP: `/api/auth/totp/*`
- **Boshqaruv (admin):** `/api/auth/users`; CLI: `python -m app.manage_users create <user> --role <role>`

---

## 🚀 Ishga tushirish (Docker, production)
```bash
# .env: JWT_SECRET, AUTO_DEIDENTIFY, REMOTE_TRAIN_URL/TOKEN, ...
docker compose -f docker-compose.prod.yml up -d --build
# konteyner: mamograf-app  |  port 8081->8000
# edge proxy: aiscan.airi.uz:443 -> 10.10.0.75:8081
```
Volume'lar: `app_uploads`, `app_annotations`, `app_models`, `app_db` (`down -v` HECH QACHON).
Xavfsiz yangilash: `bash deploy_update.sh`. Lokal (dev): `uvicorn app.main:app --reload`.

---

## 🩺 Doctor (vrach) sahifasi — shu papka

Vrachlar uchun soddalashtirilgan panel: annotatsiya/admin/o'qitish asboblarisiz —
faqat **fayl yuklash → AI diagnostika → issiqlik xaritasi**.

**Papka tuzilishi:**
```
doctor/
├── README.md                 # (shu fayl) butun AI Scan loyihasi haqida
├── backend/                  # ulanadigan (pluggable) backend modullar
│   ├── __init__.py
│   ├── models_select.py      # eng yaxshi ≤3 modelni tanlash (sof funksiya)
│   ├── heatmap.py            # shubha issiqlik xaritasi (numpy + PIL)
│   └── routes_doctor.py      # FastAPI router: create_doctor_router(...)
├── static/
│   ├── doctor.html           # vrach sahifasi
│   ├── doctor.css            # uslub (alohida)
│   └── doctor.js             # frontend mantiq
├── docs/
│   ├── API.md                # endpoint spetsifikatsiyasi
│   ├── INTEGRATION.md        # platformaga ulash qadamlari
│   └── ARCHITECTURE.md       # oqim, modullar, algoritmlar
└── tests/
    └── test_diagnose.py      # birlik testlar (model tanlash + heatmap)
```

**Backend API:** `POST /api/doctor/diagnose` — DICOM render + ansambl (WBF) deteksiya +
`_cls` tashxis + shubha issiqlik xaritasi (base64); `GET /doctor` — sahifa.
Batafsil: [`docs/API.md`](docs/API.md) · ulash: [`docs/INTEGRATION.md`](docs/INTEGRATION.md) ·
arxitektura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Ulash (qisqacha):** `create_doctor_router(...)` ni `app/main.py` ga `include_router` +
`static/*` → `app/static/` + `auth.py` ROLES ga `doctor` + DB `CHECK` + akkaunt.
To'liq: `docs/INTEGRATION.md`.

**Testlar:** `cd doctor && python -m pytest -q`  (yoki `python tests/test_diagnose.py`).

**Jonli:** https://aiscan.airi.uz/doctor  ·  test akkaunt: `vrach` / `Vrach2026!mamo`

---

## 🔒 Ma'lumot maxfiyligi
Barcha yuklamalar avtomatik de-identifikatsiya qilinadi (PHI tag'lari tozalanadi):
bemor ismi/sana/ID/erkin matn olib tashlanadi. Ma'lumotlar faqat volume'larda.

_Sana: 2026-07_
