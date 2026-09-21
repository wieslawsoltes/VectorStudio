import { shell } from '../public/studio/shell.js';
export function GET(){return new Response(shell,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}});}
