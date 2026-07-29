"""Vrach diagnostikasi uchun model tanlash — sof (pure), tashqi bog'liqliksiz.

Ansambl uchun kuchli, lekin TEZ ishlashi uchun cheklangan (<=3) model to'plami
tanlanadi. Tartib muhim: birinchi topilgan mavjud modellar olinadi.

Sozlash: ``DOCTOR_MODELS`` muhit o'zgaruvchisi (vergul bilan ajratilgan nomlar)
default ro'yxatni bekor qiladi.
"""
from __future__ import annotations

import os
from typing import Iterable

# O'z bazamizda o'qitilgan eng kuchli 8-sinf detektorlari (mavjud bo'lsa)
DEFAULT_DOCTOR_MODELS = [
    "trained_8class_ai_v2_ep50.pt",
    "trained_8class_yolo11l.pt",
    "trained_digitaleye11.pt",
]

MAX_DOCTOR_MODELS = 3


def pick_doctor_models(
    available: Iterable[str],
    env_value: str | None = None,
    default: list[str] | None = None,
    max_models: int = MAX_DOCTOR_MODELS,
) -> list[str]:
    """Mavjud modellar ichidan diagnostika ansambli uchun tanlaydi.

    Args:
        available: mavjud detection model nomlari (masalan ``inference.list_detection_models()``).
        env_value: ``DOCTOR_MODELS`` qiymati (vergulli). ``None`` bo'lsa muhitdan olinadi.
        default: default ro'yxat (``None`` -> :data:`DEFAULT_DOCTOR_MODELS`).
        max_models: eng ko'pi bilan nechta model (tezlik uchun).

    Returns:
        Tanlangan model nomlari ro'yxati (kamida 1 ta, agar mavjud bo'lsa).
    """
    avail = list(available)
    avail_set = set(avail)
    if env_value is None:
        env_value = os.environ.get("DOCTOR_MODELS", "")
    default = default if default is not None else DEFAULT_DOCTOR_MODELS

    if env_value and env_value.strip():
        picked = [x.strip() for x in env_value.split(",") if x.strip() in avail_set]
    else:
        picked = [m for m in default if m in avail_set]

    if not picked and avail:
        picked = avail[:1]

    if max_models and max_models > 0:
        picked = picked[:max_models]
    return picked
