"""Vrach moduli uchun birlik testlari (og'ir bog'liqliksiz).

Ishga tushirish:
    cd doctor && python -m pytest -q          # yoki
    python tests/test_diagnose.py             # pytest'siz ham ishlaydi

Testlar sof modullarni tekshiradi: model tanlash (models_select) va
issiqlik xaritasi (heatmap). FastAPI/torch/ultralytics KERAK EMAS
(faqat heatmap uchun numpy + Pillow).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.models_select import pick_doctor_models, DEFAULT_DOCTOR_MODELS  # noqa: E402
from backend import heatmap  # noqa: E402


# ------------------------------- models_select ----------------------------- #
def test_default_pick_prefers_known_and_caps_at_3():
    avail = DEFAULT_DOCTOR_MODELS + ["extra_a.pt", "extra_b.pt"]
    picked = pick_doctor_models(avail, env_value="")
    assert picked == DEFAULT_DOCTOR_MODELS          # default ro'yxat, tartibda
    assert len(picked) <= 3


def test_env_override_filters_to_available():
    avail = ["m1.pt", "m2.pt", "m3.pt"]
    picked = pick_doctor_models(avail, env_value="m2.pt, mX.pt , m1.pt")
    assert picked == ["m2.pt", "m1.pt"]             # mavjud bo'lganlar, tartibda


def test_fallback_to_first_when_no_default_present():
    avail = ["only_this.pt", "and_that.pt"]
    picked = pick_doctor_models(avail, env_value="")
    assert picked == ["only_this.pt"]               # default yo'q -> birinchi mavjud


def test_empty_available_returns_empty():
    assert pick_doctor_models([], env_value="") == []


def test_max_models_respected():
    avail = ["a.pt", "b.pt", "c.pt", "d.pt"]
    picked = pick_doctor_models(avail, env_value="a.pt,b.pt,c.pt,d.pt", max_models=2)
    assert picked == ["a.pt", "b.pt"]


# --------------------------------- heatmap ---------------------------------- #
def _png_size(b):
    # PNG sarlavhasi: 8 bayt imzo + IHDR (width/height 16..24 baytlarda, big-endian)
    import struct
    assert b[:8] == b"\x89PNG\r\n\x1a\n"
    w, h = struct.unpack(">II", b[16:24])
    return w, h


def test_heatmap_png_dimensions_and_signature():
    dets = [{"bbox": [0.4, 0.4, 0.2, 0.2], "confidence": 0.9}]
    png = heatmap.suspicion_heatmap_png(dets, 256, 200)
    assert isinstance(png, (bytes, bytearray)) and len(png) > 0
    w, h = _png_size(png)
    assert (w, h) == (256, 200)


def test_heatmap_empty_detections_ok():
    png = heatmap.suspicion_heatmap_png([], 64, 64)
    w, h = _png_size(png)
    assert (w, h) == (64, 64)                       # bo'sh bo'lsa ham to'g'ri o'lcham


def test_heatmap_data_url_prefix():
    url = heatmap.heatmap_data_url([{"bbox": [0.1, 0.1, 0.2, 0.2], "confidence": 0.5}], 128, 128)
    assert url.startswith("data:image/png;base64,")


# --------------------------- pytest'siz ishga tushirish --------------------- #
if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("PASS", name)
            except Exception as e:  # noqa: BLE001
                fails += 1
                print("FAIL", name, "->", repr(e))
    print("\n%d ta test, %d xato" % (
        len([k for k in globals() if k.startswith("test_")]), fails))
    sys.exit(1 if fails else 0)
