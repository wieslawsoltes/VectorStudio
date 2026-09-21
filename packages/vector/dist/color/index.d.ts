import type { VectorDocument } from "../core/index.js";
export function toBase64(bytes: Uint8Array): string;
export function fromBase64(text: string): Uint8Array;
export function colorEngine(options?: {
  wasmBinary?: Uint8Array;
  [key: string]: unknown;
}): Promise<unknown>;
export interface ColorTransform {
  description: string;
  rgbToCmyk(values: ArrayLike<number>): Uint8Array;
  cmykToRgb(values: ArrayLike<number>): Uint8Array;
  dispose(): void;
}
export function createColorTransform(
  bytes: Uint8Array,
  options?: { intent?: "relative" | "absolute" | "perceptual" | "saturation" },
): Promise<ColorTransform>;
export interface PreflightIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  pageId?: string;
}
export function preflight(
  doc: VectorDocument,
  options?: { minimumDPI?: number },
): {
  created: string;
  issues: PreflightIssue[];
  errors: number;
  warnings: number;
  externalCertification: false;
};
