"""Generate raster favicons from the BrandMark geometry.

Source of truth: frontend/web/src/design-system/BrandMark.tsx —
two rounded "cards" (6x9, r1.2 on a 16-unit grid) on the brand-blue square.
Run: python3 scripts/generate_favicons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "frontend" / "web" / "public"

BLUE = (0, 113, 227, 255)  # --c-blue light theme (#0071E3)
WHITE_95 = (255, 255, 255, 242)
WHITE_55 = (255, 255, 255, 140)

SUPERSAMPLE = 8
CORNER_RATIO = 14 / 64  # matches favicon.svg rx
GLYPH_RATIO = 0.6  # BrandMark renders the glyph at 3/5 of the tile


def render(size: int, *, rounded: bool) -> Image.Image:
    s = size * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = s * CORNER_RATIO if rounded else 0
    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=BLUE)

    unit = s * GLYPH_RATIO / 16
    offset = s * (1 - GLYPH_RATIO) / 2

    def card(x: float, y: float, fill: tuple) -> None:
        draw.rounded_rectangle(
            [offset + x * unit, offset + y * unit, offset + (x + 6) * unit, offset + (y + 9) * unit],
            radius=1.2 * unit,
            fill=fill,
        )

    card(1.5, 1.5, WHITE_95)
    card(8.5, 5.5, WHITE_55)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    # Browser tab PNG: rounded tile with transparent corners.
    render(96, rounded=True).save(PUBLIC / "favicon-96x96.png")

    # iOS home screen: full-bleed square, iOS applies its own corner mask.
    render(180, rounded=False).save(PUBLIC / "apple-touch-icon.png")

    # PWA manifest icons (any + maskable): full-bleed, glyph stays inside
    # the maskable safe zone (centre 80%) because it occupies 60%.
    render(192, rounded=False).save(PUBLIC / "web-app-manifest-192x192.png")
    render(512, rounded=False).save(PUBLIC / "web-app-manifest-512x512.png")

    # Multi-size ICO for legacy browser lookups.
    ico_sizes = [16, 32, 48]
    frames = [render(size, rounded=True) for size in ico_sizes]
    frames[0].save(
        PUBLIC / "favicon.ico",
        format="ICO",
        append_images=frames[1:],
        sizes=[(size, size) for size in ico_sizes],
    )

    for name in [
        "favicon-96x96.png",
        "apple-touch-icon.png",
        "web-app-manifest-192x192.png",
        "web-app-manifest-512x512.png",
        "favicon.ico",
    ]:
        print(f"written {PUBLIC / name}")


if __name__ == "__main__":
    main()
