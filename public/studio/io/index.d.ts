import type { VectorDocument, VectorNode, Page } from "../core/index.js";
export function download(
  data: string | Blob,
  name: string,
  type?: string,
): void;
export function safeName(name: string): string;
export function rasterize(
  doc: VectorDocument,
  pageId: string,
  options?: { scale?: number; transparent?: boolean },
): Promise<Blob>;
export function exportPDF(doc: VectorDocument, pages?: Page[]): Promise<Blob>;
export function configureGeometry(paper: unknown): unknown;
export function booleanOperation(
  nodes: VectorNode[],
  operation: "unite" | "subtract" | "intersect" | "exclude",
): Promise<VectorNode>;
export function convertToPath(node: VectorNode): Promise<VectorNode>;
export function editableNodes(node: VectorNode): Promise<VectorNode>;
export function breakApart(node: VectorNode): Promise<VectorNode[]>;
export function smoothPath(
  node: VectorNode,
  tolerance?: number,
): Promise<VectorNode>;
export function importSVG(
  source: string,
  pageId: string,
): Promise<{ nodes: VectorNode[]; omitted: number }>;
export function readFile(
  file: File,
  pageId: string,
): Promise<{
  document?: VectorDocument;
  nodes?: VectorNode[];
  omitted?: number;
}>;
export function importFont(
  file: File,
): Promise<{
  font: unknown;
  family: string;
  src: string;
  weight: number;
  italic: boolean;
}>;
export function textToOutlines(node: VectorNode, font: unknown): VectorNode;

export function flattenSVG(
  source: string,
  pageId: string,
): Promise<{ nodes: VectorNode[]; omitted: number }>;
export function shapeTextToPath(
  node: VectorNode,
  bytes: Uint8Array | ArrayBuffer,
): Promise<VectorNode>;
export function outlineDocument(
  document: VectorDocument,
): Promise<VectorDocument>;
export function exportProcessPDF(document: VectorDocument): Promise<Blob>;
