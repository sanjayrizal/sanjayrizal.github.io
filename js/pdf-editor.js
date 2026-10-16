import * as pdfjs from '../vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.min.mjs',import.meta.url).href;
const PC=window.PdfCore, $=s=>document.querySelector(s), MAXPDF=50<<20, MAXIMG=10<<20;
let ed=new PC.Editor(), bytes,name='document.pdf',doc,page=0,zoom=1,pw=0,ph=0,sel=null,tool=null,token=0,task=null,items=[],thumbTok=0,replacing=false,raster=false;
const ov=$('#ov'),cv=$('#cv'),sheet=$('#sheet'),ws=$('#ws');
const status=(m,k)=>{ const s=$('#status'); s.textContent=m||''; s.className=k||''; };

/* toolbar + panel markup (built once) */
const bar=document.createElement('div'); bar.id='bar'; bar.hidden=true; bar.setAttribute('role','toolbar'); bar.setAttribute('aria-label','Editor tools');
bar.innerHTML=`<button id="bOpen">Open another PDF</button><button id="bPrev" aria-label="Previous page">◀</button><span class="info" id="pg">–</span><button id="bNext" aria-label="Next page">▶</button>
<button id="zOut" aria-label="Zoom out">−</button><span class="info" id="zl">100%</span><button id="zIn" aria-label="Zoom in">+</button><button id="zFit">Fit page</button>
<button id="bEdit" aria-pressed="false">Edit existing text</button><button id="bText" aria-pressed="false">Add text</button><button id="bWhite" aria-pressed="false">Whiteout</button><button id="bHl" aria-pressed="false">Highlight</button><button id="bImg">Add image</button>
<button id="bUndo">Undo</button><button id="bRedo">Redo</button><button id="bReset">Discard edits</button><span class="sp"></span><span class="info" id="fn"></span><button id="bDl" class="pri">Download edited PDF</button>`;
$('#app').before(bar);
const B=id=>document.getElementById(id);

async function openFile(f){
  if(!f) return;
  if(ed.objs.length&&!confirm('Opening another PDF discards your current edits. Continue?')) return;
  if(f.size>MAXPDF) return status('That file is larger than 50 MB.','err');
  if(!window.PDFLib) return status('The file vendor/pdf-lib.min.js did not load. Upload it into the vendor folder on GitHub, then hard-refresh (Ctrl+Shift+R).','err');
  status('Loading…');
  let buf; try{ buf=new Uint8Array(await f.arrayBuffer()); }catch(e){ return status('The file could not be read.','err'); }
  if(PC.sniff(buf)!=='pdf') return status('That is not a PDF file. Choose a file ending in .pdf.','err');
  let rOnly=false; try{ await PDFLib.PDFDocument.load(buf); }catch(e){ console.warn('pdf-lib could not load this PDF',e); rOnly=true; }
  let d; try{ d=await pdfjs.getDocument({data:buf.slice(),standardFontDataUrl:new URL('../vendor/standard_fonts/',import.meta.url).href,cMapUrl:new URL('../vendor/cmaps/',import.meta.url).href,cMapPacked:true}).promise; }
  catch(e){ return status(e&&e.name==='PasswordException'?'This PDF is password-protected. Remove the password first.':'This PDF could not be read. It may be damaged.','err'); }
  doc&&doc.destroy&&doc.destroy(); doc=d; raster=rOnly; bytes=buf; name=f.name; ed=new PC.Editor(); sel=null; tool=null; page=0;
  $('#empty').hidden=true; $('#app').hidden=false; bar.hidden=false; $('#fn').textContent=name+' · '+doc.numPages+(doc.numPages===1?' page':' pages');
  buildThumbs(); await showPage(0,true); status(raster?'Opened '+name+'. This PDF is protected or unusual, so the download will be rebuilt from page images (text in it will no longer be selectable).':'Opened '+name+'. Choose “Edit existing text”, “Add text” or “Add image” to start.',raster?'':'ok');
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
  items=[]; try{ const tc=await p.getTextContent(); if(t!==token) return;
    items=tc.items.filter(i=>i.str&&i.str.trim()&&Math.abs(i.transform[1])<.01&&Math.abs(i.transform[2])<.01).map(i=>{ const sz=Math.hypot(i.transform[0],i.transform[1]), b=v1.convertToViewportPoint(i.transform[4],i.transform[5]); return {x:b[0],y:b[1]-sz*.95,w:i.width,h:sz*1.2,size:sz,base:b[1],str:i.str}; }); }catch(e){}
  select(null); renderOverlay(); btns();
  try{ task&&task.cancel(); task=p.render({canvasContext:cv.getContext('2d'),viewport:v}); await task.promise; }
  catch(e){ console.warn('render',e); if(e&&e.name!=='RenderingCancelledException') status('This page could not be drawn.','err'); }
}
function place(el,o){ const b=el.firstChild, s=el.style; s.left=o.x*zoom+'px'; s.top=o.y*zoom+'px'; s.width=o.w*zoom+'px';
  if(o.type!=='text') s.height=o.h*zoom+'px'; if(o.type==='rect'){ b.style.background=o.color; b.style.opacity=o.opacity==null?1:o.opacity; } else if(o.type==='text'){ Object.assign(b.style,{fontSize:o.size*zoom+'px',color:o.color,fontWeight:o.bold?700:400,fontStyle:o.italic?'italic':'normal',textAlign:o.align}); } }
function mk(o){ const el=document.createElement('div'); el.className='obj '+(o.type==='image'?'img':o.type==='rect'?'img box':'txt'); el.dataset.id=o.id;
  const b=document.createElement(o.type==='image'?'div':'div'); b.className='body';
  if(o.type==='image'){ const im=new Image(); im.alt='Inserted image'; im.src=o.dataUrl; b.appendChild(im); } else if(o.type==='text') b.textContent=o.text;
  const rh=document.createElement('div'); rh.className='rh'; rh.setAttribute('aria-hidden','true'); el.append(b,rh); place(el,o); return el; }
function renderOverlay(){ ov.innerHTML=''; ed.objs.filter(o=>o.page===page).forEach(o=>{ const el=mk(o); if(o.id===sel) el.classList.add('sel'); ov.appendChild(el); });
  if(tool==='edit') items.forEach((it,i)=>{ const h=document.createElement('div'); h.className='hot'; h.dataset.i=i; h.title='Click to edit this text'; Object.assign(h.style,{left:it.x*zoom+'px',top:it.y*zoom+'px',width:it.w*zoom+'px',height:it.h*zoom+'px'}); ov.appendChild(h); }); }
const elOf=id=>ov.querySelector('.obj[data-id="'+id+'"]');
function select(id){ sel=id; ov.querySelectorAll('.obj').forEach(e=>e.classList.toggle('sel',+e.dataset.id===id)); panel(); btns(); }
function btns(){ B('bUndo').disabled=!ed.undo.length; B('bRedo').disabled=!ed.redo.length; B('bReset').disabled=!ed.objs.length; B('bPrev').disabled=page<=0; B('bNext').disabled=!doc||page>=doc.numPages-1; B('bDl').disabled=!doc; [['bEdit','edit'],['bText','text'],['bWhite','white'],['bHl','hl']].forEach(([i,t])=>B(i).setAttribute('aria-pressed',tool===t)); ws.dataset.tool=tool||''; }
function setTool(t){ tool=tool===t?null:t; renderOverlay(); btns(); if(tool==='edit') status(items.length?'Click any highlighted text on the page to replace it.':'No selectable text on this page. It may be a scan. Use Whiteout and Add text instead.',items.length?'':'err'); }
function panel(){ const o=sel&&ed.get(sel), p=$('#panel');
  if(!o){ p.innerHTML='<h2>Formatting</h2><p>Select text or an image on the page to change it. Drag to move, use the round handle to resize, double-click text to edit. Delete removes the selected item.</p>'; return; }
  if(o.type==='rect') p.innerHTML=`<h2>Box</h2><p>Covers what is under it. The covered content is still inside the file.</p><label>Color<input id="pCol" type="color" value="${o.color}"></label><label>Opacity (%)<input id="pOp" type="number" min="5" max="100" step="5" value="${Math.round((o.opacity==null?1:o.opacity)*100)}"></label><button id="pDel">Delete</button>`;
  else if(o.type==='image'){ p.innerHTML='<h2>Image</h2><p>Resizing keeps the aspect ratio.</p><button id="pRep">Replace image</button><button id="pDel">Delete</button>'; }
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
  const hot=e.target.closest('.hot'); if(hot){ e.preventDefault(); editItem(items[+hot.dataset.i]); return; }
  const el=e.target.closest('.obj');
  if(!el){ if(tool==='white'||tool==='hl'){ e.preventDefault(); drawBox(e); return; } if(tool==='text'){ e.preventDefault(); const r=ov.getBoundingClientRect(); addText((e.clientX-r.left)/zoom,(e.clientY-r.top)/zoom); } else select(null); return; }
  const o=ed.get(+el.dataset.id); select(o.id);
  if(el.firstChild.isContentEditable&&!e.target.classList.contains('rh')) return;
  const rs=e.target.classList.contains('rh'), sx=e.clientX, sy=e.clientY, ox=o.x, oy=o.y, ow=o.w, oh=o.h; let cp=false;
  e.preventDefault(); el.setPointerCapture(e.pointerId);
  const mv=ev=>{ const dx=(ev.clientX-sx)/zoom, dy=(ev.clientY-sy)/zoom; if(!cp){ if(Math.hypot(dx,dy)*zoom<3) return; ed.checkpoint(); cp=true; }
    if(rs){ o.w=Math.max(o.type==='rect'?6:20,ow+dx); if(o.type==='image') o.h=o.w*oh/ow; else if(o.type==='rect') o.h=Math.max(6,oh+dy); } else { o.x=PC.clamp(ox+dx,-ow+20,pw-20); o.y=PC.clamp(oy+dy,0,ph-10); } place(el,o); };
  const up=()=>{ el.removeEventListener('pointermove',mv); el.removeEventListener('pointerup',up); el.removeEventListener('pointercancel',up); btns(); };
  el.addEventListener('pointermove',mv); el.addEventListener('pointerup',up); el.addEventListener('pointercancel',up); });

function sample(x,y){ try{ const k=cv.width/(pw*zoom), d=cv.getContext('2d').getImageData(Math.max(0,Math.floor(x*zoom*k)),Math.max(0,Math.floor(y*zoom*k)),1,1).data; return '#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join(''); }catch(e){ return '#ffffff'; } }
function editItem(it){ if(!it) return;
  const [r,t]=ed.addBatch([{type:'rect',page,x:it.x-1.5,y:it.y-1.5,w:it.w+3,h:it.h+3,color:sample(it.x+it.w/2,it.y+it.h*.05),opacity:1},
    {type:'text',page,x:it.x,y:it.base-it.size*.946,w:it.w*1.3+it.size*2,text:it.str,size:Math.round(it.size*10)/10,color:'#000000',bold:false,italic:false,align:'left'}]);
  tool=null; renderOverlay(); select(t.id); const el=elOf(t.id); el._cp=true; setTimeout(()=>edit(el),0);
  status('Type the replacement text. The original is covered by a box, not removed from the file.','ok'); }
function drawBox(e){ const r=ov.getBoundingClientRect(), x0=(e.clientX-r.left)/zoom, y0=(e.clientY-r.top)/zoom, hl=tool==='hl', col=hl?'#ffeb3b':'#ffffff', d=document.createElement('div');
  d.className='obj'; d.style.cssText='pointer-events:none;outline:1px dashed #1d8fff;background:'+col+';opacity:'+(hl?.4:1); ov.appendChild(d); let x=x0,y=y0,w=0,h=0; ov.setPointerCapture(e.pointerId);
  const mv=ev=>{ const cx=(ev.clientX-r.left)/zoom, cy=(ev.clientY-r.top)/zoom; x=Math.min(x0,cx); y=Math.min(y0,cy); w=Math.abs(cx-x0); h=Math.abs(cy-y0); Object.assign(d.style,{left:x*zoom+'px',top:y*zoom+'px',width:w*zoom+'px',height:h*zoom+'px'}); };
  const up=()=>{ ov.removeEventListener('pointermove',mv); ov.removeEventListener('pointerup',up); ov.removeEventListener('pointercancel',up); d.remove(); if(w>3&&h>3){ const o=ed.add({type:'rect',page,x,y,w,h,color:col,opacity:hl?.4:1}); renderOverlay(); select(o.id); } };
  ov.addEventListener('pointermove',mv); ov.addEventListener('pointerup',up); ov.addEventListener('pointercancel',up); }
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
async function rasterDoc(){ const out=await PDFLib.PDFDocument.create();
  for(let i=1;i<=doc.numPages;i++){ status('Rebuilding page '+i+' of '+doc.numPages+'…'); const p=await doc.getPage(i), v1=p.getViewport({scale:1}), v=p.getViewport({scale:Math.min(2,3000/Math.max(v1.width,v1.height))}), c=document.createElement('canvas');
    c.width=Math.floor(v.width); c.height=Math.floor(v.height); const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); await p.render({canvasContext:x,viewport:v}).promise;
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.92)), img=await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    out.addPage([v1.width,v1.height]).drawImage(img,{x:0,y:0,width:v1.width,height:v1.height}); }
  return out; }
async function download(){ B('bDl').disabled=true; status('Preparing your PDF…');
  try{ const out=await PC.exportPdf(PDFLib,bytes,ed.objs,raster?await rasterDoc():undefined), a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out],{type:'application/pdf'}));
    a.download=name.replace(/\.pdf$/i,'')+'-edited.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    status('Downloaded '+a.download+' with '+ed.objs.length+(ed.objs.length===1?' added item.':' added items.'),'ok'); }
  catch(e){ status('The PDF could not be exported: '+(e&&e.message||'unknown error'),'err'); } btns(); }

document.addEventListener('click',e=>{ const t=e.target.closest('button'); if(!t) return;
  ({bOpen:()=>$('#fileIn').click(),bPrev:()=>showPage(page-1),bNext:()=>showPage(page+1),zIn:()=>{zoom=Math.min(4,zoom*1.25);showPage(page);},zOut:()=>{zoom=Math.max(.25,zoom/1.25);showPage(page);},zFit:()=>showPage(page,true),
   bEdit:()=>setTool('edit'),bText:()=>setTool('text'),bWhite:()=>setTool('white'),bHl:()=>setTool('hl'),bImg:()=>{replacing=false;$('#imgIn').click();},bUndo:()=>undoRedo(false),bRedo:()=>undoRedo(true),
   bReset:()=>{ if(confirm('Discard all added text and images? You can still undo this.')){ ed.reset(); sel=null; renderOverlay(); panel(); btns(); } },bDl:download,
   pDel:del,pRep:()=>{replacing=true;$('#imgIn').click();},pB:()=>apply(o=>o.bold=!o.bold),pI:()=>apply(o=>o.italic=!o.italic)}[t.id]||(()=>{}))(); });
document.addEventListener('change',e=>{ const t=e.target;
  if(t.id==='fileIn'){ openFile(t.files[0]); t.value=''; }
  else if(t.id==='pSize'){ const v=+t.value; if(v>=4&&v<=200) apply(o=>o.size=v); }
  else if(t.id==='pOp'){ const v=+t.value; if(v>=5&&v<=100) apply(o=>o.opacity=v/100); }
  else if(t.id==='pCol') apply(o=>o.color=t.value); else if(t.id==='pAl') apply(o=>o.align=t.value); });
document.addEventListener('keydown',e=>{ if(!doc||e.target.isContentEditable||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const m=e.ctrlKey||e.metaKey;
  if(m&&e.key.toLowerCase()==='z'){ e.preventDefault(); undoRedo(e.shiftKey); } else if(m&&e.key.toLowerCase()==='y'){ e.preventDefault(); undoRedo(true); }
  else if(e.key==='Delete'||e.key==='Backspace'){ if(sel){ e.preventDefault(); del(); } } else if(e.key==='Escape'){ tool=null; renderOverlay(); select(null); } });
const drop=$('#drop'); ['dragenter','dragover'].forEach(v=>window.addEventListener(v,e=>{ e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(v=>window.addEventListener(v,e=>{ e.preventDefault(); drop.classList.remove('over'); }));
window.addEventListener('drop',e=>openFile(e.dataTransfer.files[0]));
panel();

window.__pdfEditorReady=true;
