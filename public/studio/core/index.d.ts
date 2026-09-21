export type Point = { x: number; y: number; in?: Point; out?: Point };
export type Bounds = { x: number; y: number; width: number; height: number };
export interface Page {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
}
export interface VectorNode extends Bounds {
  id: string;
  pageId: string;
  type:
    "rect" | "ellipse" | "path" | "polygon" | "text" | "image" | "line" | "svg";
  name: string;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  svg?: string;
  cmyk?: [number, number, number, number];
  spot?: string;
  textFrame?: { columns: number; gap: number; inset: number } | null;
  nextFrame?: string | null;
  direction?: "auto" | "ltr" | "rtl";
  features?: string;
  language?: string;
  points?: Point[];
  d?: string;
  closed?: boolean;
  groupId?: string | null;
  [key: string]: unknown;
}
export interface VectorDocument {
  format: "vellum";
  version: 1;
  id: string;
  name: string;
  units: string;
  colorSpace: string;
  pages: Page[];
  nodes: VectorNode[];
  guides: Array<{ axis: "x" | "y"; value: number; pageId?: string }>;
  styles?: Array<Record<string, unknown>>;
  groups?: Group[];
  fonts?: EmbeddedFont[];
  print?: PrintSettings;
}
export function uid(): string;
export function clone<T>(value: T): T;
export function clamp(v: number, min: number, max: number): number;
export function createNode(
  type: VectorNode["type"],
  props?: Partial<VectorNode>,
): VectorNode;
export function createDocument(name?: string): VectorDocument;
export function validateDocument(value: unknown): VectorDocument;
export const Matrix: {
  identity(): number[];
  multiply(a: number[], b: number[]): number[];
  point(matrix: number[], point: Point): Point;
  inverse(matrix: number[]): number[];
};
export function objectMatrix(node: VectorNode): number[];
export function bounds(node: VectorNode): Bounds;
export function unionBounds(nodes: VectorNode[]): Bounds;
export function intersects(a: Bounds, b: Bounds): boolean;
export function pointInPolygon(p: Point, vertices: Point[]): boolean;
export function cubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
): Point;
export function splitCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t?: number,
): Point[][];
export class SpatialIndex {
  constructor(cellSize?: number);
  rebuild(nodes: VectorNode[]): void;
  query(bounds: Bounds): VectorNode[];
}
export class DocumentStore extends EventTarget {
  constructor(doc?: VectorDocument);
  doc: VectorDocument;
  readOnly?: boolean;
  pageId: string;
  selection: Set<string>;
  readonly page: Page;
  readonly nodes: VectorNode[];
  readonly selected: VectorNode[];
  index: SpatialIndex;
  history: Array<{
    label: string;
    before: VectorDocument;
    after: VectorDocument;
  }>;
  future: Array<unknown>;
  pending: VectorDocument | null;
  select(ids: string[]): void;
  transact(label: string, fn: (doc: VectorDocument) => void): void;
  begin(): void;
  commit(label: string): void;
  cancel(): void;
  update(
    ids: string[],
    patch: Partial<VectorNode> | ((node: VectorNode) => Partial<VectorNode>),
    label?: string,
  ): void;
  add(type: VectorNode["type"], props?: Partial<VectorNode>): VectorNode;
  remove(): void;
  duplicate(offset?: number): void;
  undo(): void;
  redo(): void;
  replace(doc: VectorDocument, remote?: boolean): void;
  align(mode: "left" | "center" | "right" | "top" | "middle" | "bottom"): void;
  distribute(axis?: "x" | "y"): void;
  group(): void;
  ungroup(): void;
  reorderPage(id: string, index: number): void;
  moveToPage(ids: string[], pageId: string): void;
  duplicatePage(id?: string): Page;
  deletePage(id?: string): void;
  arrange(mode: "front" | "back" | "forward" | "backward"): void;
  reindex(): void;
  emit(kind?: string, label?: string): void;
}
export interface Plugin {
  id: string;
  commands?: Record<string, (context: unknown) => unknown>;
  exporters?: Record<string, (doc: VectorDocument) => unknown>;
}
export class PluginRegistry {
  register(plugin: Plugin): () => void;
  execute(name: string, context: unknown): unknown;
}
export const VERSION: string;
export interface Group {
  id: string;
  pageId: string;
  name: string;
  parentId?: string | null;
  opacity: number;
  visible: boolean;
  locked: boolean;
}
export interface EmbeddedFont {
  family: string;
  src: string;
  weight?: number;
  italic?: boolean;
}
export interface PrintSettings {
  bleed: number;
  inkLimit: number;
  intent: "relative" | "absolute" | "perceptual" | "saturation";
  profile?: string;
  profileName?: string;
}
export function ancestors(
  doc: VectorDocument,
  node: { groupId?: string | null },
): Group[];
export function effectiveLocked(doc: VectorDocument, node: VectorNode): boolean;
export function effectiveVisible(
  doc: VectorDocument,
  node: VectorNode,
): boolean;
export function inGroup(
  doc: VectorDocument,
  node: VectorNode,
  id: string,
): boolean;
export function outerGroup(
  doc: VectorDocument,
  node: VectorNode,
): string | undefined;
export function pageLayout(
  doc: VectorDocument,
  gap?: number,
): Array<Bounds & { id: string }>;
