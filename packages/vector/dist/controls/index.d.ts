export function icon(name: string, size?: number): string;
export function htmlEscape(value: unknown): string;
export function button(
  action: string,
  title: string,
  icon: string,
  extra?: string,
): string;
export function toast(message: string, error?: boolean): void;
export function dialog(
  title: string,
  content: string,
  footer?: string,
): HTMLDialogElement;
export class CommandRegistry {
  register(
    id: string,
    title: string,
    execute: (...args: unknown[]) => unknown,
    shortcut?: string,
  ): this;
  execute(id: string, ...args: unknown[]): unknown;
  search(
    query?: string,
  ): Array<{ id: string; title: string; execute: Function; shortcut: string }>;
}
