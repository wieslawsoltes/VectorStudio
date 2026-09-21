import type { DocumentStore } from "../core/index.js";
export class VellumCanvas extends HTMLElement {
  store: DocumentStore;
  zoom: number;
  pan: { x: number; y: number };
  fill: string;
  fit(): void;
  setTool(tool: "select" | "rect" | "ellipse" | "text" | "pan"): void;
}
export class VellumPropertyGrid extends HTMLElement {
  store: DocumentStore;
  schema: Array<{
    key: string;
    label: string;
    type?: string;
    min?: number;
    max?: number;
    step?: number;
  }>;
}
export class VellumObjectTree extends HTMLElement {
  store: DocumentStore;
}
export class VellumColorPalette extends HTMLElement {
  store: DocumentStore;
  colors: string[];
}
export function registerElements(prefix?: string): void;
