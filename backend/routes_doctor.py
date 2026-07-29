"""Vrach (doctor) FastAPI router — asosiy ilovaga ULANADI (o'zi server emas).

Bog'liqliklar tashqaridan beriladi (dependency injection), shuning uchun bu modul
platformaning ichki importlariga qattiq bog'lanmaydi va alohida test qilinadi.

Ulash namunasi (``app/main.py`` ichida)::

    from doctor.backend.routes_doctor import create_doctor_router
    from . import inference as inf, auth as auth_mod
    from .dicom_utils import render_frame_png

    app.include_router(create_doctor_router(
        inference=inf,
        render_frame_png=render_frame_png,
        upload_dir=UPLOAD_DIR,
        require_user=auth_mod.require_user,
        static_dir=STATIC_DIR,
        limiter=limiter,               # ixtiyoriy (slowapi)
    ))

To'liq spetsifikatsiya: ``../docs/API.md`` va ``../docs/INTEGRATION.md``.
"""
from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .heatmap import suspicion_heatmap_png
from .models_select import pick_doctor_models


class DoctorDiagnoseBody(BaseModel):
    ref: str
    conf: float = 0.25
    iou: float = 0.5
    imgsz: int = 1024
    wc: Optional[float] = None
    ww: Optional[float] = None


def _safe_ref(ref: str) -> str:
    if not ref or not ref.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "invalid ref")
    return ref


def create_doctor_router(
    *,
    inference,
    render_frame_png,
    upload_dir,
    require_user,
    static_dir,
    limiter=None,
    diagnose_rate: str = "20/minute",
) -> APIRouter:
    """Doctor router'ini yasaydi. Barcha bog'liqliklar argument sifatida beriladi."""
    router = APIRouter()
    upload_dir = Path(upload_dir)
    static_dir = Path(static_dir)

    def diagnose(request: Request, body: DoctorDiagnoseBody,
                 _user: dict = Depends(require_user)):
        """Bitta so'rovda: lokalizatsiya (ansambl) + tashxis + issiqlik xaritasi."""
        _safe_ref(body.ref)
        path = upload_dir / f"{body.ref}.dcm"
        if not path.exists():
            raise HTTPException(404, "fayl topilmadi")
        try:
            png_bytes = render_frame_png(path, frame=0, wc=body.wc, ww=body.ww, max_dim=2048)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"render failed: {e}")

        # 1) Lokalizatsiya — kuchli ansambl (WBF)
        detections, image_size, used = [], [0, 0], []
        det_models = pick_doctor_models(
            [m["name"] for m in inference.list_detection_models()]
        )
        if det_models:
            try:
                r = inference.infer_ensemble(png_bytes, det_models, conf=body.conf,
                                             iou=body.iou, imgsz=body.imgsz)
                detections = r.get("detections", []) or []
                image_size = r.get("image_size", [0, 0]) or [0, 0]
                used = r.get("ensemble_models", []) or []
            except Exception:  # noqa: BLE001
                detections = []
        if not image_size or not image_size[0]:
            from PIL import Image
            im = Image.open(io.BytesIO(png_bytes))
            image_size = [im.size[0], im.size[1]]

        # 2) Tashxis — o'z bazamizdagi _cls modeli, aks holda GMIC (bo'lsa)
        diagnosis = None
        try:
            cls_models = inference.list_cls_models()
            if cls_models:
                diagnosis = inference.classify_png(
                    png_bytes, model_name=cls_models[0]["name"], imgsz=384)
        except Exception:  # noqa: BLE001
            diagnosis = None

        # 3) Shubha issiqlik xaritasi
        heatmap_b64 = None
        try:
            if detections and image_size[0]:
                hp = suspicion_heatmap_png(detections, int(image_size[0]), int(image_size[1]))
                heatmap_b64 = "data:image/png;base64," + base64.b64encode(hp).decode()
        except Exception:  # noqa: BLE001
            heatmap_b64 = None

        max_conf = max((d.get("confidence", 0.0) for d in detections), default=0.0)
        return {
            "ref": body.ref,
            "image_size": image_size,
            "detections": detections,
            "diagnosis": diagnosis,
            "heatmap_png": heatmap_b64,
            "models_used": used,
            "max_confidence": max_conf,
            "device": inference.device_info().get("device", "cpu"),
        }

    if limiter is not None:
        diagnose = limiter.limit(diagnose_rate)(diagnose)
    router.add_api_route("/api/doctor/diagnose", diagnose, methods=["POST"])

    def doctor_page():
        return FileResponse(str(static_dir / "doctor.html"), media_type="text/html")

    router.add_api_route("/doctor", doctor_page, methods=["GET"], include_in_schema=False)
    router.add_api_route("/doctor/", doctor_page, methods=["GET"], include_in_schema=False)
    return router
