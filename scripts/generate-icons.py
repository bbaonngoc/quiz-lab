"""Render the code-native QuizLab mark into PWA PNGs; no dependencies."""
import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'icons'
PRIMARY = (37, 99, 166)
WHITE = (255, 255, 255)
ACCENT = (166, 207, 242)

def segment_distance(x, y, ax, ay, bx, by):
    t = max(0, min(1, ((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)))
    return (x-ax-t*(bx-ax))**2+(y-ay-t*(by-ay))**2

def sample(x, y, maskable):
    if not maskable:
        dx, dy = max(112-x, 0, x-400), max(112-y, 0, y-400)
        if dx*dx+dy*dy > 112*112:
            return (0, 0, 0, 0)
    if maskable:
        x, y = 256+(x-256)/.78, 256+(y-256)/.78
    radius = (x-256)**2+(y-246)**2
    color = PRIMARY
    if 86**2 <= radius <= 130**2 or segment_distance(x,y,340,330,399,389) <= 21**2:
        color = WHITE
    if segment_distance(x,y,216,248,244,277) <= 11.5**2 or segment_distance(x,y,244,277,298,217) <= 11.5**2:
        color = ACCENT
    return (*color, 255)

def chunk(kind, data):
    return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)

def render(size, filename, maskable=False):
    rows = bytearray()
    scale = 512 / size
    for y in range(size):
        rows.append(0)
        for x in range(size):
            samples = [sample((x+sx)*scale,(y+sy)*scale,maskable) for sx,sy in ((.25,.25),(.75,.25),(.25,.75),(.75,.75))]
            alpha = sum(c[3] for c in samples)
            rgb = [round(sum(c[i]*c[3] for c in samples)/alpha) if alpha else 0 for i in range(3)]
            rows.extend((*rgb,round(alpha/4)))
    png = b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows,9))+chunk(b'IEND',b'')
    (ROOT / filename).write_bytes(png)
    print(filename)

for size, filename, maskable in ((192,'icon-192.png',False),(512,'icon-512.png',False),(512,'maskable-512.png',True),(180,'apple-touch-icon.png',True)):
    render(size, filename, maskable)
