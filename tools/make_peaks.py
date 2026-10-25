#!/usr/bin/env python3
"""Робить форму хвилі для кожного mp3: audio/ua/01.mp3 -> audio/ua/01.json.

Запуск з кореня сайту (потрібен ffmpeg):
    python3 tools/make_peaks.py audio/ua audio/en

Якщо json поруч із mp3 немає, сайт малює тимчасову хвилю, яка не відповідає запису.
"""
import json
import math
import pathlib
import struct
import subprocess
import sys

BARS = 240


def peaks(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
        capture_output=True, check=True,
    ).stdout
    n = len(raw) // 2
    samples = struct.unpack("<%dh" % n, raw[: n * 2])
    bucket = max(1, n // BARS)
    rms = []
    for i in range(BARS):
        seg = samples[i * bucket:(i + 1) * bucket] or (0,)
        rms.append(math.sqrt(sum(x * x for x in seg) / len(seg)))
    # розтягуємо діапазон: тиша внизу, акценти вгорі, щоб хвиля читалась
    ordered = sorted(rms)
    lo = ordered[int(0.05 * (BARS - 1))]
    hi = ordered[int(0.98 * (BARS - 1))] or 1
    span = max(hi - lo, 1e-9)
    return [round(min(1.0, max(0.06, (v - lo) / span)), 2) for v in rms]


def main(folders):
    if not folders:
        print(__doc__)
        return 1
    for folder in folders:
        for mp3 in sorted(pathlib.Path(folder).glob("*.mp3")):
            target = mp3.with_suffix(".json")
            target.write_text(json.dumps(peaks(mp3)), encoding="utf-8")
            print("ok", target)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
