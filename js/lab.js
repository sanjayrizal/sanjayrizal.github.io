(function(){
const $=id=>document.getElementById(id), N=(v,d)=>Number.isFinite(v)?v.toLocaleString('en',{maximumFractionDigits:d==null?2:d}):'—';
const fld=(box,items)=>{ $(box).innerHTML=items.map(([id,l,v,extra])=>`<label>${l}${extra&&extra.sel?`<select id="${id}">${extra.sel.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`:`<input id="${id}" type="${extra&&extra.t||'number'}" inputmode="decimal" step="any" value="${v}">`}</label>`).join(''); };
const rd=id=>{const s=$(id).value.trim(); return s===''?NaN:Number(s);};
const dl=rows=>'<dl>'+rows.map(r=>`<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')+'</dl>';
const fail=(o,ids,res)=>{ $(o).innerHTML='<ul class="err">'+res.errors.map(e=>`<li>${e}</li>`).join('')+'</ul>'; ids.forEach(i=>$(i)&&$(i).setAttribute('aria-invalid','true')); };
const ok=ids=>ids.forEach(i=>$(i)&&$(i).removeAttribute('aria-invalid'));

/* A — PV */
const PV={dailyKwh:10,areaM2:60,psh:4.5,pr:0.75,moduleW:550,eff:21,offsetPct:100}, pvIds=Object.keys(PV).map(k=>'pv_'+k);
function pvInit(){ fld('pvF',[['pv_dailyKwh','Consumption (kWh/day)',PV.dailyKwh],['pv_areaM2','Area (m²)',PV.areaM2],['pv_psh','Peak sun hours (h/day)',PV.psh],['pv_pr','Performance ratio (0–1)',PV.pr],['pv_moduleW','Module (W)',PV.moduleW],['pv_eff','Module efficiency (%)',PV.eff],['pv_offsetPct','Target offset (%)',PV.offsetPct]]); }
function pv(){ const g=k=>rd('pv_'+k), r=Calc.pvSizing({dailyKwh:g('dailyKwh'),areaM2:g('areaM2'),psh:g('psh'),pr:g('pr'),moduleW:g('moduleW'),eff:g('eff')/100,offsetPct:g('offsetPct')});
  if(!r.ok) return fail('pvO',pvIds,r); ok(pvIds);
  $('pvO').innerHTML=dl([['Required PV capacity',N(r.requiredKwp)+' kWp'],['Capacity the area allows',N(r.areaLimitKwp)+' kWp'],['Capacity used',N(r.kwp)+' kWp'],['Modules',N(r.modules,0)],['Panel area',N(r.panelArea,1)+' m²'],['Daily energy',N(r.dailyKwh)+' kWh'],['Annual energy',N(r.annualKwh,0)+' kWh'],['Energy offset',N(r.offsetPct,1)+' %']])
   +(r.areaLimited?'<p class="note">Area is the limit: the target offset cannot be reached on this area.</p>':'')
   +'<p class="formula">kWp = target kWh/day ÷ (PSH × PR); daily kWh = kWp × PSH × PR; area limit = area × efficiency</p><p class="note">Offset is annual energy produced as a share of consumption; it is not self-consumption or grid export. Inverter sizing, protection, cables, structure and compliance are outside this estimate.</p>'; }

/* B — power */
const PW={phases:3,v:400,i:10,pf:0.8}, pwIds=['pw_v','pw_i','pw_pf'];
function pwInit(){ fld('pwF',[['pw_phases','System',3,{sel:[[1,'Single-phase'],[3,'Balanced three-phase']]}],['pw_v','Voltage (V) — line-to-line if 3-phase',PW.v],['pw_i','Line current (A)',PW.i],['pw_pf','Power factor (0–1)',PW.pf]]); $('pw_phases').value=3; }
function pw(){ const ph=Number($('pw_phases').value), r=Calc.power({phases:ph,v:rd('pw_v'),i:rd('pw_i'),pf:rd('pw_pf')});
  if(!r.ok) return fail('pwO',pwIds,r); ok(pwIds);
  $('pwO').innerHTML=dl([['Real power P',N(r.P/1000,3)+' kW'],['Apparent power S',N(r.S/1000,3)+' kVA'],['Reactive power Q',N(r.Q/1000,3)+' kvar'],['Phase angle',N(r.angleDeg,1)+'°']])
   +'<p class="formula">'+(ph===3?'P = √3 × V<sub>LL</sub> × I × PF; S = √3 × V<sub>LL</sub> × I':'P = V × I × PF; S = V × I')+'; Q = √(S² − P²)</p><p class="note">'+(ph===3?'Assumes a balanced load; V is line-to-line (phase voltage = V ÷ √3). Lagging/leading is not distinguished.':'Q is shown as a magnitude; lagging/leading is not distinguished.')+'</p>'; }

/* C — energy */
let loads, EN={days:30,tariff:12};
const exLoads=()=>[{name:'LED lamps',w:10,qty:8,hrs:5},{name:'Refrigerator',w:150,qty:1,hrs:8},{name:'Fan',w:60,qty:3,hrs:6},{name:'Water pump',w:750,qty:1,hrs:1}];
function enRows(){ $('enRows').innerHTML=loads.map((l,n)=>`<div class="row"><label>Load<input data-n="${n}" data-k="name" type="text" value="${l.name.replace(/"/g,'&quot;')}"></label><label>Watts<input data-n="${n}" data-k="w" type="number" step="any" value="${l.w}"></label><label>Qty<input data-n="${n}" data-k="qty" type="number" step="any" value="${l.qty}"></label><label>h/day<input data-n="${n}" data-k="hrs" type="number" step="any" value="${l.hrs}"></label><button type="button" data-del="${n}" aria-label="Remove load ${n+1}">✕</button></div>`).join(''); }
function enInit(){ loads=exLoads(); enRows(); fld('enF',[['en_days','Days per month',EN.days],['en_tariff','Tariff (currency per kWh)',EN.tariff]]); }
function en(){ const r=Calc.energy(loads.map(l=>({name:l.name||'Load',w:+l.w,qty:+l.qty,hrs:+l.hrs})),rd('en_days'),rd('en_tariff'));
  if(!r.ok) return fail('enO',['en_days','en_tariff'],r); ok(['en_days','en_tariff']);
  $('enO').innerHTML=dl([['Connected load',N(r.connectedW/1000,2)+' kW'],['Daily energy',N(r.dailyKwh)+' kWh'],['Monthly energy',N(r.monthlyKwh,1)+' kWh'],['Monthly cost',N(r.monthlyCost,0)]])
   +'<div role="img" aria-label="Share of daily energy by load: '+r.rows.map(x=>x.name+' '+N(x.share*100,0)+'%').join(', ')+'" style="margin-top:1rem">'+r.rows.map(x=>`<div class="bar"><span>${x.name.replace(/</g,'&lt;')}</span><i style="width:${x.share*100}%"></i><span>${N(x.share*100,1)}%</span></div>`).join('')+'</div>'
   +'<p class="formula">kWh/day = Σ (W × qty × h) ÷ 1000</p><p class="note">Assumes each load runs at its rated power for the hours given (no duty cycle or demand factor).</p>'; }

/* D — DC */
const dcIds=['dc_v','dc_r'];
function dcInit(){ fld('dcF',[['dc_mode','Topology',0,{sel:[['series','Series'],['parallel','Parallel']]}],['dc_v','Source (V)',12],['dc_r','Resistors (Ω), comma-separated','100, 220, 330',{t:'text'}]]); }
function dc(){ const R=$('dc_r').value.split(',').map(s=>s.trim()).filter(Boolean).map(Number), m=$('dc_mode').value, r=Calc.dcCircuit(m,rd('dc_v'),R);
  if(!r.ok) return fail('dcO',dcIds,r); ok(dcIds);
  $('dcO').innerHTML=dl([['Equivalent resistance',N(r.req,3)+' Ω'],['Source current',N(r.current*1000,3)+' mA'],['Total power',N(r.power,4)+' W']])
   +'<table style="width:100%;margin-top:1rem;font:400 .8rem var(--m);border-collapse:collapse"><caption style="text-align:left;color:var(--dim);padding-bottom:.4rem">Per resistor</caption><tr style="color:var(--dim);text-align:right"><th scope="col" style="text-align:left">R</th><th scope="col">Ω</th><th scope="col">V</th><th scope="col">mA</th><th scope="col">W</th></tr>'
   +r.parts.map((p,n)=>`<tr style="text-align:right"><th scope="row" style="text-align:left;font-weight:400">R${n+1}</th><td>${N(R[n],3)}</td><td>${N(p.v,3)}</td><td>${N(p.i*1000,3)}</td><td>${N(p.p,4)}</td></tr>`).join('')+'</table>'
   +'<p class="formula">'+(m==='series'?'R<sub>eq</sub> = ΣR; I = V ÷ R<sub>eq</sub>; V<sub>n</sub> = I × R<sub>n</sub>':'1/R<sub>eq</sub> = Σ(1/R); I<sub>n</sub> = V ÷ R<sub>n</sub>; I = ΣI<sub>n</sub>')+'; P = V × I</p><p class="note">Ideal source and ideal resistors; mixed series-parallel networks are not supported.</p>'; }

const T={pv:[pvInit,pv],pw:[pwInit,pw],en:[enInit,en],dc:[dcInit,dc]};
Object.values(T).forEach(([i,c])=>{ i(); c(); });
document.addEventListener('input',e=>{ const t=e.target; if(t.dataset&&t.dataset.n!=null){ const k=t.dataset.k; loads[t.dataset.n][k]=k==='name'?t.value:t.value; } const id=t.id||''; const p=id.slice(0,2)||(t.dataset&&t.dataset.n!=null?'en':''); if(T[p]) T[p][1](); });
document.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.reset){ T[b.dataset.reset][0](); T[b.dataset.reset][1](); }
  else if(b.id==='enAdd'){ loads.push({name:'New load',w:100,qty:1,hrs:1}); enRows(); en(); }
  else if(b.dataset.del!=null){ loads.splice(+b.dataset.del,1); enRows(); en(); } });
})();
