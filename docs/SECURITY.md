# Xavfsizlik — Doctor moduli

## Autentifikatsiya
- JWT (`Authorization: Bearer`, localStorage `mamograf_jwt`) + HttpOnly cookie (rasm `<img>` uchun).
- Login rate-limit (10/min) + akkaunt qulflash (lockout).
- Doctor endpointlari rate-limit: `POST /api/doctor/diagnose` 20/min, `POST /api/doctor/advice` 10/min.

## Rol: `doctor` — deny-list (eng kam imtiyoz)
`doctor` roli faqat diagnostika uchun kerakli endpointlarga kiradi. Nozik amallar
platformaning `security_headers` middleware'ida taqiqlanadi (faqat `doctor` roliga ta'sir qiladi):

```python
_DOCTOR_DENY_PREFIXES = (
    "/api/local", "/api/annotations", "/api/export", "/api/training", "/api/report",
    "/api/models", "/api/settings", "/api/system", "/api/radiomics", "/api/boolfs",
    "/api/pacs", "/api/mwl", "/api/audit", "/api/trash", "/api/import",
)
def _doctor_denied(method, path):
    if method == "DELETE":
        return True
    return any(path.startswith(p) for p in _DOCTOR_DENY_PREFIXES)
# middleware: 401 tekshiruvidan keyin —
#   if role == "doctor" and _doctor_denied(method, path): return 403
```

| Amal | Doctor |
|------|--------|
| `/api/doctor/*`, `/api/inference/*`, `/api/upload`, `/api/files/{id}/image`, `/api/auth/*` | ✅ ruxsat |
| `DELETE` (fayl o'chirish) | ⛔ 403 |
| dataset ko'rish (`/api/local`), annotatsiya, o'qitish, eksport, model/sozlama boshqaruvi | ⛔ 403 |

## XSS / injeksiya
- Frontend barcha dinamik matnni `esc()` bilan chiqaradi; CSP `script-src 'self'` — inline skript bloklangan.
- `ref` (upload id) serverda `_validate_ref` bilan tekshiriladi (alnum + `-_`), path-traversal yo'q.
- Ollama tavsiyasi (`advice`) foydalanuvchiga `esc()` bilan ko'rsatiladi.

## Ma'lumot maxfiyligi
- Yuklamalar avtomatik de-identifikatsiya qilinadi (PHI tag'lari tozalanadi).
- Model vaznlari (`*.pt`) odatda repoga yuborilmaydi (`.gitignore`); faqat 2 ta asosiy model ochiq
  (foydalanuvchi so'roviga ko'ra). Maxfiylik kerak bo'lsa repo private qilinadi.

## Tavsiyalar
- Doctor akkauntlariga kuchli parol; birinchi kirishdan keyin almashtirish.
- Ixtiyoriy: `doctor` roli uchun TOTP (2FA) — `/admin/settings` → `totp_required_roles`.
- Doctor akkauntlar admin panelidan yoki CLI orqali yaratiladi:
  `python -m app.manage_users create <user> --role doctor --password '<parol>'`
