from PIL import Image, ImageDraw

for size in (192, 512):
    image = Image.new('RGB', (size, size), '#090c0a')
    draw = ImageDraw.Draw(image)
    draw.ellipse((size * .17, size * .17, size * .83, size * .83), fill='#a7f46c')
    draw.line([(size * .31, size * .51), (size * .44, size * .64), (size * .70, size * .36)], fill='#10170d', width=int(size * .08), joint='curve')
    image.save(f'public/icon-{size}.png')
