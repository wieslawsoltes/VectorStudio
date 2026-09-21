import type { VectorDocument, VectorNode } from "../core/index.js";
export function escapeXML(value: unknown): string;
export function pathData(node: VectorNode): string;
export function shapeMarkup(node: VectorNode): string;
export function nodeMarkup(node: VectorNode, outline?: boolean): string;
export function toSVG(
  doc: VectorDocument,
  pageId?: string,
  options?: { outline?: boolean; transparent?: boolean },
): string;
export class SVGRenderer {
  constructor(svg: SVGSVGElement);
  render(doc: VectorDocument, pageId: string, outline?: boolean): void;
  destroy(): void;
}
export class WebGPUCompositor {
  constructor(canvas: HTMLCanvasElement, onStatus?: (status: string) => void);
  ready: boolean;
  initialize(): Promise<boolean>;
  render(
    svg: string,
    width: number,
    height: number,
    scale?: number,
  ): Promise<boolean>;
  invalidate(): void;
  destroy(): void;
}

export function sceneTree(
  doc: VectorDocument,
  pageId: string,
): Array<{ kind: "group" | "node"; value: unknown; children?: unknown[] }>;
export function documentMarkup(
  doc: VectorDocument,
  pageId: string,
  outline?: boolean,
): string;
export function fontDefs(doc: VectorDocument): string;
