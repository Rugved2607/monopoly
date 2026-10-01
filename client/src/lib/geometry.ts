/**
 * Perimeter geometry for the 56-space board.
 * Grid is 15x15: [corner, 13 side cells, corner]. Corners are 1.5x a side cell,
 * so the whole board is 16 "units" wide.
 */
export const BOARD_SIZE = 56;
export const GRID_TEMPLATE = '1.5fr repeat(13, 1fr) 1.5fr';
const UNIT_TOTAL = 16;

export type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner';

export function cellXY(pos: number): { col: number; row: number } {
  if (pos === 0) return { col: 14, row: 14 };
  if (pos < 14) return { col: 14 - pos, row: 14 };
  if (pos === 14) return { col: 0, row: 14 };
  if (pos < 28) return { col: 0, row: 14 - (pos - 14) };
  if (pos === 28) return { col: 0, row: 0 };
  if (pos < 42) return { col: pos - 28, row: 0 };
  if (pos === 42) return { col: 14, row: 0 };
  return { col: 14, row: pos - 42 };
}

export function sideOf(pos: number): Side {
  if (pos % 14 === 0) return 'corner';
  if (pos < 14) return 'bottom';
  if (pos < 28) return 'left';
  if (pos < 42) return 'top';
  return 'right';
}

const axisCenter = (i: number) => (i === 0 ? 0.75 : i === 14 ? 15.25 : i + 1);

/** cell centre as a percentage of the board */
export function cellCenter(pos: number): { x: number; y: number } {
  const { col, row } = cellXY(pos);
  return { x: (axisCenter(col) / UNIT_TOTAL) * 100, y: (axisCenter(row) / UNIT_TOTAL) * 100 };
}
