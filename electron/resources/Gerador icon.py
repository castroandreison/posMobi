import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'icon.jpeg'
W = 256
OUT_PNG = r'C:\Users\an053116\Documents\01 - Códigos python\45 - Monitor-Pósvenda\electron\public\icon.png'
OUT_ICO = r'C:\Users\an053116\Documents\01 - Códigos python\45 - Monitor-Pósvenda\electron\resources\icon.ico'
OUT_ICO_PUB = r'C:\Users\an053116\Documents\01 - Códigos python\45 - Monitor-Pósvenda\electron\public\icon.ico'

img = Image.open(SRC).convert('RGBA')
arr = np.array(img, dtype=np.int32)
h, w, _ = arr.shape

r = arr[:, :, 0].astype(np.float64)
g = arr[:, :, 1].astype(np.float64)
b = arr[:, :, 2].astype(np.float64)
mx = np.maximum(np.maximum(r, g), b)
mn = np.minimum(np.minimum(r, g), b)

# saturação: diferença max-min. Cinza (fundo) tem saturação baixa; verde saturado tem saturação alta.
sat = mx - mn

# não-fundo = saturação significativa OU muito claro (branco puro).
# Preserva verdes e brancos; remove o cinza (saturacao baixa e escuro/medio).
is_sat = sat > 45
is_white = mx > 235
content = is_sat | is_white
bg = ~content

# flood fill: remove componentes de fundo que tocam a borda (o cinza periférico),
# preservando ilhas de cinza dentro do logo (se houver)
labels, n = ndimage.label(bg)
border = np.zeros_like(bg)
border[0, :] = True
border[-1, :] = True
border[:, 0] = True
border[:, -1] = True
border_labels = np.unique(labels[border & bg])
border_labels = border_labels[border_labels != 0]
to_remove = np.isin(labels, border_labels)

out = arr.copy()
out[to_remove, 3] = 0
# borda cortada do cinza: transição suave de alpha nos pixels cinza restantes adjacentes
out_img = Image.fromarray(np.uint8(out), 'RGBA')

bbox = out_img.getbbox()
content_img = out_img.crop(bbox) if bbox else out_img
cw, ch = content_img.size
scale = min((W * 0.95) / cw, (W * 0.95) / ch)
nw = max(1, int(cw * scale))
nh = max(1, int(ch * scale))
content_img = content_img.resize((nw, nh), Image.LANCZOS)
canvas = Image.new('RGBA', (W, W), (0, 0, 0, 0))
canvas.paste(content_img, ((W - nw) // 2, (W - nh) // 2), content_img)

canvas.save(OUT_PNG, format='PNG')
canvas.save(OUT_ICO, format='ICO', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
canvas.save(OUT_ICO_PUB, format='ICO', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

ca = np.array(canvas)
cr = ca[:,:,0].astype(float); cg = ca[:,:,1].astype(float); cb = ca[:,:,2].astype(float)
keep = ca[:,:,3] > 20
greenish = keep & (cg > cr+15) & (cg > cb+15) & (cg > 60)
print(f'gerado: transparente {(ca[:,:,3]==0).mean()*100:.1f}%, opaco {(ca[:,:,3]>0).mean()*100:.1f}%')
print(f'verdes preservados (opacos): {int(greenish.sum())}')
idx = np.argwhere(greenish)
if len(idx):
    step = max(1, len(idx)//6)
    print(' amostra verdes:', [tuple(int(v) for v in ca[y,x][:3]) for (y,x) in idx[::step][:6]])
print('PNG:', OUT_PNG)
