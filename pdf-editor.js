import * as pdfjs from '../vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.min.mjs',import.meta.url).href;
const PC=window.PdfCore, $=s=>document.querySelector(s), MAXPDF=50<<20, MAXIMG=10<<20;
let ed=new PC.Editor(), bytes,name='document.pdf',doc,page=0,zoom=1,pw=0,ph=0,sel=null,tool=null,token=0,task=null,thumbTok=0,replacing=false;
const ov=$('#ov'),cv=$('#cv'),sheet=$('#sheet'),ws=$('#ws');
const status=(m,k)=>{ const s=$('#status'); s.textContent=m||''; s.className=k||''; };

/* toolbar + panel markup (built once) */
const bar=document.createElement('div'); bar.id='bar'; bar.hidden=true; bar.setAttribute('role','toolbar'); bar.setAttribute('aria-label','Editor tools');
bar.innerHTML=`<button id="bOpen">Open another PDF</button><button id="bPrev" aria-label="Previous page">◀</button><span class="info" id="pg">–</span><button id="bNext" aria-label="Next page">▶</button>
<button id="zOut" aria-label="Zoom out">−</button><span class="info" id="zl">100%</span><button id="zIn" aria-label="Zoom in">+</button><button id="zFit">Fit page</button>
<button id="bText" aria-pressed="false">Add text</button><button id="bImg">Add image</button>
<button id="bUndo">Undo</button><button id="bRedo">Redo</button><button id="bReset">Discard edits</button><span class="sp"></span><span class="info" id="fn"></span><button id="bDl" class="pri">Download edited PDF</button>`;
$('#app').before(bar);
const B=id=>document.getElementById(id);

async function openFile(f){
  if(!f) return;
  if(ed.objs.length&&!confirm('Opening another PDF discards your current edits. Continue?')) return;
  if(f.size>MAXPDF) return status('That file is larger than 50 MB.','err');
  status('Loading…');
  let buf; try{ buf=new Uint8Array(await f.arrayBuffer()); }catch(e){ return status('The file could not be read.','err'); }
  if(PC.sniff(buf)!=='pdf') return status('That is not a PDF file. Choose a file ending in .pdf.','err');
  try{ await PDFLib.PDFDocument.load(buf); }catch(e){ return status('This PDF is encrypted or damaged, so it cannot be edited here.','err'); }
  let d; try{ d=await pdfjs.getDocument({data:buf.slice(),standardFontDataUrl:new URL('../vendor/standard_fonts/',import.meta.url).href,cMapUrl:new URL('../vendor/cmaps/',import.meta.url).href,cMapPacked:true}).promise; }
  catch(e){ return status(e&&e.name==='PasswordException'?'This PDF is password-protected. Remove the password first.':'This PDF could not be read. It may be damaged.','err'); }
  doc&&doc.destroy&&doc.destroy(); doc=d; bytes=buf; name=f.name; ed=new PC.Editor(); sel=null; tool=null; page=0;
  $('#empty').hidden=true; $('#app').hidden=false; bar.hidden=false; $('#fn').textContent=name+' · '+doc.numPages+(doc.numPages===1?' page':' pages');
  buildThumbs(); await showPage(0,true); status('Opened '+name+'. Choose “Add text” or “Add image” to start.','ok');
}
async function buildThumbs(){ const t=++thumbTok, box=$('#thumbs'); box.innerHTML='';
  for(let i=0;i<doc.numPages;i++){ const b=document.createElement('button'); b.type='button'; b.setAttribute('aria-label','Go to page '+(i+1)); b.innerHTML='<canvas></canvas><span>'+(i+1)+'</span>'; b.onclick=()=>showPage(i); box.appendChild(b); }
  for(let i=0;i<doc.numPages&&t===thumbTok;i++){ try{ const p=await doc.getPage(i+1), v=p.getViewport({scale:.2}), c=box.children[i].firstChild; c.width=v.width; c.height=v.height; await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise; }catch(e){} } }
async function showPage(n,fit){
  const t=++token; page=n; const p=await doc.getPage(n+1); if(t!==token) return;
  if(p.rotate) status('This page is rotated; added items may not line up in the exported PDF.','err');
  const v1=p.getViewport({scale:1}); pw=v1.width; ph=v1.height;
  if(fit) zoom=Math.min(3,Math.max(.25,(ws.clientWidth-32)/pw));
  const dpr=Math.min(window.devicePixelRatio||1,2), v=p.getViewport({scale:zoom*dpr});
  cv.width=Math.floor(v.width); cv.height=Math.floor(v.height);
  sheet.style.width=cv.style.width=pw*zoom+'px'; sheet.style.height=cv.style.height=ph*zoom+'px';
  $('#zl').textContent=Math.round(zoom*100)+'%'; $('#pg').textContent=(n+1)+' / '+doc.numPages;
  [...$('#thumbs').children].forEach((b,i)=>b.setAttribute('aria-current',i===n));
  select(null); renderOverlay(); btns();
  try{ task&&task.cancel(); task=p.render({canvasContext:cv.getContext('2d'),viewport:v}); await task.promise; }
  catch(e){ console.warn('render',e); if(e&&e.name!=='RenderingCancelledException') status('This page could not be drawn.','err'); }
}
function place(el,o){ const b=el.firstChild, s=el.style; s.left=o.x*zoom+'px'; s.top=o.y*zoom+'px'; s.width=o.w*zoom+'px';
  if(o.type==='image') s.height=o.h*zoom+'px'; else { Object.assign(b.style,{fontSize:o.size*zoom+'px',color:o.color,fontWeight:o.bold?700:400,fontStyle:o.italic?'italic':'normal',textAlign:o.align}); } }
function mk(o){ const el=document.createElement('div'); el.className='obj '+(o.type==='image'?'img':'txt'); el.dataset.id=o.id;
  const b=document.createElement(o.type==='image'?'div':'div'); b.className='body';
  if(o.type==='image'){ const im=new Image(); im.alt='Inserted image'; im.src=o.dataUrl; b.appendChild(im); } else b.textContent=o.text;
  const rh=document.createElement('div'); rh.className='rh'; rh.setAttribute('aria-hidden','true'); el.append(b,rh); place(el,o); return el; }
function renderOverlay(){ ov.innerHTML=''; ed.objs.filter(o=>o.page===page).forEach(o=>{ const el=mk(o); if(o.id===sel) el.classList.add('sel'); ov.appendChild(el); }); }
const elOf=id=>ov.querySelector('.obj[data-id="'+id+'"]');
function select(id){ sel=id; ov.querySelectorAll('.obj').forEach(e=>e.classList.toggle('sel',+e.dataset.id===id)); panel(); btns(); }
function btns(){ B('bUndo').disabled=!ed.undo.length; B('bRedo').disabled=!ed.redo.length; B('bReset').disabled=!ed.objs.length; B('bPrev').disabled=page<=0; B('bNext').disabled=!doc||page>=doc.numPages-1; B('bDl').disabled=!doc; B('bText').setAttribute('aria-pressed',tool==='text'); sheet.parentElement.classList.toggle('tool-text',tool==='text'); }
function panel(){ const o=sel&&ed.get(sel), p=$('#panel');
  if(!o){ p.innerHTML='<h2>Formatting</h2><p>Select text or an image on the page to change it. Drag to move, use the round handle to resize, double-click text to edit. Delete removes the selected item.</p>'; return; }
  if(o.type==='image'){ p.innerHTML='<h2>Image</h2><p>Resizing keeps the aspect ratio.</p><button id="pRep">Replace image</button><button id="pDel">Delete</button>'; }
  else p.innerHTML=`<h2>Text</h2><label>Size (pt)<input id="pSize" type="number" min="4" max="200" step="1" value="${o.size}"></label><label>Color<input id="pCol" type="color" value="${o.color}"></label>
   <div class="row2"><button id="pB" aria-pressed="${!!o.bold}"><b>Bold</b></button><button id="pI" aria-pressed="${!!o.italic}"><i>Italic</i></button></div>
   <label>Alignment<select id="pAl">${['left','center','right'].map(a=>`<option${o.align===a?' selected':''}>${a}</option>`).join('')}</select></label><button id="pDel">Delete</button>`; }
function apply(fn){ const o=ed.get(sel); if(!o) return; ed.checkpoint(); fn(o); const el=elOf(o.id); if(el) place(el,o); panel(); btns(); }

function addText(x,y){ const o=ed.add({type:'text',page,x:PC.clamp(x,0,pw-40),y:PC.clamp(y,0,ph-20),w:Math.min(200,pw-x>40?pw-x:200),text:'Text',size:14,color:'#000000',bold:false,italic:false,align:'left'});
  tool=null; renderOverlay(); select(o.id); const el=elOf(o.id); el._cp=true; el._new=true; setTimeout(()=>edit(el),0); }
function edit(el){ const b=el.firstChild; b.contentEditable='plaintext-only'; if(b.contentEditable!=='plaintext-only') b.contentEditable='true'; b.focus();
  const r=document.createRange(); r.selectNodeContents(b); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }
ov.addEventListener('input',e=>{ const el=e.target.closest('.obj'); if(!el) return; if(!el._cp){ ed.checkpoint(); el._cp=true; btns(); } ed.get(+el.dataset.id).text=el.firstChild.innerText.replace(/\n$/,''); });
ov.addEventListener('focusout',e=>{ const el=e.target.closest&&e.target.closest('.obj'); if(!el||!el.firstChild.isContentEditable) return; const o=ed.get(+el.dataset.id); el.firstChild.contentEditable='false'; el._cp=false;
  if(o&&!o.text.trim()){ if(el._new) ed.undo.pop(); else ed.checkpoint(); ed.objs=ed.objs.filter(x=>x.id!==o.id); sel=null; renderOverlay(); panel(); } el._new=false; btns(); });
ov.addEventListener('dblclick',e=>{ const el=e.target.closest('.obj.txt'); if(el) edit(el); });
ov.addEventListener('pointerdown',e=>{
  const el=e.target.closest('.obj');
  if(!el){ if(tool==='text'){ e.preventDefault(); const r=ov.getBoundingClientRect(); addText((e.clientX-r.left)/zoom,(e.clientY-r.top)/zoom); } else select(null); return; }
  const o=ed.get(+el.dataset.id); select(o.id);
  if(el.firstChild.isContentEditable&&!e.target.classList.contains('rh')) return;
  const rs=e.target.classList.contains('rh'), sx=e.clientX, sy=e.clientY, ox=o.x, oy=o.y, ow=o.w, oh=o.h; let cp=false;
  e.preventDefault(); el.setPointerCapture(e.pointerId);
  const mv=ev=>{ const dx=(ev.clientX-sx)/zoom, dy=(ev.clientY-sy)/zoom; if(!cp){ if(Math.hypot(dx,dy)*zoom<3) return; ed.checkpoint(); cp=true; }
    if(rs){ o.w=Math.max(20,ow+dx); if(o.type==='image') o.h=o.w*oh/ow; } else { o.x=PC.clamp(ox+dx,-ow+20,pw-20); o.y=PC.clamp(oy+dy,0,ph-10); } place(el,o); };
  const up=()=>{ el.removeEventListener('pointermove',mv); el.removeEventListener('pointerup',up); el.removeEventListener('pointercancel',up); btns(); };
  el.addEventListener('pointermove',mv); el.addEventListener('pointerup',up); el.addEventListener('pointercancel',up); });

async function readImage(f){ if(f.size>MAXIMG) throw new Error('That image is larger than 10 MB.');
  const k=PC.sniff(new Uint8Array(await f.slice(0,8).arrayBuffer())); if(k!=='png'&&k!=='jpg') throw new Error('Only JPG, JPEG and PNG images are supported.');
  const dataUrl=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
  const dim=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res([im.naturalWidth,im.naturalHeight]); im.onerror=()=>rej(new Error('That image is damaged and could not be read.')); im.src=dataUrl; });
  return {dataUrl,mime:k==='png'?'image/png':'image/jpeg',ratio:dim[1]/dim[0]}; }
$('#imgIn').onchange=async e=>{ const f=e.target.files[0]; e.target.value=''; if(!f||!doc) return;
  try{ const im=await readImage(f);
    if(replacing&&sel&&ed.get(sel)){ replacing=false; apply(o=>{ o.dataUrl=im.dataUrl; o.mime=im.mime; o.h=o.w*im.ratio; }); renderOverlay(); }
    else { const w=Math.min(200,pw*.4); const o=ed.add({type:'image',page,x:(pw-w)/2,y:Math.max(0,ph/2-w*im.ratio/2),w,h:w*im.ratio,dataUrl:im.dataUrl,mime:im.mime}); renderOverlay(); select(o.id); }
    status('Image added. Drag it into place.','ok'); }catch(err){ replacing=false; status(err.message,'err'); } };

function undoRedo(r){ if(!(r?ed.redoStep():ed.undoStep())) return; sel=ed.get(sel)?sel:null; renderOverlay(); panel(); btns(); }
const del=()=>{ if(sel&&ed.get(sel)){ ed.remove(sel); sel=null; renderOverlay(); panel(); btns(); } };
async function download(){ B('bDl').disabled=true; status('Preparing your PDF…');
  try{ const out=await PC.exportPdf(PDFLib,bytes,ed.objs), a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/pdf'}));
    a.download=name.replace(/\.pdf$/i,'')+'-edited.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    status('Downloaded '+a.download+' with '+ed.objs.length+(ed.objs.length===1?' added item.':' added items.'),'ok'); }
  catch(e){ status('The PDF could not be exported: '+(e&&e.message||'unknown error'),'err'); } btns(); }

document.addEventListener('click',e=>{ const t=e.target.closest('button'); if(!t) return;
  ({bOpen:()=>$('#fileIn').click(),bPrev:()=>showPage(page-1),bNext:()=>showPage(page+1),zIn:()=>{zoom=Math.min(4,zoom*1.25);showPage(page);},zOut:()=>{zoom=Math.max(.25,zoom/1.25);showPage(page);},zFit:()=>showPage(page,true),
   bText:()=>{tool=tool==='text'?null:'text';btns();},bImg:()=>{replacing=false;$('#imgIn').click();},bUndo:()=>undoRedo(false),bRedo:()=>undoRedo(true),
   bReset:()=>{ if(confirm('Discard all added text and images? You can still undo this.')){ ed.reset(); sel=null; renderOverlay(); panel(); btns(); } },bDl:download,
   pDel:del,pRep:()=>{replacing=true;$('#imgIn').click();},pB:()=>apply(o=>o.bold=!o.bold),pI:()=>apply(o=>o.italic=!o.italic)}[t.id]||(()=>{}))(); });
document.addEventListener('change',e=>{ const t=e.target;
  if(t.id==='fileIn'){ openFile(t.files[0]); t.value=''; }
  else if(t.id==='pSize'){ const v=+t.value; if(v>=4&&v<=200) apply(o=>o.size=v); }
  else if(t.id==='pCol') apply(o=>o.color=t.value); else if(t.id==='pAl') apply(o=>o.align=t.value); });
document.addEventListener('keydown',e=>{ if(!doc||e.target.isContentEditable||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const m=e.ctrlKey||e.metaKey;
  if(m&&e.key.toLowerCase()==='z'){ e.preventDefault(); undoRedo(e.shiftKey); } else if(m&&e.key.toLowerCase()==='y'){ e.preventDefault(); undoRedo(true); }
  else if(e.key==='Delete'||e.key==='Backspace'){ if(sel){ e.preventDefault(); del(); } } else if(e.key==='Escape'){ tool=null; select(null); } });
const drop=$('#drop'); ['dragenter','dragover'].forEach(v=>window.addEventListener(v,e=>{ e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(v=>window.addEventListener(v,e=>{ e.preventDefault(); drop.classList.remove('over'); }));
window.addEventListener('drop',e=>openFile(e.dataTransfer.files[0]));
panel();
