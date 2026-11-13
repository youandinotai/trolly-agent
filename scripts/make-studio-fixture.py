from pathlib import Path
from PIL import Image, ImageDraw

out = Path('D:/Trolly/data/verification')
out.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (512, 512), '#24101f')
draw = ImageDraw.Draw(image)
for y in range(0, 512, 64):
    for x in range(0, 512, 64):
        color = '#fb7185' if (x // 64 + y // 64) % 2 == 0 else '#67e8f9'
        draw.polygon([(x + 32, y + 6), (x + 58, y + 32), (x + 32, y + 58), (x + 6, y + 32)], outline=color, width=5)
        draw.ellipse((x + 25, y + 25, x + 39, y + 39), fill='#fff7ed')
draw.rectangle((0, 232, 512, 280), fill='#e11d48')
file = out / 'studio-cloth-pattern.png'
image.save(file)
print(file)
