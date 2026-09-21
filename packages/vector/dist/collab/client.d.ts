import { RealtimeClient } from './realtime.js';
import { BrowserClient } from './browser.js';
export const StudioClient: typeof RealtimeClient | typeof BrowserClient;
