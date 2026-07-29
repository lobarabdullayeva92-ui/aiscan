"""AI Scan — vrach (doctor) diagnostika moduli.

Bu paket doctor sahifasining backend qismini toza, ulanuvchi (pluggable)
modullar ko'rinishida jamlaydi:

- ``models_select``  — diagnostika uchun eng yaxshi model(lar)ni tanlash (sof funksiya)
- ``heatmap``        — deteksiyalardan "shubha" issiqlik xaritasini yasash (numpy + PIL)
- ``routes_doctor``  — FastAPI router (``create_doctor_router(...)``), asosiy ilovaga ulanadi

Asosiy platforma (``app/main.py``) ga ta'sir qilmaydi — u yerdan chaqiriladi.
Batafsil: ``../docs/INTEGRATION.md``.
"""

from .models_select import DEFAULT_DOCTOR_MODELS, pick_doctor_models
from .heatmap import suspicion_heatmap_png, render_heat_rgba_png

__all__ = [
    "DEFAULT_DOCTOR_MODELS",
    "pick_doctor_models",
    "suspicion_heatmap_png",
    "render_heat_rgba_png",
]
