import { RealtimeClient } from './realtime.js';
import { BrowserClient } from './browser.js';
/** Static builds explicitly opt into browser-only persistence. Server builds keep the realtime provider. */
export const StudioClient = globalThis.VELLUM_STATIC === true ? BrowserClient : RealtimeClient;
