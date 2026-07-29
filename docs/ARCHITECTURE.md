# Arxitektura — Doctor moduli

## Umumiy oqim

```
  Vrach (brauzer, /doctor)
        │  1. login (JWT)                 POST /api/auth/login
        │  2. DICOM yuklash               POST /api/upload            -> {ref}
        │  3. diagnostika                 POST /api/doctor/diagnose {ref}
        ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  routes_doctor.create_doctor_router()  (FastAPI, ulanadigan)       │
 │    a) render_frame_png(DICOM) ─────────────► PNG (2048px)          │
 │    b) models_select.pick_doctor_models() ──► <=3 kuchli detektor   │
 │    c) inference.infer_ensemble(...)  (WBF) ─► detections + o'lcham  │
 │    d) inference.classify_png(_cls)  ───────► benign/malignant      │
 │    e) heatmap.suspicion_heatmap_png(...) ──► issiqlik xaritasi PNG │
 └──────────────────────────────────────────────────────────────────┘
        │  JSON: {detections, diagnosis, heatmap_png(base64), ...}
        ▼
  4. rasm  GET /api/files/{ref}/image  (Bearer, blob)
  5. doctor.js: bazaviy rasm + heatmap qatlam + bbox overlay + tashxis paneli
```

## Modullar mas'uliyati

| Fayl | Mas'uliyat | Bog'liqlik |
|------|-----------|------------|
| `backend/models_select.py` | Diagnostika ansambli uchun eng yaxshi ≤3 modelni tanlash (sof funksiya, env bilan sozlanadi) | yo'q (stdlib) |
| `backend/heatmap.py` | Deteksiyalardan ishonch-vaznli Gauss "shubha" xaritasi; sariq→qizil RGBA render | numpy, Pillow |
| `backend/routes_doctor.py` | FastAPI router (DI orqali): `/api/doctor/diagnose`, `/doctor` | fastapi, pydantic |
| `static/doctor.html/.css/.js` | Vrach UI: login, yuklash, ko'ruvchi (overlay), tashxis paneli | yo'q (vanilla) |

## Model tanlash mantig'i
1. `DOCTOR_MODELS` env bo'lsa — o'shandagi mavjud modellar (tartibda).
2. Aks holda default: `trained_8class_ai_v2_ep50.pt`, `trained_8class_yolo11l.pt`, `trained_digitaleye11.pt` (mavjudlari).
3. Hech biri yo'q bo'lsa — birinchi mavjud detektor.
4. Tezlik uchun ≤3 ta (CPU'da ~8s/3-model).

## Issiqlik xaritasi algoritmi
Har deteksiya markazida `conf` bilan vaznlangan 2D Gauss dog'i (σ = bbox yarmi),
oyna ±3σ; dog'lar `max` bilan birlashtiriladi; global maksimumga normallashtirilib,
gamma (0.7) qo'llanadi; `R=255, G=255·(1−h), B=0, A=200·h` → sariqdan qizilgacha,
shaffoflik issiqlikka bog'liq. Tasvir ustiga `object-fit:contain` bilan qatlanadi.

## Tashxis manbai
1-navbatda o'z bazamizda o'qitilgan YOLO `_cls.pt` (`trained_bm_yolo11m_cls.pt`,
benign/malignant). Muqobil: GMIC (NYU MIL fine-tune) — apparatga bog'liq, qoralama.

## Xavfsizlik / chegara
- Auth: JWT (Bearer) + HttpOnly cookie; `require_user` (har qanday rol; vrachlar uchun mo'ljallangan).
- Rate-limit: `20/minute` (slowapi, ixtiyoriy).
- DICOM yuklashda avtomatik de-identifikatsiya (platforma darajasida).
- Annotatsiya/o'qitish/admin endpointlari bu modulga KIRMAYDI.
```
