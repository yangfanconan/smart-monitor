#!/usr/bin/env python3
"""
Mosaic privacy-sensitive data in smart-monitor screenshots.
Privacy data includes: device names, IP addresses, MAC addresses,
domain names, user avatars, and other identifiable information.
"""
import os
from PIL import Image, ImageFilter

SRC_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SRC_DIR, 'processed')
os.makedirs(OUT_DIR, exist_ok=True)

def mosaic(img, box, block_size=12):
    """Apply mosaic (pixelation) to a region defined by box (x1,y1,x2,y2)."""
    x1, y1, x2, y2 = box
    if x2 <= x1 or y2 <= y1:
        return img
    # Clamp to image bounds
    w, h = img.size
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    region = img.crop((x1, y1, x2, y2))
    small = region.resize(
        (max(1, (x2 - x1) // block_size), max(1, (y2 - y1) // block_size)),
        Image.NEAREST
    )
    big = small.resize((x2 - x1, y2 - y1), Image.NEAREST)
    img.paste(big, (x1, y1))
    return img

def blur_avatar(img, box):
    """Heavy blur for avatar."""
    x1, y1, x2, y2 = box
    w, h = img.size
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    region = img.crop((x1, y1, x2, y2))
    blurred = region.filter(ImageFilter.GaussianBlur(radius=15))
    img.paste(blurred, (x1, y1))
    return img

# All screenshots are approximately 1505x1215
# Regions are (x1, y1, x2, y2)

SCREENSHOTS = {
    # 1. Dashboard
    'ScreenShot_2026-06-25_163126_948.png': {
        'desc': 'Dashboard',
        'regions': [
            (210, 620, 560, 970),
            (570, 620, 1100, 970),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_150932_715.png': {
        'desc': 'System Detail',
        'regions': [('avatar', 1445, 8, 1498, 52)]
    },
    'ScreenShot_2026-06-29_150939_252.png': {
        'desc': 'Network Traffic',
        'regions': [('avatar', 1445, 8, 1498, 52)]
    },
    'ScreenShot_2026-06-29_150945_842.png': {
        'desc': 'Connection Analysis',
        'regions': [
            (225, 490, 500, 820),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_150952_359.png': {
        'desc': 'User Traffic',
        'regions': [
            (140, 310, 560, 1180),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_151006_915.png': {
        'desc': 'Access Records',
        'regions': [
            (210, 230, 560, 1180),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_151014_276.png': {
        'desc': 'Security Center',
        'regions': [
            (235, 490, 700, 1180),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_151022_308.png': {
        'desc': 'Alert Center',
        'regions': [
            (335, 190, 860, 840),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_151036_870.png': {
        'desc': 'Behavior Analysis',
        'regions': [
            (210, 370, 400, 1150),
            (545, 370, 1050, 1150),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_151042_489.png': {
        'desc': 'Content Inspection',
        'regions': [
            (275, 420, 470, 1000),
            (470, 420, 950, 1000),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_151048_937.png': {
        'desc': 'Data Management',
        'regions': [('avatar', 1445, 8, 1498, 52)]
    },
    'ScreenShot_2026-06-29_151055_143.png': {
        'desc': 'IP Intelligence',
        'regions': [
            (210, 310, 870, 820),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_151101_597.png': {
        'desc': 'Geo Dashboard',
        'regions': [
            (895, 680, 1030, 940),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
    'ScreenShot_2026-06-29_151114_096.png': {
        'desc': 'Network Topology',
        'regions': [
            (350, 460, 1050, 920),
            ('avatar', 1445, 8, 1498, 52),
        ]
    },
}

def process_screenshot(filename, config):
    src = os.path.join(SRC_DIR, filename)
    if not os.path.exists(src):
        print(f"  SKIP: {filename} not found")
        return

    img = Image.open(src)
    print(f"  Processing: {filename} ({img.size[0]}x{img.size[1]})")

    for region in config['regions']:
        if region[0] == 'avatar':
            _, x1, y1, x2, y2 = region
            blur_avatar(img, (x1, y1, x2, y2))
        else:
            mosaic(img, region, block_size=10)

    out = os.path.join(OUT_DIR, filename)
    img.save(out, 'PNG', optimize=True)
    print(f"  Saved: {out}")

def main():
    print(f"Processing {len(SCREENSHOTS)} screenshots...")
    print(f"Output directory: {OUT_DIR}\n")

    for filename, config in SCREENSHOTS.items():
        print(f"[{config['desc']}]")
        process_screenshot(filename, config)

    print(f"\nDone! {len(SCREENSHOTS)} screenshots processed.")

if __name__ == '__main__':
    main()
