"""Build the classic Alice character pack from the existing 8 x 11 atlas."""

import argparse
import json
from pathlib import Path

from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Original 1536 x 2288 RGBA atlas")
    args = parser.parse_args()
    source = Image.open(args.source).convert("RGBA")
    if source.size != (1536, 2288):
        raise ValueError(f"Unexpected source atlas size: {source.size}")

    target = Path(__file__).resolve().parents[1] / "assets" / "characters" / "classic-alice"
    target.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (1536, 2496), (0, 0, 0, 0))
    atlas.paste(source, (0, 0))
    # Keep the source pixels unaltered. Row 11 holds the original standing,
    # eyes-closed cell for a stable, non-lying sleep pose.
    atlas.paste(source.crop((384, 0, 576, 208)), (0, 2288))
    atlas.save(target / "sprite.png", optimize=True)
    source.crop((0, 0, 192, 208)).save(target / "preview.png", optimize=True)

    states = {
        "idle": (0, 6, 165),
        "runningRight": (1, 8, 95),
        "runningLeft": (2, 8, 95),
        "waving": (3, 4, 145),
        "jumping": (4, 5, 125),
        "failed": (5, 8, 220),
        "running": (1, 8, 95),
        "review": (8, 6, 165),
        "sleep": (11, 1, 600),
    }
    manifest = {
        "schemaVersion": 1,
        "id": "classic-alice",
        "name": "经典红发艾莉丝",
        "description": "原版经典 Q 版艾莉丝动画图集，闭眼站姿睡眠。",
        "sprite": "sprite.png",
        "preview": "preview.png",
        "frame": {"width": 192, "height": 208},
        "columns": 8,
        "states": {name: {"row": row, "frames": frames, "interval": interval}
                   for name, (row, frames, interval) in states.items()},
        "automaticActions": ["review", "waving", "jumping"],
        "clickActions": ["waving", "review", "jumping", "failed"],
        "staticExpressions": [{"state": "idle", "frame": i} for i in range(6)],
    }
    (target / "character.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Created {target}")


if __name__ == "__main__":
    main()
