/* jig_mech.js (boardgame-engine): the box glue jig's material data, the owner's observation on cut wood and the working-load model of its torsion
   bars (validated on BUMBLE & BLOOM's cut jig, 2026-09-17). src/jig.js runs it as the jig's gate. */
'use strict';
// Strength data and an explicit design policy, independent of any search result.
const material=Object.freeze({
  species:'American basswood (Tilia americana)',
  source:'USDA Forest Products Laboratory, Wood Handbook (2010), FPL-GTR-190, chapter 5, Table 5-3a, p. 5-4',
  url:'https://research.fs.usda.gov/download/treesearch/37427.pdf',
  basis:'Published average small clear straight-grained solid-wood strengths; not a plywood grade or an elastic/fatigue limit.',
  moisture:'12% (dry indoor shop use assumed; moisture not measured)',
  bendingStrength:60,shearStrength:6.8,
  greenReference:{bendingStrength:34,shearStrength:4.1},
  safetyFactor:2,
  safetyFactorBasis:'Engineering policy: halve dry published mean strengths for this nonstructural shop jig; chosen before the feasibility sweep, not fitted to force or stroke. Not a statistical lower tolerance bound.',
  bendingLimit:60/2,shearLimit:6.8/2,
  limitations:'Stock species/ply layup, grain direction, glue, laser damage and moisture are unverified. The factor does not certify a plywood grade, repeated-cycle life or permanent-set threshold.',
});
const observation=Object.freeze({
  quote:'i think your stress limits are just too strict because i can move the existing fingers on the clamp jig several millimeters without hurting them.',
  source:'Owner report in the modelling-correction task, 2026-09-17',
  totalTravel:3,
  travelBasis:'Approximate interpretation of several millimeters, supplied as ~3 mm in the task; not a caliper reading. Assumed horizontal motion at the pad, from unloaded.',
  loadBasis:'One finger moved directly by hand; no ramp/friction force or simultaneous sixteen-pad seating load.',
  outcome:'Repeated movement without damage or permanent set, as reported by the owner; force, contact height and cycle count not measured.',
  barWidth:14,barLength:15,
  validation:{quote:'the glue jig for the box works perfectly as-is btw. so the springs and interference perfectly fine.',source:'Owner, 2026-09-17, after gluing the trays in the cut jig',
    meaning:'The cut jig (inset 1 mm, 14 x 15 mm bars, drawn kerf 0.18) holds a real tray as intended; the model\'s unmet 1..3 N pad-force targets are its own conservatism, not a defect. Do not redesign the springs or the interference.'},
});

// Shared working-load model: compliant warping supports, with explicit evidence.
const assert=require('node:assert/strict');
const WORKING_BOX_SIZE_MM=195;   // what the owner measured outside for the drawn 196 mm tray (2026-09-16)
const DRAWN_TO_MEASURED_MM=196-WORKING_BOX_SIZE_MM;   // each tray is expected that much under its drawn size (a glued tray closes up by about this much, whatever its size)
const WORKING_FORCE_LIMITS=Object.freeze({padMin:1,padMax:3,totalMax:48,seatingMax:80});
const torsionJ=(b,t)=>{const a=Math.max(b,t),s=Math.min(b,t);return a*s**3/3*(1-0.63*s/a+0.052*(s/a)**5);};
// End warping springs have energy Kw*phi'(end)^2/2, Kw=E*Cw*kappa.
// Solving ECw*phi''''-GJ*phi''=0 gives r=lambda*kappa/(tanh(u)+lambda*kappa).
// C=L-2*r*lambda*tanh(u). kappa=0 is free; kappa=Infinity is clamped.
// The SAME r multiplies bimoment/warping stress. Changing C alone is invalid.
function warping(d,t,G,length,kappa) {
  assert(length>0&&kappa>=0,'invalid length or warping spring');
  const J=torsionJ(d.barWidth,t),Cw=d.barWidth**3*t**3/144;
  const lambda=Math.sqrt(d.E*Cw/(G*J)),u=length/(2*lambda),tanh=Math.tanh(u);
  const restraint=kappa===Infinity?1:lambda*kappa/(tanh+lambda*kappa);
  const complianceLength=length-2*restraint*lambda*tanh;
  return {J,Cw,lambda,restraint,complianceLength,stiffness:2*G*J/complianceLength};
}
function mechanicalCase(d,t,G,shortened,seated,interferencePerSide,kappa) {
  assert(Number.isFinite(kappa)&&kappa>=0,'supply an explicit finite warping spring');
  const length=d.barLength-(shortened?2*d.rootRadius:0);
  const beam=warping(d,t,G,length,kappa),{J,lambda,restraint,stiffness}=beam;
  const h=seated.padHeight+t/2;
  const preloadTravel=h*Math.sin(seated.theta),workingTravel=preloadTravel+interferencePerSide;
  assert(workingTravel>=0&&workingTravel<h,'working pad travel exceeds rotation model');
  function atAngle(theta,hand=false) {
    const torque=stiffness*theta,padForce=torque/h;
    const slope=d.rampRun/d.rampRise,ratio=(slope+d.friction)/(1-d.friction*slope);
    const lever=d.padLow+t/2-ratio*d.pivot;
    assert(lever>0,'cam moment is self locking');
    const horizontal=hand?padForce:torque/lever,down=hand?0:horizontal*ratio;
    const frictionless=hand?0:torque/(d.padLow+t/2-slope*d.pivot)*slope;
    // Retain total-torque surface shear as a conservative screen, not an exact
    // Vlasov shear distribution. Use the SHORT section dimension near square.
    const tau=d.rootFactor*(torque/2*Math.min(d.barWidth,t)/J+1.5*Math.hypot(horizontal,down)/(2*d.barWidth*t));
    const warpBend=restraint*d.E*d.barWidth*t/4*(torque/2)/(G*J*lambda)*Math.tanh(length/(2*lambda));
    const bend=d.rootFactor*(warpBend+6*(down*length/4)/(d.barWidth*t*t)+6*(horizontal*length/4)/(t*d.barWidth*d.barWidth));
    const insertBend=6*torque/(t*d.tabLength*d.tabLength);
    return {padTravel:h*Math.sin(theta),warpingBending:warpBend,thetaRadians:theta,thetaDegrees:theta*180/Math.PI,padForce,totalForce:hand?padForce:16*padForce,
      seatingFrictionless:16*frictionless,seatingForce:16*down,peakHorizontal:horizontal,peakShear:tau,peakBending:bend,insertBending:insertBend};
  }
  return {thickness:t,G,effectiveLength:length,rootBound:shortened,warpingSpringPerECw:kappa,...beam,leverHeight:h,padHeight:seated.padHeight,
    preload:{basis:'drawn-preload',...atAngle(seated.theta)},working:{basis:'measured-box',...atAngle(Math.asin(workingTravel/h))},
    hand:{basis:'owner-approximate-hand-motion',...atAngle(Math.asin(observation.totalTravel/h),true)}};
}
const calibrationCache=new Map();
let J=null;   // the jig builder (src/jig.js hands itself over: build, parameters, seatedInsert)
function use(jig){J=jig;}
function calibration(tray) {
  const j=J,d=j.parameters(tray),key=JSON.stringify([tray.stock,d]);
  if(calibrationCache.has(key))return calibrationCache.get(key);
  const ref=j.build(tray,{...d,barWidth:observation.barWidth,barLength:observation.barLength});
  const cases=[];
  for(const t of tray.stock) {
    const seat=j.seatedInsert(ref,t);
    for(const G of [...d.G,d.nominalG])for(const root of [false,true]) {
      const evaluate=k=>mechanicalCase(ref.d,t,G,root,seat,0,k).hand;
      const utilization=c=>Math.max(c.peakShear/material.shearStrength,c.peakBending/material.bendingStrength,c.insertBending/material.bendingStrength);
      const free=utilization(evaluate(0));
      let upper=null;
      if(free<=1) {
        let lo=0,hi=1;
        while(utilization(evaluate(hi))<=1)hi*=2;
        for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(utilization(evaluate(mid))<=1)lo=mid;else hi=mid;}
        upper=lo;
      }
      cases.push({thickness:t,G,rootBound:root,freeUtilization:free,maximumSpringPerECw:upper});
    }
  }
  const compatible=cases.filter(c=>c.maximumSpringPerECw!==null);
  assert(compatible.length,'even the free-warping model contradicts the observation for all assumed stiffness cases');
  const upper=Math.max(...compatible.map(c=>c.maximumSpringPerECw));
  const result={method:'observation-compatible spring envelope',observation,
    springParameter:'kappa=Kw/(E*Cw), in 1/mm. Sweep 0..upper; no best-fit spring or measured force is claimed.',
    upperSpringPerECw:upper,minimumTransferLength:1/upper,
    basis:'For each original stock/G/root case, invert the 3 mm direct-hand strength screen using published dry mean strengths, WITHOUT the design safety factor. Keep the union: at least one case must explain the observation. The observation was not made at every uncertainty corner. This is a conditional inference using conservative stress estimates, not a rigorous identified boundary condition.',
    transfer:'The same kappa envelope is applied to candidate bars (Kw scales with E*Cw). This equivalent support-compliance assumption is unvalidated for new widths; confirm a proposed softer bar on cut stock.',
    permanentSet:'No permanent set is owner evidence. Published rupture/shear strengths do not identify the proportional limit or fatigue life. The linear elastic model is compatible with recovery but cannot independently prove it.',
    cases};
  calibrationCache.set(key,result);return result;
}
function casesFor(d,tray,seats,interferencePerSide) {
  const c=calibration(tray);
  return tray.stock.flatMap(t=>[...d.G,d.nominalG].flatMap(G=>[false,true].flatMap(root=>[0,c.upperSpringPerECw].map(k=>
    mechanicalCase(d,t,G,root,seats.get(t),interferencePerSide,k)))));
}
function mechanics(g) {
  const j=J,{d,tray}=g;
  const padPlaneSpan=g.O-2*d.padInset;
  // both trays, each at the owner's measured shrink; the stresses are bounded at the roomier one, which opens the pads furthest
  const boxes=Object.entries(tray.trays).map(([name,t])=>{const boxSize=t.out-DRAWN_TO_MEASURED_MM;return {name,drawn:t.out,boxSize,interferencePerSide:(boxSize-padPlaneSpan)/2};});
  for(const b of boxes)assert(b.interferencePerSide>0,`the measured ${b.name} tray must open the inset pads`);
  const worst=boxes.reduce((a,b)=>b.interferencePerSide>a.interferencePerSide?b:a),interferencePerSide=worst.interferencePerSide;
  const cases=casesFor(d,tray,new Map(tray.stock.map(t=>[t,j.seatedInsert(g,t)])),interferencePerSide);
  return {basis:'paired-preload-and-working',drawnPreloadRadians:d.theta,
    scope:'Working includes serialized preload plus centred 195 mm box interference. Forces/stresses bound free through observation-compatible partial restraint, both thicknesses, G values and root lengths. hand is a separate single-finger direct load, not cam seating. Conditional shop-jig estimates, not measured forces or a certified plywood stroke.',
    model:'Equivalent rectangular torsion bars, two in parallel; elastic end-warping springs, consistent compliance and warping bending; full/R1-shortened roots; eccentric cam/friction and transverse bending retained.',
    material,calibration:calibration(tray),
    assumptions:{E:d.E,G:d.G,nominalG:d.nominalG,friction:d.friction,rootFactor:d.rootFactor,
      basis:'Inherited equivalent-laminate stiffness, friction and 1.4 root stress allowance: unmeasured design assumptions, unchanged by this correction; NOT published basswood moduli. Root allowance is additional to material safety factor.'},cases,
    stressCheckBasis:'measured-box',
    working:{basis:'measured-box',boxes,boxSize:worst.boxSize,tray:worst.name,boxSizeSource:`Owner measured ${WORKING_BOX_SIZE_MM} mm outside for the drawn 196 mm tray; each tray's drawn size less that ${DRAWN_TO_MEASURED_MM} mm, the jig drawn to the trays' mean.`,padPlaneSpan,interferencePerSide,forceLimits:WORKING_FORCE_LIMITS,
      stressCeilingsSatisfied:cases.every(({working:c})=>c.peakShear<=d.shearLimit&&c.peakBending<=d.bendingLimit&&c.insertBending<=d.bendingLimit),
      forceTargetsSatisfied:cases.every(({working:c})=>c.padForce>=WORKING_FORCE_LIMITS.padMin&&c.padForce<=WORKING_FORCE_LIMITS.padMax&&c.totalForce<=WORKING_FORCE_LIMITS.totalMax&&c.seatingForce<=WORKING_FORCE_LIMITS.seatingMax)}};
}
// Cut gate screens actual working stress and clearance. The softer/full-stroke
// search additionally requires the existing 1..3 N / 48 N / 80 N force targets.
function checkWorking(g,m,{minimumStroke=0,forceTargets=false}={}) {
  assert.equal(m.basis,'paired-preload-and-working');assert.equal(m.stressCheckBasis,'measured-box');
  assert.equal(g.d.shearLimit,material.shearLimit);assert.equal(g.d.bendingLimit,material.bendingLimit);
  assert.equal(m.working.padPlaneSpan,g.O-2*g.d.padInset);
  assert.equal(m.working.boxes.length,Object.keys(g.tray.trays).length);
  for(const b of m.working.boxes){assert.equal(b.boxSize,g.tray.trays[b.name].out-DRAWN_TO_MEASURED_MM);assert.equal(b.interferencePerSide,(b.boxSize-m.working.padPlaneSpan)/2);assert(b.interferencePerSide>0);}
  assert.equal(m.working.interferencePerSide,Math.max(...m.working.boxes.map(b=>b.interferencePerSide)));
  assert.equal(m.working.boxSize,m.working.boxes.find(b=>b.name===m.working.tray).boxSize);
  assert(g.d.barWidth>=g.d.minFeature,'undersize torsion bar');
  assert(m.working.interferencePerSide>=minimumStroke,'working stroke below requested minimum');
  assert.equal(m.cases.length,g.tray.stock.length*(g.d.G.length+1)*2*2);
  for(const c of m.cases) {
    assert.equal(c.preload.basis,'drawn-preload');assert.equal(c.working.basis,'measured-box');
    const w=c.working,f=WORKING_FORCE_LIMITS;
    assert(w.peakShear<=g.d.shearLimit,`working shear ${w.peakShear} exceeds ${g.d.shearLimit} MPa`);
    assert(w.peakBending<=g.d.bendingLimit,`working bar bending ${w.peakBending} exceeds ${g.d.bendingLimit} MPa`);
    assert(w.insertBending<=g.d.bendingLimit,`working insert bending ${w.insertBending} exceeds ${g.d.bendingLimit} MPa`);
    if(forceTargets) {
      assert(w.padForce>=f.padMin&&w.padForce<=f.padMax,`working pad force ${w.padForce} outside 1..3 N`);
      assert(w.totalForce<=f.totalMax,'working sixteen-pad force exceeds 48 N');
      assert(w.seatingForce<=f.seatingMax,'working downward cam force exceeds 80 N');
    }
    const clearance=g.d.armHalf*Math.sin(w.thetaRadians)+c.thickness/2*(1-Math.cos(w.thetaRadians));
    assert(clearance<1,'working rotation needs more than 1 mm below springs');
  }
  return true;
}
/** the working box a jig must open for: the roomier tray at the owner's measured shrink */
function workingBoxSize(tray){return Math.max(...Object.values(tray.trays).map(t=>t.out-DRAWN_TO_MEASURED_MM));}
module.exports={use,WORKING_BOX_SIZE_MM,DRAWN_TO_MEASURED_MM,workingBoxSize,WORKING_FORCE_LIMITS,material,observation,torsionJ,warping,mechanicalCase,calibration,casesFor,mechanics,checkWorking};
