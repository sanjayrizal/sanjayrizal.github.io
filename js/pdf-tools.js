import * as pdfjs from '../vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdf.worker.min.mjs',import.meta.url).href;
const TC=window.ToolsCore, PL=window.PDFLib, $=s=>document.querySelector(s), FONTS=new URL('../vendor/standard_fonts/',import.meta.url).href;
const MAXPDF=100<<20, MAXIMG=30<<20, MAXPX=16000000;
const status=(m,k)=>{ const s=$('#status'); s.textContent=m||''; s.className=k||''; };
const mb=n=>(n/1048576).toFixed(1)+' MB', tick=()=>new Promise(r=>setTimeout(r,0));
const isPdf=u8=>new TextDecoder('latin1').decode(u8.subarray(0,1024)).includes('%PDF-');
const baseName=n=>(n||'document').replace(/\.[^.]*$/,'').replace(/[^\w.\- ]+/g,'_')||'document';
async function readFile(f,max){ if(f.size>max) throw new Error('"'+f.name+'" is too large ('+mb(f.size)+'). The limit is '+mb(max)+'.'); return new Uint8Array(await f.arrayBuffer()); }
const pdfError=(e,name)=>e&&e.name==='PasswordException'?'"'+name+'" is password-protected. Remove the password first, then try again.':'"'+name+'" could not be opened as a PDF. It may be damaged or protected.';
async function openPdf(f){ const bytes=await readFile(f,MAXPDF); if(!isPdf(bytes)) throw new Error('"'+f.name+'" does not look like a PDF file.');
  let doc,count; try{ doc=await pdfjs.getDocument({data:bytes.slice(),standardFontDataUrl:FONTS}).promise; }catch(e){ throw new Error(pdfError(e,f.name)); }
  try{ count=(await PL.PDFDocument.load(bytes)).getPageCount(); }catch(e){ doc.destroy(); throw new Error('"'+f.name+'" is protected or damaged, so it cannot be changed here.'); }
  return {bytes,doc,count,name:f.name}; }
function download(data,name,mime){ const u=URL.createObjectURL(new Blob([data],{type:mime})), a=document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),15000); }
const h=(tag,attrs,...kids)=>{ const e=document.createElement(tag); for(const k in (attrs||{})){ if(k==='text') e.textContent=attrs[k]; else if(k.startsWith('on')) e[k]=attrs[k]; else e.setAttribute(k,attrs[k]); } kids.forEach(c=>c&&e.append(c)); return e; };
const move=(a,i,d)=>{ const j=i+d; if(j<0||j>=a.length) return; const t=a[i]; a[i]=a[j]; a[j]=t; };
const toBlob=(c,type,q)=>new Promise(r=>c.toBlob(r,type,q));
function dropzone(zone,input,cb){ const z=$('#'+zone), i=$('#'+input);
  z.addEventListener('click',()=>i.click()); z.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); i.click(); } });
  i.addEventListener('change',()=>{ const f=Array.from(i.files); i.value=''; if(f.length) cb(f); });
  ['dragenter','dragover'].forEach(n=>z.addEventListener(n,e=>{ e.preventDefault(); z.classList.add('over'); })); ['dragleave','drop'].forEach(n=>z.addEventListener(n,e=>{ e.preventDefault(); z.classList.remove('over'); }));
  z.addEventListener('drop',e=>{ const f=Array.from(e.dataTransfer.files); if(f.length) cb(f); }); }
const run=async(btn,msg,fn,after)=>{ btn.disabled=true; if(msg) status(msg); try{ await fn(); }catch(e){ status((e&&e.message)||String(e),'err'); console.error(e); } finally{ if(after) after(); else btn.disabled=false; } };

/* ---------- tabs ---------- */
const TABS=['img','zip','arr','crop','merge'];
function showTab(id){ TABS.forEach(t=>{ const on=t===id; $('#t-'+t).setAttribute('aria-selected',on); $('#t-'+t).tabIndex=on?0:-1; $('#p-'+t).hidden=!on; }); status(''); }
TABS.forEach((t,i)=>{ const b=$('#t-'+t); b.addEventListener('click',()=>showTab(t)); b.addEventListener('keydown',e=>{ const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0; if(d){ const n=TABS[(i+d+TABS.length)%TABS.length]; showTab(n); $('#t-'+n).focus(); } }); });

/* ---------- 1. images -> PDF ---------- */
const imgs=[];
const IMGRE=/\.(jpe?g|png|webp|gif|bmp|avif)$/i;
dropzone('d-img','in-img',files=>{ let skipped=[]; files.forEach(f=>{ if(!(f.type.startsWith('image/')||IMGRE.test(f.name))||f.size>MAXIMG) skipped.push(f.name); else imgs.push({file:f,url:URL.createObjectURL(f)}); });
  renderImgs(); status(skipped.length?'Skipped (not an image, or over '+mb(MAXIMG)+'): '+skipped.join(', '):imgs.length+' image'+(imgs.length===1?'':'s')+' ready.',skipped.length?'err':'ok'); });
function renderImgs(){ const ul=$('#l-img'); ul.replaceChildren(); imgs.forEach((it,i)=>{ const li=h('li',{},h('img',{src:it.url,alt:''}),h('span',{class:'nm'},document.createTextNode((i+1)+'. '+it.file.name)),h('small',{text:mb(it.file.size)}),
    h('button',{text:'↑','aria-label':'Move up',onclick:()=>{ move(imgs,i,-1); renderImgs(); }}),h('button',{text:'↓','aria-label':'Move down',onclick:()=>{ move(imgs,i,1); renderImgs(); }}),
    h('button',{text:'✕','aria-label':'Remove',onclick:()=>{ URL.revokeObjectURL(it.url); imgs.splice(i,1); renderImgs(); }})); ul.append(li); });
  $('#b-img').disabled=$('#b-img-clear').disabled=!imgs.length; }
$('#b-img-clear').onclick=()=>{ imgs.forEach(i=>URL.revokeObjectURL(i.url)); imgs.length=0; renderImgs(); status(''); };
async function canvasConvert(f,asJpg){ let bmp; try{ bmp=await createImageBitmap(f,{imageOrientation:'from-image'}); }catch(e){ throw new Error('"'+f.name+'" could not be read as an image.'); }
  const k=Math.min(1,5000/Math.max(bmp.width,bmp.height),Math.sqrt(MAXPX*1.5/(bmp.width*bmp.height))), c=document.createElement('canvas'); c.width=Math.max(1,Math.round(bmp.width*k)); c.height=Math.max(1,Math.round(bmp.height*k));
  const x=c.getContext('2d'); if(asJpg){ x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); } x.drawImage(bmp,0,0,c.width,c.height); if(bmp.close) bmp.close();
  const blob=await toBlob(c,asJpg?'image/jpeg':'image/png',.92); c.width=c.height=0; if(!blob) throw new Error('"'+f.name+'" could not be converted.'); return {kind:asJpg?'jpg':'png',bytes:new Uint8Array(await blob.arrayBuffer())}; }
async function toEmbeddable(f,force){ const u8=new Uint8Array(await f.arrayBuffer()), jpg=u8[0]===0xFF&&u8[1]===0xD8, png=u8[0]===0x89&&u8[1]===0x50&&u8[2]===0x4E&&u8[3]===0x47;
  if(!force){ if(jpg&&TC.jpegOrientation(u8)===1) return {kind:'jpg',bytes:u8}; if(png) return {kind:'png',bytes:u8}; }
  return canvasConvert(f,jpg); }
$('#b-img').onclick=()=>run($('#b-img'),'Reading images…',async()=>{ const opt={size:$('#o-size').value}; let items=[];
  for(let i=0;i<imgs.length;i++){ status('Reading image '+(i+1)+' of '+imgs.length+'…'); await tick(); items.push(await toEmbeddable(imgs[i].file,false)); }
  status('Building PDF…'); await tick(); let pdf;
  try{ pdf=await TC.imagesToPdf(PL,items,opt); }catch(e){ items=[]; for(let i=0;i<imgs.length;i++){ status('Converting image '+(i+1)+' of '+imgs.length+'…'); await tick(); items.push(await toEmbeddable(imgs[i].file,true)); } pdf=await TC.imagesToPdf(PL,items,opt); }
  download(pdf,imgs.length===1?baseName(imgs[0].file.name)+'.pdf':'images.pdf','application/pdf'); status('Done: PDF with '+imgs.length+' page'+(imgs.length===1?'':'s')+' ('+mb(pdf.length)+').','ok'); },renderImgs);

/* ---------- 2. PDF -> images (ZIP) ---------- */
let zp=null;
dropzone('d-zip','in-zip',files=>run($('#b-zip'),'Opening PDF…',async()=>{ const f=await openPdf(files[0]); if(zp) zp.doc.destroy(); zp=f; $('#s-zip').textContent=f.name+' · '+f.count+' page'+(f.count===1?'':'s'); status('Ready.','ok'); },()=>{ $('#b-zip').disabled=!zp; }));
$('#b-zip').onclick=()=>run($('#b-zip'),'Starting…',async()=>{ const idx=TC.parsePageRange($('#o-range').value,zp.count), jpg=$('#o-fmt').value==='jpg', dpi=+$('#o-dpi').value, base=baseName(zp.name), digits=Math.max(3,String(zp.count).length), files=[], reduced=[]; let total=0;
  for(let k=0;k<idx.length;k++){ status('Rendering page '+(idx[k]+1)+' ('+(k+1)+' of '+idx.length+')…'); await tick(); const page=await zp.doc.getPage(idx[k]+1); let vp=page.getViewport({scale:dpi/72});
    if(vp.width*vp.height>MAXPX){ vp=page.getViewport({scale:dpi/72*Math.sqrt(MAXPX/(vp.width*vp.height))}); reduced.push(idx[k]+1); }
    const c=document.createElement('canvas'); c.width=Math.max(1,Math.floor(vp.width)); c.height=Math.max(1,Math.floor(vp.height)); const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height);
    await page.render({canvasContext:x,viewport:vp}).promise; const blob=await toBlob(c,jpg?'image/jpeg':'image/png',.92); c.width=c.height=0; page.cleanup(); if(!blob) throw new Error('Page '+(idx[k]+1)+' could not be converted to an image.');
    const data=new Uint8Array(await blob.arrayBuffer()); total+=data.length; if(total>900*1048576) throw new Error('The images are getting too big for the browser. Choose fewer pages or a lower quality.');
    files.push({name:base+'-page-'+String(idx[k]+1).padStart(digits,'0')+(jpg?'.jpg':'.png'),data}); }
  status('Creating ZIP…'); await tick(); const zip=TC.makeZip(files); download(zip,base+'-pages.zip','application/zip');
  status('Done: '+files.length+' image'+(files.length===1?'':'s')+' in a ZIP ('+mb(zip.length)+').'+(reduced.length?' Pages '+reduced.join(', ')+' are very large, so their quality was lowered to fit the browser limit.':''),'ok'); },()=>{ $('#b-zip').disabled=!zp; });

/* ---------- 3. rearrange ---------- */
let ar=null, plan=[], thumbs=[], thumbTok=0, dragFrom=-1;
const syncArr=()=>{ $('#b-arr').disabled=!plan.length; $('#b-arr-rev').disabled=$('#b-arr-reset').disabled=!ar; };
dropzone('d-arr','in-arr',files=>run($('#b-arr'),'Opening PDF…',async()=>{ const f=await openPdf(files[0]); if(ar) ar.doc.destroy(); ar=f; thumbs=[]; plan=Array.from({length:f.count},(_,i)=>({src:i,rotate:0})); $('#s-arr').textContent=f.name+' · '+f.count+' page'+(f.count===1?'':'s'); renderGrid(); status('Drag pages to reorder, or use the buttons on each page.','ok'); makeThumbs(); },syncArr));
async function makeThumbs(){ const tok=++thumbTok, d=ar.doc; for(let i=0;i<ar.count;i++){ if(tok!==thumbTok) return; try{ const p=await d.getPage(i+1), v1=p.getViewport({scale:1}), v=p.getViewport({scale:170/Math.max(v1.width,v1.height)}), c=document.createElement('canvas'); c.width=Math.max(1,Math.floor(v.width)); c.height=Math.max(1,Math.floor(v.height));
      const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); await p.render({canvasContext:x,viewport:v}).promise; thumbs[i]=c.toDataURL('image/jpeg',.7); p.cleanup(); }catch(e){ thumbs[i]='data:,'; }
    document.querySelectorAll('#g-arr img[data-src="'+i+'"]').forEach(im=>{ im.src=thumbs[i]; }); if(i%8===7) await tick(); } }
function renderGrid(){ const g=$('#g-arr'); g.replaceChildren();
  plan.forEach((it,i)=>{ const img=h('img',{alt:'Page '+(it.src+1),'data-src':it.src}); if(thumbs[it.src]) img.src=thumbs[it.src]; img.style.transform='rotate('+it.rotate+'deg)'; img.draggable=false;
    const card=h('div',{class:'card',draggable:'true'},h('div',{class:'box'},img),h('div',{class:'lbl',text:'Position '+(i+1)+' · was page '+(it.src+1)+(it.rotate?' · rotated '+it.rotate+'°':'')}),
      h('div',{class:'acts'},h('button',{text:'◀','aria-label':'Move earlier',onclick:()=>{ move(plan,i,-1); renderGrid(); }}),h('button',{text:'▶','aria-label':'Move later',onclick:()=>{ move(plan,i,1); renderGrid(); }}),
        h('button',{text:'⟲','aria-label':'Rotate left',onclick:()=>{ it.rotate=(it.rotate+270)%360; renderGrid(); }}),h('button',{text:'⟳','aria-label':'Rotate right',onclick:()=>{ it.rotate=(it.rotate+90)%360; renderGrid(); }}),
        h('button',{text:'✕','aria-label':'Delete page',onclick:()=>{ plan.splice(i,1); renderGrid(); }})));
    card.addEventListener('dragstart',e=>{ dragFrom=i; card.classList.add('drag'); e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',String(i)); });
    card.addEventListener('dragend',()=>{ dragFrom=-1; card.classList.remove('drag'); });
    card.addEventListener('dragover',e=>{ if(dragFrom<0) return; e.preventDefault(); card.classList.add('over'); }); card.addEventListener('dragleave',()=>card.classList.remove('over'));
    card.addEventListener('drop',e=>{ e.preventDefault(); card.classList.remove('over'); if(dragFrom<0||dragFrom===i) return; const [m]=plan.splice(dragFrom,1); plan.splice(i,0,m); dragFrom=-1; renderGrid(); });
    g.append(card); }); syncArr(); }
$('#b-arr-rev').onclick=()=>{ plan.reverse(); renderGrid(); };
$('#b-arr-reset').onclick=()=>{ plan=Array.from({length:ar.count},(_,i)=>({src:i,rotate:0})); renderGrid(); status('Back to the original order.'); };
$('#b-arr').onclick=()=>run($('#b-arr'),'Building PDF…',async()=>{ await tick(); const out=await TC.arrangePdf(PL,ar.bytes,plan); download(out,baseName(ar.name)+'-rearranged.pdf','application/pdf'); status('Done: new PDF with '+plan.length+' page'+(plan.length===1?'':'s')+'.','ok'); },syncArr);

/* ---------- 4. crop ---------- */
let cr=null, cpage=0, crop=null, crTok=0;
const wrap=$('#cropWrap'), cvs=$('#cropCv'), box=$('#cropBox'), S={t:$('#r-t'),b:$('#r-b'),l:$('#r-l'),r:$('#r-r')};
const syncCrop=()=>{ $('#c-prev').disabled=!cr||cpage<=0; $('#c-next').disabled=!cr||cpage>=cr.count-1; $('#c-clear').disabled=!crop; $('#c-go').disabled=!crop; $('#c-pg').textContent=cr?'Page '+(cpage+1)+' of '+cr.count:'–'; };
function drawBox(){ if(!crop){ box.hidden=true; ['t','b','l','r'].forEach(k=>{ S[k].value=0; $('#v-'+k).textContent='0'; }); syncCrop(); return; }
  box.hidden=false; box.style.left=crop.x0*100+'%'; box.style.top=crop.y0*100+'%'; box.style.width=(crop.x1-crop.x0)*100+'%'; box.style.height=(crop.y1-crop.y0)*100+'%';
  const v={t:crop.y0,b:1-crop.y1,l:crop.x0,r:1-crop.x1}; for(const k in v){ S[k].value=Math.round(v[k]*100); $('#v-'+k).textContent=Math.round(v[k]*100); } syncCrop(); }
async function showCropPage(){ const tok=++crTok, p=await cr.doc.getPage(cpage+1), v1=p.getViewport({scale:1}), v=p.getViewport({scale:Math.min(1.6,680/v1.width)}); if(tok!==crTok) return;
  const c=document.createElement('canvas'); c.width=Math.floor(v.width); c.height=Math.floor(v.height); const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); await p.render({canvasContext:x,viewport:v}).promise; if(tok!==crTok) return;
  cvs.width=c.width; cvs.height=c.height; cvs.getContext('2d').drawImage(c,0,0); p.cleanup(); wrap.hidden=false; $('#c-sl').hidden=false; drawBox(); }
dropzone('d-crop','in-crop',files=>run($('#c-go'),'Opening PDF…',async()=>{ const f=await openPdf(files[0]); if(cr) cr.doc.destroy(); cr=f; cpage=0; crop=null; $('#s-crop').textContent=f.name+' · '+f.count+' page'+(f.count===1?'':'s'); await showCropPage(); status('Drag on the page to choose the area to keep.','ok'); },syncCrop));
const go=d=>{ if(!cr) return; const n=cpage+d; if(n<0||n>=cr.count) return; cpage=n; syncCrop(); showCropPage().catch(e=>status(e.message,'err')); };
$('#c-prev').onclick=()=>go(-1); $('#c-next').onclick=()=>go(1);
const fromSliders=k=>{ let l=+S.l.value/100, r=+S.r.value/100, t=+S.t.value/100, b=+S.b.value/100;
  if(l+r>.96){ if(k==='l') l=.96-r; else r=.96-l; } if(t+b>.96){ if(k==='t') t=.96-b; else b=.96-t; }
  crop=(l||r||t||b)?{x0:l,x1:1-r,y0:t,y1:1-b}:null; drawBox(); };
['t','b','l','r'].forEach(k=>S[k].addEventListener('input',()=>fromSliders(k)));
let dragStart=null; const pt=e=>{ const r=cvs.getBoundingClientRect(); return {x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))}; };
wrap.addEventListener('pointerdown',e=>{ if(e.button>0) return; dragStart=pt(e); wrap.setPointerCapture(e.pointerId); e.preventDefault(); });
wrap.addEventListener('pointermove',e=>{ if(!dragStart) return; const p=pt(e); if(Math.abs(p.x-dragStart.x)<.01||Math.abs(p.y-dragStart.y)<.01) return; crop={x0:Math.min(p.x,dragStart.x),x1:Math.max(p.x,dragStart.x),y0:Math.min(p.y,dragStart.y),y1:Math.max(p.y,dragStart.y)}; drawBox(); });
['pointerup','pointercancel'].forEach(n=>wrap.addEventListener(n,()=>{ dragStart=null; }));
$('#c-clear').onclick=()=>{ crop=null; drawBox(); status(''); };
$('#c-go').onclick=()=>run($('#c-go'),'Cropping…',async()=>{ await tick(); const crops=Array(cr.count).fill(null); if($('#o-scope').value==='all') crops.fill(crop); else crops[cpage]=crop; const out=await TC.cropPdf(PL,cr.bytes,crops);
  download(out,baseName(cr.name)+'-cropped.pdf','application/pdf'); status('Done: cropped PDF downloaded.','ok'); },syncCrop);

/* ---------- 5. merge ---------- */
const ml=[];
dropzone('d-merge','in-merge',files=>run($('#b-merge'),'Reading files…',async()=>{ const bad=[]; for(const f of files){ try{ const bytes=await readFile(f,MAXPDF); if(!isPdf(bytes)) throw 0; const pages=(await PL.PDFDocument.load(bytes)).getPageCount(); ml.push({name:f.name,bytes,pages,size:f.size}); }catch(e){ bad.push(f.name); } }
  renderMerge(); status(bad.length?'Could not add (not a PDF, too large, damaged or password-protected): '+bad.join(', '):ml.length+' PDF'+(ml.length===1?'':'s')+' in the list.',bad.length?'err':'ok'); },renderMerge));
function renderMerge(){ const ul=$('#l-merge'); ul.replaceChildren(); ml.forEach((it,i)=>ul.append(h('li',{},h('span',{class:'nm',text:(i+1)+'. '+it.name}),h('small',{text:it.pages+' page'+(it.pages===1?'':'s')+' · '+mb(it.size)}),
    h('button',{text:'↑','aria-label':'Move up',onclick:()=>{ move(ml,i,-1); renderMerge(); }}),h('button',{text:'↓','aria-label':'Move down',onclick:()=>{ move(ml,i,1); renderMerge(); }}),h('button',{text:'✕','aria-label':'Remove',onclick:()=>{ ml.splice(i,1); renderMerge(); }}))));
  $('#b-merge').disabled=ml.length<2; $('#b-merge-clear').disabled=!ml.length; $('#s-merge').textContent=ml.length?ml.reduce((a,b)=>a+b.pages,0)+' pages in total':''; }
$('#b-merge-clear').onclick=()=>{ ml.length=0; renderMerge(); status(''); };
$('#b-merge').onclick=()=>run($('#b-merge'),'Merging…',async()=>{ await tick(); const out=await TC.mergePdfs(PL,ml.map(m=>({bytes:m.bytes,name:m.name}))); download(out,'merged.pdf','application/pdf'); status('Done: '+ml.length+' PDFs merged into one ('+mb(out.length)+').','ok'); },renderMerge);

if(!TC||!PL){ status('A required file is missing. Check that vendor/pdf-lib.min.js and js/tools-core.js are uploaded, then hard-refresh with Ctrl+Shift+R.','err'); }
else { showTab('img'); status('Choose a tool above. Your files stay in your browser and are never uploaded.'); window.__pdfToolsReady=true; }
