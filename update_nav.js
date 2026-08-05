import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const file = path.join(__dirname, 'src/layouts/AdminLayout.astro');

let content = fs.readFileSync(file, 'utf8');

// Update main links (a tags)
content = content.replace(/class="flex items-center gap-3 px-3 py-2\.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"/g, 'class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm whitespace-nowrap text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"');

// Update summary tags
content = content.replace(/class="flex items-center justify-between px-3 py-2\.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer list-none select-none"/g, 'class="flex items-center justify-between px-3 py-2 rounded-lg text-sm whitespace-nowrap text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer list-none select-none"');

// Update sub-menu links
content = content.replace(/class="flex items-center gap-3 py-2 text-slate-400 hover:text-white transition-colors"/g, 'class="flex items-center gap-3 py-1.5 text-sm whitespace-nowrap text-slate-400 hover:text-white transition-colors"');

// Reduce space between main items slightly to make it neater
content = content.replace(/class="flex-1 px-4 space-y-2 mt-4"/g, 'class="flex-1 px-3 space-y-1 mt-4"');

// Reduce padding in the submenu container to give more horizontal space
content = content.replace(/class="pl-10 pr-3 py-2 space-y-1"/g, 'class="pl-9 pr-2 py-1 space-y-1"');

fs.writeFileSync(file, content);
console.log('AdminLayout updated.');
