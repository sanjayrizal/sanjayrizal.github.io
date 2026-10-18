/* PDF Tools core: pure logic, no DOM. Works in the browser (window.ToolsCore) and in Node (tests).
   pdf-lib is passed in as an argument so the same code runs in both places. */
(function(root,factory){ if(typeof module==='object'&&module.exports) module.exports=factory(); else root.ToolsCore=factory(); })(typeof self!=='undefined'?self:this,function(){
'use strict';

/* ---------- ZIP writer (store only, no compression; PNG/JPG are already compressed) ---------- */
const CRC=(()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=CRC[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function makeZip(files,date){
  const enc=new TextEncoder(), d=date||new Date(), dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,
    dd=((Math.max(0,d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  let total=22, seen=new Set();
  const ents=files.map(f=>{ if(seen.has(f.name)) throw new Error('Duplicate file name in zip: '+f.name); seen.add(f.name);
    const nm=enc.encode(f.name); total+=30+nm.length+f.data.length+46+nm.length; return {nm,data:f.data,crc:crc32(f.data)}; });
  if(total>0xFFFFFFFF-1024||files.length>65534) throw new Error('Too much data for one zip file. Export fewer pages at a time.');
  const out=new Uint8Array(total), v=new DataView(out.buffer); let o=0; const offs=[];
  ents.forEach(e=>{ offs.push(o); v.setUint32(o,0x04034b50,true); v.setUint16(o+4,20,true); v.setUint16(o+6,0x0800,true); v.setUint16(o+8,0,true); v.setUint16(o+10,dt,true); v.setUint16(o+12,dd,true);
    v.setUint32(o+14,e.crc,true); v.setUint32(o+18,e.data.length,true); v.setUint32(o+22,e.data.length,true); v.setUint16(o+26,e.nm.length,true); v.setUint16(o+28,0,true); o+=30; out.set(e.nm,o); o+=e.nm.length; out.set(e.data,o); o+=e.data.length; });
  const cd=o;
  ents.forEach((e,i)=>{ v.setUint32(o,0x02014b50,true); v.setUint16(o+4,20,true); v.setUint16(o+6,20,true); v.setUint16(o+8,0x0800,true); v.setUint16(o+10,0,true); v.setUint16(o+12,dt,true); v.setUint16(o+14,dd,true);
    v.setUint32(o+16,e.crc,true); v.setUint32(o+20,e.data.length,true); v.setUint32(o+24,e.data.length,true); v.setUint16(o+28,e.nm.length,true); v.setUint32(o+42,offs[i],true); o+=46; out.set(e.nm,o); o+=e.nm.length; });
  v.setUint32(o,0x06054b50,true); v.setUint16(o+8,ents.length,true); v.setUint16(o+10,ents.length,true); v.setUint32(o+12,o-cd,true); v.setUint32(o+16,cd,true);
  return out;
}

/* ---------- page ranges: "1-3, 5, 8-" -> zero-based indices (in the order written, no duplicates) ---------- */
function parsePageRange(text,count){
  const s=String(text||'').trim(); if(!s) return Array.from({length:count},(_,i)=>i);
  const out=[], seen=new Set();
  for(const part of s.split(',')){ const p=part.trim(); if(!p) continue; const m=/^(\d*)\s*(-)?\s*(\d*)$/.exec(p); if(!m||(m[1]===''&&m[3]==='')) throw new Error('"'+p+'" is not a valid page or range. Use something like 1-3, 5, 8-');
    let a,b; if(!m[2]){ a=b=+m[1]; } else { a=m[1]===''?1:+m[1]; b=m[3]===''?count:+m[3]; }
    if(a<1||b<1||a>count||b>count) throw new Error('Page numbers must be between 1 and '+count+' (you wrote "'+p+'").');
    if(a>b) throw new Error('"'+p+'" goes backwards. Write the smaller page number first.');
    for(let i=a;i<=b;i++) if(!seen.has(i)){ seen.add(i); out.push(i-1); } }
  if(!out.length) throw new Error('No pages selected.'); return out;
}

/* ---------- JPEG EXIF orientation (1..8, or 1 if none). Phone photos are often stored sideways with orientation 6/8. ---------- */
function jpegOrientation(b){
  if(!b||b.length<4||b[0]!==0xFF||b[1]!==0xD8) return 1; let p=2;
  while(p+4<b.length){ if(b[p]!==0xFF){ p++; continue; } const mk=b[p+1]; if(mk===0xFF){ p++; continue; } if(mk===0xD8||(mk>=0xD0&&mk<=0xD7)||mk===0x01){ p+=2; continue; } if(mk===0xDA||mk===0xD9) break;
    const len=(b[p+2]<<8)|b[p+3]; if(mk===0xE1&&b[p+4]===0x45&&b[p+5]===0x78&&b[p+6]===0x69&&b[p+7]===0x66){ const t=p+10, le=b[t]===0x49; const u16=o=>le?b[t+o]|(b[t+o+1]<<8):(b[t+o]<<8)|b[t+o+1], u32=o=>le?(b[t+o]|(b[t+o+1]<<8)|(b[t+o+2]<<16)|(b[t+o+3]<<24))>>>0:((b[t+o]<<24)|(b[t+o+1]<<16)|(b[t+o+2]<<8)|b[t+o+3])>>>0;
      const ifd=u32(4); if(ifd<8||t+ifd+2>b.length) return 1; const n=u16(ifd); for(let i=0;i<n;i++){ const e=ifd+2+i*12; if(t+e+12>b.length) break; if(u16(e)===0x0112){ const val=u16(e+8); return val>=1&&val<=8?val:1; } } return 1; }
    p+=2+len; }
  return 1;
}

/* ---------- images -> one PDF (one image per page) ---------- */
const PAGE={a4:[595.28,841.89],letter:[612,792]};
async function imagesToPdf(PL,items,opt){
  opt=opt||{}; if(!items.length) throw new Error('Add at least one image.');
  const doc=await PL.PDFDocument.create(), margin=Math.max(0,opt.margin==null?24:opt.margin);
  for(const it of items){ const img=it.kind==='jpg'?await doc.embedJpg(it.bytes):await doc.embedPng(it.bytes); let pw,ph,x,y,w,h;
    if(opt.size==='a4'||opt.size==='letter'){ let [W,H]=PAGE[opt.size]; if(img.width>img.height&&opt.orient!=='portrait'){ [W,H]=[H,W]; } pw=W; ph=H; const k=Math.min((pw-2*margin)/img.width,(ph-2*margin)/img.height); w=img.width*k; h=img.height*k; x=(pw-w)/2; y=(ph-h)/2; }
    else { const k=Math.min(1,14400/Math.max(img.width,img.height))*0.75; pw=w=Math.max(1,img.width*k); ph=h=Math.max(1,img.height*k); x=0; y=0; }
    const pg=doc.addPage([pw,ph]); pg.drawImage(img,{x,y,width:w,height:h}); }
  return doc.save();
}

/* ---------- merge several PDFs in the given order ---------- */
async function mergePdfs(PL,list){
  if(list.length<2) throw new Error('Add at least two PDFs to merge.');
  const out=await PL.PDFDocument.create();
  for(let i=0;i<list.length;i++){ let src; try{ src=await PL.PDFDocument.load(list[i].bytes); }catch(e){ throw new Error('"'+(list[i].name||('file '+(i+1)))+'" could not be opened. It may be damaged or password-protected.'); }
    const pages=await out.copyPages(src,src.getPageIndices()); pages.forEach((p,k)=>fixInherited(src.getPage(k),p,out,PL)); pages.forEach(p=>out.addPage(p)); }
  return out.save();
}
/* copyPages can lose attributes a page inherited from its parent node, so copy them explicitly */
function fixInherited(srcPage,dstPage,doc,PL,addRotation){
  const mb=srcPage.getMediaBox(), cb=srcPage.getCropBox(); dstPage.setMediaBox(mb.x,mb.y,mb.width,mb.height); dstPage.setCropBox(cb.x,cb.y,cb.width,cb.height);
  dstPage.setRotation(PL.degrees((((srcPage.getRotation().angle+(addRotation||0))%360)+360)%360));
}

/* ---------- rearrange / rotate / delete: plan = [{src:zeroBasedIndex, rotate:0|90|180|270}] in output order ---------- */
async function arrangePdf(PL,bytes,plan){
  if(!plan.length) throw new Error('The new PDF would have no pages. Keep at least one page.');
  const src=await PL.PDFDocument.load(bytes), out=await PL.PDFDocument.create(), n=src.getPageCount();
  plan.forEach(p=>{ if(!(p.src>=0&&p.src<n)) throw new Error('Page '+(p.src+1)+' does not exist.'); });
  const copies=await out.copyPages(src,plan.map(p=>p.src));
  copies.forEach((c,i)=>{ fixInherited(src.getPage(plan[i].src),c,out,PL,plan[i].rotate||0); out.addPage(c); });
  return out.save();
}

/* ---------- crop ---------- */
/* box = visible area of the unrotated page {x,y,width,height}; rotate = page /Rotate (0/90/180/270, clockwise);
   f = rectangle drawn on the DISPLAYED page as fractions from the top-left {x0,y0,x1,y1}. Returns the rectangle in PDF user space. */
function cropRectToPdf(box,rotate,f){
  const w=box.width,h=box.height,r=(((Math.round(rotate/90)*90)%360)+360)%360; let xa,xb,ya,yb;
  if(r===0){ xa=f.x0*w; xb=f.x1*w; ya=(1-f.y1)*h; yb=(1-f.y0)*h; }
  else if(r===90){ xa=f.y0*w; xb=f.y1*w; ya=f.x0*h; yb=f.x1*h; }
  else if(r===180){ xa=(1-f.x1)*w; xb=(1-f.x0)*w; ya=f.y0*h; yb=f.y1*h; }
  else { xa=(1-f.y1)*w; xb=(1-f.y0)*w; ya=(1-f.x1)*h; yb=(1-f.x0)*h; }
  return {x:box.x+xa,y:box.y+ya,width:xb-xa,height:yb-ya};
}
/* crops: array (one entry per page) of {x0,y0,x1,y1} fractions, or null to leave that page alone.
   Sets both CropBox and MediaBox so every viewer shows the cropped area. The cropped-away content stays inside the file (this is not redaction). */
async function cropPdf(PL,bytes,crops){
  const doc=await PL.PDFDocument.load(bytes), pages=doc.getPages(); let changed=0;
  pages.forEach((pg,i)=>{ const f=crops[i]; if(!f) return; if(!(f.x1-f.x0>0.005&&f.y1-f.y0>0.005)) throw new Error('The crop area on page '+(i+1)+' is too small.');
    const r=cropRectToPdf(pg.getCropBox(),pg.getRotation().angle,f); if(!(r.width>1&&r.height>1)) throw new Error('The crop area on page '+(i+1)+' is too small.');
    pg.setCropBox(r.x,r.y,r.width,r.height); pg.setMediaBox(r.x,r.y,r.width,r.height); ['TrimBox','BleedBox','ArtBox'].forEach(k=>pg.node.delete(PL.PDFName.of(k))); changed++; });
  if(!changed) throw new Error('Draw a crop area first.');
  return doc.save();
}

return {crc32,makeZip,parsePageRange,jpegOrientation,imagesToPdf,mergePdfs,arrangePdf,cropPdf,cropRectToPdf};
});
