import type { Point, VectorDocument } from "../core/index.js";
export interface Mesh {
  rows: number;
  cols: number;
  subdivisions: number;
  points: Array<{ x: number; y: number; color: string }>;
}
export interface Brush {
  kind: "round" | "calligraphy";
  size: number;
  angle: number;
  aspect: number;
  pressure: boolean;
  samples: Array<{ x: number; y: number; pressure: number }>;
}
export function bilinear(corners: Point[], u: number, v: number): Point;
export function createMesh(
  rows?: number,
  cols?: number,
  colors?: string[],
): Mesh;
export function meshCells(
  mesh: Mesh,
  width: number,
  height: number,
): Array<{ points: Point[]; color: string }>;
export function envelopePoints(
  points: Point[],
  corners: Point[],
  width: number,
  height: number,
): Point[];
export function brushOutline(
  samples: Brush["samples"],
  options?: Partial<Omit<Brush, "samples">>,
): Point[];
export function validateAdvanced(
  doc: VectorDocument,
  fail: (message: string) => never,
): void;
