# Modellar — AI Scan doctor

Doctor diagnostikasida ishlatiladigan model fayllari. Barchasi shu papkada mavjud
(serverda). GitHub'da 100MB dan katta fayllar (LFS'siz) qabul qilinmaydi, shuning
uchun ikkitasi `.gitignore` orqali repodan chetlangan — lekin serverdagi papkada bor.

| Fayl | Hajm | Vazifasi | GitHub'da |
|------|------|----------|-----------|
| `trained_8class_yolo11l.pt` | ~49 MB | **Default detektor** (8-sinf, YOLO11l) — o'choqlarni topish | ✅ bor |
| `trained_bm_yolo11m_cls.pt` | ~20 MB | **Klassifikator** (benign/malignant tashxis) | ✅ bor |
| `gmic/gmic_bm_finetuned.pt` | ~54 MB | GMIC (NYU MIL) — muqobil tashxis (backup) | ✅ bor |
| `trained_digitaleye11.pt` | ~109 MB | Ansambl uchun qo'shimcha detektor (ixtiyoriy) | ❌ >100MB (faqat serverda) |
| `trained_8class_ai_v2_ep50.pt` | ~154 MB | Ansambl uchun eng kuchli detektor (ixtiyoriy) | ❌ >100MB (faqat serverda) |

## Qaysi model ishlatiladi
- **Default:** `DOCTOR_MAX_MODELS=1` — faqat `trained_8class_yolo11l.pt` (tez) + klassifikator.
- **Ansambl (ixtiyoriy):** `DOCTOR_MAX_MODELS>1` yoki `DOCTOR_MODELS=...` env berilsa,
  `backend/models_select.py` dagi ro'yxatdan (yolo11l → digitaleye11 → 8class_ai_v2) ≤N ta olinadi (WBF).
- Tanlash mantig'i: `backend/models_select.py`.

## Katta modellarni olish (server)
Konteynerdan:
```
docker cp mamograf-app:/app/app/models/trained_8class_ai_v2_ep50.pt ./
docker cp mamograf-app:/app/app/models/trained_digitaleye11.pt ./
```
Yoki GitHub'ga yuborish kerak bo'lsa — Git LFS o'rnatib `git lfs track "*.pt"` qilinadi.
