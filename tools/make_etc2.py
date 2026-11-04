# p4b (DOT texture memory): GPU-compressed ETC2 RGBA8/EAC copies (1 byte/px instead of 4) of the biggest sprite textures, for Android WebGL2.
# Output art-src/<name>.etc2.bin (gzip bytes): 16-byte header ('ETC2', w, h, 0 as uint32 LE) + raw blocks, rows pre-flipped (compressed textures cannot flipY), gzipped
# (the client inflates with DecompressionStream). The webp stays the fallback when WEBGL_compressed_texture_etc is missing (desktop).
import etcpak, gzip, struct, sys, numpy as np
from PIL import Image
NAMES = sys.argv[1:] or ['gray_atlas', 'hero', 'hero_overhead', 'hero_headbang', 'hero_flinch']
for n in NAMES:
  im = Image.open(f'/workspace/cr9-v44/art-src/{n}.webp').convert('RGBA'); w, h = im.size; W, H = (w + 3) // 4 * 4, (h + 3) // 4 * 4
  if (W, H) != (w, h): c = Image.new('RGBA', (W, H), (0, 0, 0, 0)); c.paste(im, (0, 0)); im = c  # pad right/bottom (UVs scaled by w/W, h/H on the client)
  a = np.ascontiguousarray(np.asarray(im.transpose(Image.FLIP_TOP_BOTTOM)))
  blk = etcpak.compress_etc2_rgba(a.tobytes(), W, H)
  data = struct.pack('<4sIII', b'ETC2', W, H, w | (h << 16)) + blk
  open(f'/workspace/cr9-v44/art-src/{n}.etc2.bin', 'wb').write(gzip.compress(data, 9))
  print(n, (W, H), 'gpu', round(len(blk) / 1048576, 2), 'MB, download', round(len(gzip.compress(data, 9)) / 1048576, 2), 'MB')
