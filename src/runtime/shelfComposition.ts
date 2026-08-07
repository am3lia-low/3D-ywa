export interface ShelfBookSlot {
  x: number;
  y: number;
  height: number;
  width: number;
  depth: number;
  shelfTop: number;
}

export const ARCHIVE_SHELF_LEVELS = [0.55, 1.22, 1.9, 2.58, 3.26, 3.94] as const;
export const WORN_BOOKSHELF_TOPS = [-0.321, -0.185, -0.044, 0.106, 0.295] as const;

export function createArchiveShelfBookSlots(level: number, levelIndex: number): ShelfBookSlot[] {
  const shelfTop = level + 0.055;
  return Array.from({ length: 8 }, (_, bookIndex) => {
    const height = 0.42 + ((bookIndex + 1) % 3) * 0.045;
    return {
      x: -0.97 + bookIndex * 0.275,
      y: shelfTop + 0.012 + height / 2,
      height,
      width: 0.19,
      depth: 0.29,
      shelfTop,
    };
  });
}

export function createWornBookshelfBookSlots(options: { reserveTopLeft?: boolean } = {}): ShelfBookSlot[][] {
  const rows = WORN_BOOKSHELF_TOPS.map((shelfTop, shelfIndex) =>
    Array.from({ length: 7 }, (_, bookIndex) => {
      const height = 0.09 + ((bookIndex + shelfIndex) % 3) * 0.012;
      return {
        x: -0.34 + bookIndex * 0.112,
        y: shelfTop + 0.016 + height / 2,
        height,
        width: 0.074,
        depth: 0.13,
        shelfTop,
      };
    }),
  );
  if (options.reserveTopLeft) {
    rows[rows.length - 1] = rows.at(-1)!.filter((slot) => slot.x > 0.05);
  }
  return rows;
}
