import type {
  VectorDocument,
  VectorNode,
  EmbeddedFont,
} from "../core/index.js";
export interface TextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  start: number;
  end: number;
}
export interface TextLayout {
  lines: TextLine[];
  remaining: string;
  consumed: number;
  overset: boolean;
}
export function measureText(text: string, node: VectorNode): number;
export function layoutText(
  node: VectorNode,
  measure?: (text: string) => number,
  text?: string,
): TextLayout;
export function flowDocument(
  doc: VectorDocument,
): Map<string, VectorNode & { textLayout: TextLayout }>;
export function matchingFont(
  doc: VectorDocument,
  node: VectorNode,
): EmbeddedFont | null;
export function restoreFonts(doc: VectorDocument): Promise<void>;
export function visualRuns(
  text: string,
  direction?: "auto" | "ltr" | "rtl",
): Array<{ text: string; start: number; end: number; rtl: boolean }>;
export function shapedOutlines(
  node: VectorNode,
  fontBytes: Uint8Array | ArrayBuffer,
): Promise<{
  paths: Array<{ d: string; x: number; y: number; scale: number }>;
  layout: TextLayout;
  missingGlyphs: boolean;
}>;
