export function sanitizeSVG(
  source: string,
  options?: { prefix?: string },
): { svg: string; width: number; height: number; omitted: number };
export function validateSVG(source: string): void;
