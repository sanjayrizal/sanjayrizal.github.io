/* Engineering Lab calculation core — pure functions, no DOM. */
(function(r,f){ if(typeof module==='object'&&module.exports) module.exports=f(); else r.Calc=f(); })(this,function(){
function chk(errs,label,v,o){ o=o||{}; const min=o.min==null?0:o.min, max=o.max==null?Infinity:o.max;
  if(!Number.isFinite(v)) errs.push(label+' is required');
  else if(o.excl?v<=min:v<min) errs.push(label+' must be '+(o.excl?'greater than ':'at least ')+min);
  else if(v>max) errs.push(label+' must be at most '+max); }

/* Preliminary grid-connected PV sizing. Daily energy = kWp × PSH × PR. */
function pvSizing(i){ const e=[];
  chk(e,'Daily consumption (kWh/day)',i.dailyKwh,{excl:true,max:10000});
  chk(e,'Available area (m²)',i.areaM2,{excl:true,max:1e6});
  chk(e,'Peak sun hours (h/day)',i.psh,{excl:true,max:12});
  chk(e,'Performance ratio',i.pr,{excl:true,max:1});
  chk(e,'Module rating (W)',i.moduleW,{excl:true,max:1000});
  chk(e,'Module efficiency',i.eff,{excl:true,max:0.30});
  chk(e,'Target offset (%)',i.offsetPct,{excl:true,max:100});
  if(e.length) return {ok:false,errors:e};
  const targetKwh=i.dailyKwh*i.offsetPct/100;
  const requiredKwp=targetKwh/(i.psh*i.pr);
  const areaLimitKwp=i.areaM2*i.eff;            // STC: 1 kW/m² irradiance
  const kwp=Math.min(requiredKwp,areaLimitKwp);
  const modules=Math.ceil(kwp*1000/i.moduleW);
  const moduleArea=i.moduleW/(1000*i.eff);
  const daily=kwp*i.psh*i.pr;
  return {ok:true,errors:[],targetKwh,requiredKwp,areaLimitKwp,areaLimited:requiredKwp>areaLimitKwp,
    kwp,modules,panelArea:modules*moduleArea,dailyKwh:daily,annualKwh:daily*365,
    offsetPct:Math.min(100,daily/i.dailyKwh*100)};
}

/* Single-phase: P=V·I·PF, S=V·I.  Balanced 3-phase: P=√3·VLL·I·PF, S=√3·VLL·I. */
function power(i){ const e=[];
  if(i.phases!==1&&i.phases!==3) e.push('Phases must be 1 or 3');
  chk(e,'Voltage (V)',i.v,{excl:true,max:1e6});
  chk(e,'Current (A)',i.i,{excl:true,max:1e5});
  chk(e,'Power factor',i.pf,{excl:true,max:1});
  if(e.length) return {ok:false,errors:e};
  const k=i.phases===3?Math.sqrt(3):1;
  const S=k*i.v*i.i, P=S*i.pf, Q=Math.sqrt(Math.max(0,S*S-P*P));
  return {ok:true,errors:[],P,S,Q,angleDeg:Math.acos(i.pf)*180/Math.PI};
}

/* Energy: kWh/day = Σ(W × qty × h)/1000. */
function energy(loads,daysPerMonth,tariff){ const e=[];
  if(!loads.length) e.push('Add at least one load');
  loads.forEach((l,n)=>{ const t='Load '+(n+1);
    chk(e,t+' power (W)',l.w,{excl:true,max:1e7}); chk(e,t+' quantity',l.qty,{excl:true,max:1e5});
    chk(e,t+' hours/day',l.hrs,{max:24}); });
  chk(e,'Days per month',daysPerMonth,{excl:true,max:31});
  chk(e,'Tariff (per kWh)',tariff,{});
  if(e.length) return {ok:false,errors:e};
  const rows=loads.map(l=>({name:l.name,kwhDay:l.w*l.qty*l.hrs/1000}));
  const dailyKwh=rows.reduce((a,x)=>a+x.kwhDay,0);
  rows.forEach(x=>x.share=dailyKwh>0?x.kwhDay/dailyKwh:0);
  const monthlyKwh=dailyKwh*daysPerMonth;
  return {ok:true,errors:[],rows,connectedW:loads.reduce((a,l)=>a+l.w*l.qty,0),dailyKwh,monthlyKwh,monthlyCost:monthlyKwh*tariff};
}

/* DC source with resistors purely in series or purely in parallel. */
function dcCircuit(mode,vs,R){ const e=[];
  if(mode!=='series'&&mode!=='parallel') e.push('Mode must be series or parallel');
  chk(e,'Source voltage (V)',vs,{excl:true,max:1e6});
  if(!R.length) e.push('Enter at least one resistor');
  R.forEach((x,n)=>chk(e,'R'+(n+1)+' (Ω)',x,{excl:true,max:1e12}));
  if(e.length) return {ok:false,errors:e};
  let req,parts;
  if(mode==='series'){ req=R.reduce((a,x)=>a+x,0); const I=vs/req; parts=R.map(x=>({v:I*x,i:I})); }
  else { req=1/R.reduce((a,x)=>a+1/x,0); parts=R.map(x=>({v:vs,i:vs/x})); }
  parts.forEach((p,n)=>p.p=p.v*p.i);
  const I=vs/req;
  return {ok:true,errors:[],req,current:I,power:vs*I,parts};
}
return {pvSizing,power,energy,dcCircuit};
});
