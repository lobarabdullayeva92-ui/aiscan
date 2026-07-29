# Integratsiya — doctor modulini platformaga ulash

Doctor moduli **o'zi server emas** — u asosiy `plan_project_new` FastAPI ilovasiga ulanadi.
Ikki yo'l bor: (A) modul router (tavsiya, toza) yoki (B) inline blok (hozir jonli).

---

## A) Modul router orqali (tavsiya)

1. **Fayllarni joylashtiring**
   - `doctor/backend/` → platformadan import qilinadigan paket (masalan `app/` yoniga yoki `PYTHONPATH` ga).
   - `doctor/static/doctor.html`, `doctor.js`, `doctor.css` → `app/static/`
     (statik ildizga; sahifa `/doctor.css`, `/doctor.js` ni yuklaydi).

2. **`app/main.py` ga routerni ulang** (static mount'dan OLDIN):
   ```python
   from doctor.backend.routes_doctor import create_doctor_router
   from . import inference as inf, auth as auth_mod
   from .dicom_utils import render_frame_png

   app.include_router(create_doctor_router(
       inference=inf,
       render_frame_png=render_frame_png,
       upload_dir=UPLOAD_DIR,
       require_user=auth_mod.require_user,
       static_dir=STATIC_DIR,
       limiter=limiter,          # ixtiyoriy (slowapi)
   ))
   ```

3. **`doctor` rolini yoqing** — `app/auth.py`:
   ```python
   ROLES = ("admin", "reviewer", "annotator", "doctor")
   ```

4. **DB CHECK cheklovini kengaytiring** (SQLite `users` jadvali eski `CHECK(role IN(...))` ga ega bo'lsa):
   ```sql
   PRAGMA writable_schema=ON;
   UPDATE sqlite_master SET sql = replace(sql,
     "role IN ('admin', 'reviewer', 'annotator')",
     "role IN ('admin', 'reviewer', 'annotator', 'doctor')")
   WHERE type='table' AND name='users';
   PRAGMA schema_version = schema_version + 1;
   PRAGMA writable_schema=OFF;
   ```
   (Avval DB backup oling. Keyin ilovani restart qiling.)

5. **Vrach akkaunti**:
   ```bash
   python -m app.manage_users create vrach --role doctor --password '<parol>'
   ```

---

## B) Inline blok (hozirgi jonli holat)

`doctor/backend/routes_doctor.py` mantig'ining ekvivalenti `app/main.py` ichiga
`@app.get("/app")` marshrutidan OLDIN qo'shilgan (funksiyalar: `_doctor_det_models`,
`_suspicion_heatmap_png`, `POST /api/doctor/diagnose`, `GET /doctor`). Bu tez, lekin
kod bir joyga to'planadi; A varianti kelajakda buni tozalab almashtiradi.

---

## Deploy eslatmasi (MUHIM)
Ishlab turgan platformada kod `app_db` **named volume** ichida (`/app/app`), image
kodini soya qiladi. Shuning uchun jonli o'zgarish `docker cp` + `docker restart mamograf-app`
bilan qilinadi; `deploy_update.sh` (git rebuild) volume tufayli kodni yangilamaydi.
`docker compose down -v` — HECH QACHON (ma'lumot yo'qoladi).

## Bog'liqliklar
- `backend/models_select.py` — bog'liqliksiz (stdlib).
- `backend/heatmap.py` — `numpy`, `Pillow`.
- `backend/routes_doctor.py` — `fastapi`, `pydantic` (+ chaqiruvchi `inference`/`render`).
- Frontend — bog'liqliksiz (vanilla JS), CSP: tashqi `.js`/`.css` 'self'.
