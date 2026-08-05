import { describe, expect, it } from "vitest";
import {
  ARCHIVE_SHELF_LEVELS,
  createArchiveShelfBookSlots,
  createWornBookshelfBookSlots,
} from "./shelfComposition";

describe("shelf composition", () => {
  it("keeps every archive book above timber and clear of the label zone", () => {
    for (const [levelIndex, level] of ARCHIVE_SHELF_LEVELS.entries()) {
      for (const book of createArchiveShelfBookSlots(level, levelIndex)) {
        expect(book.y - book.height / 2).toBeGreaterThan(book.shelfTop);
        expect(Math.abs(book.x) + book.width / 2).toBeLessThan(1.14);
        expect(book.depth / 2 + 0.17).toBeLessThan(0.34);
      }
    }
  });

  it("fills all five measured shelves in the approved worn bookshelf", () => {
    const rows = createWornBookshelfBookSlots();
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row).toHaveLength(7);
      for (const book of row) {
        expect(book.y - book.height / 2).toBeGreaterThan(book.shelfTop);
        expect(Math.abs(book.x) + book.width / 2).toBeLessThan(0.43);
      }
    }
  });
});
