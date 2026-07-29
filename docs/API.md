# Doctor API

Barcha so'rovlar autentifikatsiya talab qiladi: `Authorization: Bearer <JWT>`
(login `POST /api/auth/login`). Rasm `<img>` uchun login o'rnatgan HttpOnly cookie ham ishlaydi.

---

## `POST /api/doctor/diagnose`

Yuklab bo'lingan DICOM uchun bitta so'rovda: lokalizatsiya (ansambl deteksiya) +
tashxis (benign/malignant) + shubha issiqlik xaritasi.

**So'rov (JSON):**
```json
{ "ref": "<upload_id>", "conf": 0.25, "iou": 0.5, "imgsz": 1024, "wc": null, "ww": null }
```
| Maydon | Turi | Default | Izoh |
|--------|------|---------|------|
| `ref` | string | — | `POST /api/upload` qaytargan fayl id (majburiy) |
| `conf` | float | 0.25 | deteksiya ishonch chegarasi |
| `iou` | float | 0.5 | NMS IoU |
| `imgsz` | int | 1024 | inferens o'lchami |
| `wc`, `ww` | float | null | window center/width (ixtiyoriy) |

**Javob (JSON):**
```json
{
  "ref": "…",
  "image_size": [1633, 2048],
  "detections": [
    {"label": "mass", "class_id": 0, "confidence": 0.81, "bbox": [x, y, w, h], "n_models": 3}
  ],
  "diagnosis": {
    "model": "trained_bm_yolo11m_cls.pt",
    "top1_label": "malignant", "top1_conf": 0.716,
    "probs": {"benign": 0.284, "malignant": 0.716}
  },
  "heatmap_png": "data:image/png;base64,…",
  "models_used": ["trained_8class_ai_v2_ep50.pt", "…"],
  "max_confidence": 0.81,
  "device": "cpu"
}
```
- `bbox` — normallashgan `[x, y, w, h]` (0..1).
- `diagnosis` — `null` bo'lishi mumkin (klassifikator topilmasa).
- `heatmap_png` — `data:` URL, bevosita `<img src>` ga qo'yiladi (`null` bo'lishi mumkin).

**Namuna:**
```bash
TOKEN=$(curl -s -X POST /api/auth/login -H 'content-type: application/json' \
  -d '{"username":"vrach","password":"…"}' | jq -r .token)
curl -s -X POST /api/doctor/diagnose -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"ref":"<id>"}'
```

**Xatolar:** `400` noto'g'ri ref · `404` fayl yo'q · `401` auth · `429` rate-limit (20/min).

---

## `GET /doctor`, `GET /doctor/`
Vrach sahifasini (`static/doctor.html`) qaytaradi. Auth sahifa ichida (login modal) amalga oshadi.

## Foydalaniladigan mavjud endpointlar
- `POST /api/upload` — DICOM yuklash → `{files:[{id, has_pixels, ...}]}`
- `GET /api/files/{id}/image?max_dim=2048` — render qilingan PNG (Bearer/cookie)
- `POST /api/auth/login|logout|me` — autentifikatsiya
