/** Convert UI paint to role-based CSS variables, preserving exact light colors.
 * Board squares and piece assets deliberately keep their chess color identity.
 * Rerun after adding literal UI colors; existing tokens are idempotent. */
import fs from 'node:fs';
import postcss from 'postcss';
const files=['src/styles.css','src/club.css','src/polish.css','src/chess-club.css','src/play-upgrade.css',...fs.readdirSync('src/components').filter(name=>name.endsWith('.css')&&name!=='ChessBoard.css').map(name=>'src/components/'+name)];
const tokens=new Map();
function rgb(hex){let h=hex.replace('#','').toLowerCase();if(h.length===3||h.length===4)h=[...h].map(c=>c+c).join('');return {hex:h,r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16),alpha:h.slice(6)};}
function token(role,hex){const c=rgb(hex),key=`--${role}-${c.hex}`;tokens.set(key,{role,...c});return `var(${key}, ${hex})`;}
for(const file of files){const css=fs.readFileSync(file,'utf8'),root=postcss.parse(css);for(const match of css.matchAll(/--(ink|surface|edge)-([a-f0-9]{6}(?:[a-f0-9]{2})?)/g))tokens.set(match[0],{role:match[1],...rgb(match[2])});root.walkDecls(d=>{
 const custom=d.prop.startsWith('--')?d.prop.split('-').at(-1):'';
 const role=d.prop==='color'||['ink','text','muted','accent','green','teal','copper'].includes(custom)?'ink':/^background(?:-color)?$/.test(d.prop)||['bg','background','paper','surface','cream','panel'].includes(custom)?'surface':/^(?:border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?)$/.test(d.prop)||['line','border'].includes(custom)?'edge':null;
 if(!role||d.value.includes('var(')||d.value.includes('url('))return;
 if(/\.theme-preview|\.square|\.coordinate|\.chess-piece/.test(d.parent.selector || ''))return;
 d.value=d.value.replace(/#[a-f0-9]{8}\b|#[a-f0-9]{6}\b|#[a-f0-9]{4}\b|#[a-f0-9]{3}\b/gi,hex=>token(role,hex)).replace(/\b(white|black)\b/g,c=>token(role,c==='white'?'#ffffff':'#000000'));
 });fs.writeFileSync(file,root.toString());}
function dark({role,r,g,b,alpha}){const l=.2126*r+.7152*g+.0722*b,s=Math.max(r,g,b)-Math.min(r,g,b);let color;
 if(role==='edge')color=s>70&&l>90?'#668650':'#414d39';
 else if(role==='ink'){
  if(l>210)color='#f0f4e9';
  else if(s>45){const mix=.55;color='#'+[r,g,b].map(v=>Math.round(v+(255-v)*mix).toString(16).padStart(2,'0')).join('');}
  else color=l<100?'#e1e8d9':'#b4bfaa';
 }else{
  if(l>=145){if(s>30)color='#'+[r,g,b].map(v=>Math.round(v*.14+25).toString(16).padStart(2,'0')).join('');else color=l>230?'#222a1e':'#30392a';}
  else if(l<70&&s<35)color='#181e15';else color='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
 }
 return color+alpha;
}
let output='/* UI colors use light fallbacks; this palette changes surfaces and text, not chess pieces.\n * Regenerate with node scripts/tokenize-theme.mjs when introducing literal UI colors. */\n:root[data-appearance="dark"] {\n  color-scheme:dark;\n  --bg:#161c13; --panel:#222a1e; --text:#e1e8d9; --muted:#b4bfaa; --border:#414d39; --accent:#a1ce75; --green:#93be65; --club-teal:#93be65; --club-copper:#93be65;\n';
for(const [key,value] of [...tokens].sort(([a],[b])=>a.localeCompare(b)))output+=`  ${key}:${dark(value)};\n`;
output+='}\n:root[data-appearance="dark"] body {background:var(--bg);color:var(--text)}\n:root[data-appearance="dark"] .card {box-shadow:0 2px 5px #0003}\n:root[data-appearance="dark"] .bot-avatar,:root[data-appearance="dark"] .player-avatar.bot {color:#25301f}\n:root[data-appearance="dark"] .button.primary {background:#527f2e;border-color:#658a43;color:#fff;box-shadow:0 3px 0 #263b18}\n:root[data-appearance="dark"] .button.primary:hover:not(:disabled) {background:#628e3e}\n:root[data-appearance="dark"] :is(.theme-preview,.piece-dot.white) {color:#282b26}\n:root[data-appearance="dark"] .accuracy-white {background:#dce5cf;color:#24311a}\n:root[data-appearance="dark"] .accuracy-black {background:#10160c;color:#e5ecd9}\n:root[data-appearance="dark"] .board-arrows {isolation:isolate}\n:root[data-appearance="dark"] :is(.modal-backdrop,.nav-scrim) {background:#080c09b3}\n';
output += ':root[data-appearance="dark"] .eval-bar {background:#20251d}\n:root[data-appearance="dark"] .eval-bar>div {background:#edf3e5}\n:root[data-appearance="dark"] .eval-bar>span {color:#59614f}\n:root[data-appearance="dark"] .player-avatar:not(.bot),:root[data-appearance="dark"] .piece-dot.white {background:#dce5cf;color:#25301f}\n:root[data-appearance="dark"] .piece-dot.black {background:#11170e;border-color:#879779}\n';
fs.writeFileSync('src/dark-theme.css',output);
console.log(`Prepared ${tokens.size} theme colors across ${files.length} stylesheets.`);
