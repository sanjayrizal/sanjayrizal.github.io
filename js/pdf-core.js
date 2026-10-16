/* PDF editor core — no DOM. Coordinates are PDF points with a TOP-LEFT origin; export flips y. */
(function(r,f){ if(typeof module==='object'&&module.exports) module.exports=f(); else r.PdfCore=f(); })(this,function(){
function Editor(){ this.objs=[]; this.undo=[]; this.redo=[]; this.n=0; }
Editor.prototype={
  snap(){ return JSON.stringify(this.objs); },
  checkpoint(){ this.undo.push(this.snap()); if(this.undo.length>100) this.undo.shift(); this.redo=[]; },
  add(o){ this.checkpoint(); o.id=++this.n; this.objs.push(o); return o; },
  addBatch(list){ this.checkpoint(); list.forEach(o=>{ o.id=++this.n; this.objs.push(o); }); return list; },
  get(id){ return this.objs.find(o=>o.id===id); },
  remove(id){ this.checkpoint(); this.objs=this.objs.filter(o=>o.id!==id); },
  reset(){ if(this.objs.length){ this.checkpoint(); this.objs=[]; } },
  undoStep(){ if(!this.undo.length) return false; this.redo.push(this.snap()); this.objs=JSON.parse(this.undo.pop()); return true; },
  redoStep(){ if(!this.redo.length) return false; this.undo.push(this.snap()); this.objs=JSON.parse(this.redo.pop()); return true; }
};
const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
function sniff(u8){ const h=Array.from(u8.slice(0,8));
  if(h[0]===0x25&&h[1]===0x50&&h[2]===0x44&&h[3]===0x46) return 'pdf';
  if(h[0]===0x89&&h[1]===0x50&&h[2]===0x4E&&h[3]===0x47) return 'png';
  if(h[0]===0xFF&&h[1]===0xD8&&h[2]===0xFF) return 'jpg'; return null; }
function hexToRgb(hex){ const m=/^#?([0-9a-f]{6})$/i.exec(hex||''); const n=m?parseInt(m[1],16):0; return {r:(n>>16&255)/255,g:(n>>8&255)/255,b:(n&255)/255}; }
function wrapLines(text,maxW,measure){ const out=[];
  String(text).replace(/\r/g,'').replace(/\t/g,'    ').split('\n').forEach(par=>{ let line='';
    for(const w of par.split(' ')){ const t=line?line+' '+w:w; if(measure(t)<=maxW){ line=t; continue; }
      if(line){ out.push(line); line=''; }
      if(measure(w)<=maxW){ line=w; continue; }
      for(const ch of w){ if(!line||measure(line+ch)<=maxW) line+=ch; else { out.push(line); line=ch; } } }
    out.push(line); });
  return out; }
const BASELINE=0.946, LEADING=1.2; // matches CSS line-height:1.2 with Helvetica/Arial metrics
const dataUrlBytes=u=>Uint8Array.from(atob(u.split(',')[1]),c=>c.charCodeAt(0));
async function exportPdf(L,bytes,objs,base){
  const doc=base||await L.PDFDocument.load(bytes), pages=doc.getPages(), fonts={}, imgs={};
  const names={'':'Helvetica',B:'HelveticaBold',I:'HelveticaOblique',BI:'HelveticaBoldOblique'};
  for(const o of objs){ const pg=pages[o.page]; if(!pg) continue; const H=pg.getHeight();
    if(o.type==='rect'){ const c=hexToRgb(o.color); pg.drawRectangle({x:o.x,y:H-o.y-o.h,width:o.w,height:o.h,color:L.rgb(c.r,c.g,c.b),opacity:o.opacity==null?1:o.opacity}); }
    else if(o.type==='image'){
      const im=imgs[o.dataUrl]||(imgs[o.dataUrl]=o.mime==='image/png'?await doc.embedPng(dataUrlBytes(o.dataUrl)):await doc.embedJpg(dataUrlBytes(o.dataUrl)));
      pg.drawImage(im,{x:o.x,y:H-o.y-o.h,width:o.w,height:o.h});
    } else {
      const k=(o.bold?'B':'')+(o.italic?'I':''); const font=fonts[k]||(fonts[k]=await doc.embedFont(L.StandardFonts[names[k]]));
      const safe=s=>[...s].map(c=>{ try{ font.encodeText(c); return c; }catch(e){ return '?'; } }).join('');
      const {r,g,b}=hexToRgb(o.color);
      wrapLines(o.text,o.w,s=>font.widthOfTextAtSize(safe(s),o.size)).forEach((ln,i)=>{ ln=safe(ln); if(!ln) return;
        const w=font.widthOfTextAtSize(ln,o.size), dx=o.align==='center'?(o.w-w)/2:o.align==='right'?o.w-w:0;
        pg.drawText(ln,{x:o.x+dx,y:H-o.y-o.size*BASELINE-i*o.size*LEADING,size:o.size,font,color:L.rgb(r,g,b)}); });
    } }
  return doc.save();
}
/* ---- Plain-background remover (pure pixel maths, no DOM) ----
   rgba: Uint8ClampedArray/Uint8Array of w*h*4. Modifies and returns it.
   opt: {r,g,b, tol (0-200), feather (0-100), contiguous (bool)}
   Pixels within `tol` colour distance of the background become transparent; pixels between
   tol and tol+feather fade in. contiguous=true only removes background reachable from the image border. */
function removeBackground(rgba,w,h,opt){
  const tol=Math.max(0,+opt.tol||0), fe=Math.max(0,+opt.feather||0), lim=tol+fe, n=w*h, R=opt.r, G=opt.g, Bc=opt.b;
  const dist=new Float32Array(n);
  for(let i=0;i<n;i++){ const j=i*4, dr=rgba[j]-R, dg=rgba[j+1]-G, db=rgba[j+2]-Bc; dist[i]=Math.sqrt(dr*dr+dg*dg+db*db); }
  let region=null;
  if(opt.contiguous){
    region=new Uint8Array(n); const q=new Int32Array(n); let qh=0,qt=0;
    const push=i=>{ if(!region[i]&&dist[i]<=lim){ region[i]=1; q[qt++]=i; } };
    for(let x=0;x<w;x++){ push(x); push((h-1)*w+x); } for(let y=0;y<h;y++){ push(y*w); push(y*w+w-1); }
    while(qh<qt){ const i=q[qh++], x=i%w, y=(i-x)/w; if(x>0) push(i-1); if(x<w-1) push(i+1); if(y>0) push(i-w); if(y<h-1) push(i+w); }
  }
  for(let i=0;i<n;i++){ if(region&&!region[i]) continue; const d=dist[i]; let a;
    if(d<=tol) a=0; else if(d>=lim) continue; else a=(d-tol)/fe;   // fe>0 here because tol<d<lim
    const j=i*4+3; rgba[j]=Math.round(rgba[j]*a); }
  return rgba;
}
/* Guess the background colour: median of the four corner patches (each averaged). */
function guessBackground(rgba,w,h){
  const k=Math.max(1,Math.min(6,Math.floor(Math.min(w,h)/4))), cs=[[0,0],[w-k,0],[0,h-k],[w-k,h-k]], m=[[],[],[]];
  cs.forEach(([cx,cy])=>{ const s=[0,0,0]; for(let y=cy;y<cy+k;y++) for(let x=cx;x<cx+k;x++){ const j=(y*w+x)*4; s[0]+=rgba[j]; s[1]+=rgba[j+1]; s[2]+=rgba[j+2]; } for(let c=0;c<3;c++) m[c].push(s[c]/(k*k)); });
  const med=a=>{ a.sort((p,q)=>p-q); return (a[1]+a[2])/2; };
  return {r:Math.round(med(m[0])),g:Math.round(med(m[1])),b:Math.round(med(m[2]))};
}
return {Editor,clamp,sniff,hexToRgb,wrapLines,exportPdf,removeBackground,guessBackground};
});
