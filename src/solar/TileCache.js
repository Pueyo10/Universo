// RGBA8 allocation including the complete mip chain (network JPEG size is irrelevant).
export function textureBytes(width, height) {
  let bytes = 0;
  do {
    bytes += width * height * 4;
    if (width === 1 && height === 1) break;
    width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
  } while (true);
  return bytes;
}

export class TileCache {
  constructor(limit = 64 * 1024 * 1024) { this.limit = limit; this.bytes = 0; this.entries = new Map(); }
  admit(key, entry) {
    if (entry.bytes > this.limit) return false;
    const candidates = [...this.entries].filter(([, e]) => !e.pinned()).sort((a, b) => a[1].used() - b[1].used());
    for (const [id] of candidates) {
      if (this.bytes + entry.bytes <= this.limit) break;
      this.remove(id);
    }
    if (this.bytes + entry.bytes > this.limit) return false;
    this.entries.set(key, entry); this.bytes += entry.bytes;
    return true;
  }
  remove(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key); this.bytes -= entry.bytes; entry.dispose();
  }
}
