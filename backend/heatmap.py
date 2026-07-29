"""Shubha issiqlik xaritasi — deteksiyalardan (numpy + PIL).

Har bir deteksiya markazida ishonch bilan vaznlangan Gauss "dog'i" qo'yiladi;
ustma-ust dog'lar ``max`` bilan birlashtiriladi. Natija sariq->qizil gradient
RGBA PNG (alfa = issiqlik) sifatida qaytadi — tibbiy tasvir ustiga qatlanadi.

Sof modul: faqat numpy va Pillow kerak (asosiy platforma importlarisiz).
"""
from __future__ import annotations

import io
from typing import Sequence


def suspicion_heatmap_png(dets: Sequence[dict], W: int, H: int, gamma: float = 0.7) -> bytes:
    """Deteksiyalardan shubha issiqlik xaritasi PNG (RGBA) baytlarini qaytaradi.

    Args:
        dets: ``[{"bbox": [x, y, w, h], "confidence": float}, ...]`` — bbox 0..1 normallashgan.
        W, H: chiqish o'lchamlari (piksel).
        gamma: kontrast (past qiymatlarni ko'rsatish uchun ``**gamma``).
    """
    import numpy as np

    W, H = int(W), int(H)
    heat = np.zeros((H, W), dtype=np.float32)
    for d in dets or []:
        bbox = d.get("bbox") or [0, 0, 0, 0]
        if len(bbox) < 4:
            continue
        c = float(d.get("confidence", 0.0) or 0.0)
        if c <= 0:
            continue
        x = float(bbox[0]) * W
        y = float(bbox[1]) * H
        w = float(bbox[2]) * W
        h = float(bbox[3]) * H
        cx, cy = x + w / 2.0, y + h / 2.0
        sx, sy = max(1.0, w / 2.0), max(1.0, h / 2.0)
        x0, x1 = max(0, int(cx - 3 * sx)), min(W, int(cx + 3 * sx))
        y0, y1 = max(0, int(cy - 3 * sy)), min(H, int(cy + 3 * sy))
        if x1 <= x0 or y1 <= y0:
            continue
        xs = np.arange(x0, x1)
        ys = np.arange(y0, y1)
        gx = np.exp(-((xs - cx) ** 2) / (2 * sx * sx))
        gy = np.exp(-((ys - cy) ** 2) / (2 * sy * sy))
        blob = c * np.outer(gy, gx)
        heat[y0:y1, x0:x1] = np.maximum(heat[y0:y1, x0:x1], blob)
    return render_heat_rgba_png(heat, gamma=gamma)


def render_heat_rgba_png(heat, gamma: float = 0.7) -> bytes:
    """``heat`` (HxW float32) -> sariq->qizil RGBA PNG (alfa = normallashgan issiqlik)."""
    import numpy as np
    from PIL import Image

    heat = np.asarray(heat, dtype=np.float32)
    H, W = heat.shape
    mx = float(heat.max()) if heat.size else 0.0
    h = heat / mx if mx > 0 else heat
    h = np.clip(h, 0.0, 1.0) ** gamma
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    rgba[..., 0] = 255                                   # R = 255
    rgba[..., 1] = (255 * (1.0 - h)).astype(np.uint8)    # G susayadi -> qizil
    rgba[..., 2] = 0                                     # B = 0
    rgba[..., 3] = (200 * h).astype(np.uint8)            # alfa = issiqlik
    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def heatmap_data_url(dets: Sequence[dict], W: int, H: int) -> str:
    """Frontend uchun ``data:image/png;base64,...`` URL (bevosita ``<img src>``)."""
    import base64

    png = suspicion_heatmap_png(dets, W, H)
    return "data:image/png;base64," + base64.b64encode(png).decode()
