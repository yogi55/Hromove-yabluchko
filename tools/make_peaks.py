#!/usr/bin/env python3
"""Робить форму хвилі для кожного mp3: audio/ua/01.mp3 -> audio/ua/01.json.

Запуск з кореня сайту (потрібен ffmpeg):
    python3 tools/make_peaks.py audio/ua audio/en

Якщо json поруч із mp3 немає, сайт малює тимчасову хвилю, яка не відповідає запису.
"""
import json
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
    out = []
    for i in range(BARS):
        seg = samples[i * bucket:(i + 1) * bucket] or (0,)
        out.append(max(abs(x) for x in seg))
    top = max(out) or 1
    return [round((v / top) ** 0.7, 2) for v in out]


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
