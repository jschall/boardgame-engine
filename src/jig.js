#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* jig.js (boardgame-engine): the shoulder box's glue jig: a 17-piece torsion box jig (one integral base with sixteen two-bar spring stations and
   sixteen identical glued ramp inserts) that squeezes a tray square while its glue sets, on one offcut with any extra jig the game brings (jigs.js).
   node engine/bin/bg.js jig [--parts FILE] [--out DIR] [--preview DIR] [--no-render]
   Dimensions are FINISHED mm; the kerf is applied in the file, machine compensation OFF. Use a central bench support: the outer spring stations must
   overhang it. Validated on cut wood (BUMBLE & BLOOM, 2026-09-17: "the glue jig for the box works perfectly as-is"). The jig is drawn to the mean of the
   two trays (the lid is drawn 0.8 mm larger than the base, both centred on its pads); the mechanics (jig_mech.js) pair the drawn preload with the working
   interference against each tray at the owner's measured shrink (195 for a drawn 196), conditional on equivalent G=150..220 MPa, E=3000 MPa: explicit
   design assumptions, not measured ply data. */
'use strict';
const fs=require('fs'), path=require('path'), assert=require('node:assert/strict');
const lg=require('../lib/lasergeom.js'), K=require('./shapes.js'), mech=require('./jig_mech.js');
const {Polygon, LineString, box, unary_union, affinity, polys, text, centered, cut_svg, eng_svg, ring_d, fm, EMPTY}=lg;
const EPS=0.015, MIN_LOAD_BEARING_WIDTH=2.0, MIN_LOAD_BEARING_PROJECTION=1.0;
const {material}=mech;
const move=(g,x,y)=>affinity.translate(g,x,y);
const label=(s,size,x,y)=>centered(text(s,size,0,0,{font:K.FONT.SB}),x,y);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function argumentsFor(argv, GAME_DIR) {
  const args=[...argv];
  const opt=(key,d)=>{const i=args.indexOf(key);if(i<0)return d;assert(args[i+1]&&!args[i+1].startsWith('--'),`${key} needs a value`);return args.splice(i,2)[1];};
  const flag=key=>{const i=args.indexOf(key);if(i<0)return false;args.splice(i,1);return true;};
  const o={out:opt('--out',GAME_DIR),input:opt('--parts',path.join(GAME_DIR,'parts/parts.json')),preview:opt('--preview',path.join(GAME_DIR,'preview','jigs')),noRender:flag('--no-render')};
  assert(!args.length,`unknown arguments: ${args}`);return o;
}
function readTray(input) {
  const data = JSON.parse(fs.readFileSync(input, 'utf8')), m = data.meta;
  for (const key of ['OUT_BASE', 'OUT_LID', 'INNER', 'WALL_H', 'FLOOR_UP'])
    assert(Number.isFinite(m[key]) && m[key] > 0, `missing positive meta.${key}`);
  assert(m.stocks && m.box_stock && m.stocks[m.box_stock], 'parts.json META names no box stock');
  const BS = m.stocks[m.box_stock];
  assert(BS.t >= BS.tlo, 'inverted stock range');
  assert(m.OUT_LID >= m.OUT_BASE, 'the lid tray is the roomier one');
  assert(['file', 'machine'].includes(m.kerf_comp), 'unknown source compensation');
  assert(Number.isFinite(BS.kerf) && BS.kerf > 0 && m.fits.FLOOR_TAB > 0 && m.fits.WALL_T > 0, 'missing tray fit data');
  // One jig glues both trays: it is drawn to their mean size, each tray centred on its pads, and its pads must clear both trays' floor tabs
  const O = (m.OUT_BASE + m.OUT_LID) / 2, trays = {};
  for (const which of ['base', 'lid']) trays[which] = { out: which === 'base' ? m.OUT_BASE : m.OUT_LID, slots: readWalls(data, m, which) };
  const shift = which => (O - trays[which].out) / 2;   // a tray's wall coordinate into the jig's
  const slots = trays.base.slots.map((s, i) => ({
    lo: Math.min(...Object.keys(trays).map(w => trays[w].slots[i].lo + shift(w))),
    hi: Math.max(...Object.keys(trays).map(w => trays[w].slots[i].hi + shift(w))),
  }));
  const stockParameters = {}; for (const [k, s] of Object.entries(m.stocks)) { stockParameters[s.params.lo] = s.tlo; stockParameters[s.params.hi] = s.t; stockParameters[s.params.kerf] = s.kerf; }
  return { out: O, trays, height: m.WALL_H, stock: [BS.tlo, BS.t], kerf: BS.kerf, stockKey: m.box_stock, stockName: BS.name, mat: BS.mat, params: m.params,
    wallT: m.fits.WALL_T, floorUp: m.FLOOR_UP, stockParameters, proud: Math.max(m.fits.FLOOR_TAB, m.fits.WALL_T) - BS.tlo, slots };
}
/** one tray's floor slots along its walls, from the cut outlines of its four walls (in the wall's own coordinates, 0..OUT) */
function readWalls(data, m, which) {
  const OUT = which === 'base' ? m.OUT_BASE : m.OUT_LID, walls = {};
  for (const side of 'SENW') {
    const pid = `wall-${side}-${which}`, fragment = data.parts[pid];
    assert(typeof fragment === 'string', `missing ${pid}`);
    const paths = [...fragment.matchAll(/<path\b[^>]*>/g)].map(m => m[0])
      .filter(p => /stroke="#ff0000"/.test(p));
    const shapes = paths.map(p => {
      const rings = lg.rings_of_svg(p);
      assert(rings.length === 1, `${pid}: expected separate polygonal cut rings`);
      assert(!/[ACHQSTVachqstv]/.test(/\sd="([^"]*)"/.exec(p)[1]), `${pid}: unsupported curved cut`);
      return Polygon(rings[0]);
    }).sort((a, b) => b.area - a.area);
    assert(shapes.length >= 3, `${pid}: expected one outline and the floor slots`);
    const sourceKerf = m.kerf_comp === 'file' ? m.part_kerf[pid] : 0;
    assert(Number.isFinite(sourceKerf), `${pid}: missing kerf`);
    const [x0, y0, x1, y1] = shapes[0].bounds;
    assert(Math.abs(x1 - x0 - sourceKerf - OUT) <= 2 * EPS, `${pid}: OUT disagrees with outline`);
    assert(Math.abs(y1 - y0 - sourceKerf - m.WALL_H) <= 2 * EPS, `${pid}: height disagrees with outline`);
    // Holes were offset inward for the laser. Undo that offset before measuring;
    // take the widest slot envelope, including the space behind its crush ribs.
    const slots = shapes.slice(1).map(g => {
      assert(shapes[0].contains(g), `${pid}: slot outside wall`);
      const b = g.bounds;
      return { lo: b[0] - sourceKerf / 2, hi: b[2] + sourceKerf / 2,
        y0: b[1] - sourceKerf / 2, y1: b[3] + sourceKerf / 2 };
    }).sort((a, b) => a.lo - b.lo);
    slots.forEach((s, i) => {
      assert(s.lo > m.fits.WALL_T && s.hi < OUT - m.fits.WALL_T, `${pid}: corner meets slot`);
      assert(Math.abs(s.hi - s.lo - m.fits.SLOT_W) < 2 * EPS, `${pid}: slot width disagrees with meta`);
      if (i) assert(slots[i - 1].hi < s.lo, `${pid}: slots overlap`);
    });
    walls[side] = slots;
  }
  // Use a common, conservative envelope on all walls; source coordinates differ
  // by up to 0.01 mm through SVG rounding. No nominal slot coordinates are copied.
  const slots = walls.S.map((s, i) => ({
    lo: Math.min(...Object.values(walls).map(w => w[i].lo)),
    hi: Math.max(...Object.values(walls).map(w => w[i].hi)),
  }));
  for (const w of Object.values(walls)) w.forEach((s, i) =>
    assert(Math.abs((s.lo + s.hi - slots[i].lo - slots[i].hi) / 2) < EPS, 'walls have different slot locations'));
  return slots;
}

function sidePlan(g,side,O) {
  const M={N:[1,0,0,-1,0,0],S:[1,0,0,1,0,O],W:[0,-1,1,0,0,0],E:[0,1,1,0,O,0]};
  assert(M[side]);return affinity.affine_transform(g,M[side]);
}
// Local +y points outward; inset before mirroring/rotating every side.
function stationPlan(g,c,side,O,padInset) {
  return sidePlan(move(g,c,-padInset),side,O);
}
function parameters(tray) {
  assert(tray.kerf>=0.1&&tray.kerf<=0.3,`jig: the box stock's kerf ${tray.kerf} is outside 0.1 to 0.3 mm (the mechanics were validated at 0.18)`);
  return {barWidth:14,barLength:15,armWidth:9,armHalf:14,pivot:20,gap:2,rootRadius:1,
    theta:0.003,padInset:1,padLow:Math.min(20,tray.height-4),padHigh:Math.min(22,tray.height-2),rampRun:1.5,rampRise:6,
    G:[150,220],nominalG:185,E:3000,friction:0.30,rootFactor:1.4,
    shearLimit:material.shearLimit,bendingLimit:material.bendingLimit,material,tabLength:8,slotClearance:0.15,tabDepth:2.25,
    sheet:[300,450],minFeature:MIN_LOAD_BEARING_WIDTH};   /* one nominal sheet, 3 mm margins: a box up to 205 mm inside fits */
}
// Rotate (outward distance, height) about the torsion axis. Positive opens pad.
function rotateSection(g,theta,pivot,t) {
  const c=Math.cos(theta),s=Math.sin(theta),z=-t/2;
  return affinity.affine_transform(g,[c,s,-s,c,pivot-c*pivot-s*z,z+s*pivot-c*z]);
}
function build(tray,d=parameters(tray)) {
  const O=tray.out,t=(tray.stock[0]+tray.stock[1])/2;
  const gaps=[[tray.height/2,tray.slots[0].lo],...tray.slots.slice(0,-1).map((s,i)=>[s.hi,tray.slots[i+1].lo]),[tray.slots.at(-1).hi,O-tray.height/2]].filter(([a,b])=>b-a>=d.armWidth+2*d.gap+2*d.minFeature+2);
  assert(gaps.length>=1,'no gap between the floor tabs and the corners is wide enough for a spring station');
  const centres=gaps.map(([a,b])=>(a+b)/2),a=d.armWidth/2,L=d.barLength,w=d.barWidth/2,p=d.pivot;
  const edge=p+d.armHalf+d.gap+4,plate=lg.rrect(-edge,-edge,O+edge,O+edge,5);
  const arm=box(-a,p-d.armHalf,a,p+d.armHalf);
  const bars=box(-a-L,p-w,a+L,p+w);
  const island=arm.union(bars).buffer(d.rootRadius).buffer(-d.rootRadius);
  const envelope=box(-a-L,p-d.armHalf-d.gap,a+L,p+d.armHalf+d.gap);
  const moat=envelope.difference(island),slot=box(-(tray.stock[1]+d.slotClearance)/2,p-d.tabLength/2,(tray.stock[1]+d.slotClearance)/2,p+d.tabLength/2);
  const holes=[],stations=[];
  for(const side of 'NESW')for(const c of centres) {
    const at=g=>stationPlan(g,c,side,O,d.padInset);
    holes.push(at(moat),at(slot));stations.push({side,c,moat:at(moat),slot:at(slot),arm:at(arm),bars:at(bars)});
  }
  // Waste opening recovers the sixteen inserts from otherwise unused centre.
  const centreHole=lg.rrect(22,22,O-22,O-22,5);
  const base=plate.difference(unary_union([...holes,centreHole]));
  // Profile starts at the drawn-preload pad plane, then rotates back for cutting.
  // A real box opens the inset pads farther; theta is not the available stroke.
  // Mortise is square to the unloaded arm; its integral tab is never rotated in
  // the flat design. The two flat shoulders bear on the arm and must be glued.
  const pl=d.padLow,ph=d.padHigh;   /* the pad face from padLow to padHigh above the plate, a lead-in 2 mm below it, the body 7 mm above it */
  const loadedBody=Polygon([[1.5,0],[p+6,0],[p+6,ph+7],[1.5,ph+6],[0,ph],[0,pl],[1.5,pl-2]]);
  const tilted=rotateSection(loadedBody,-d.theta,p,t);
  const body=tilted.intersection(box(-5,0,35,40));
  const tab=box(p-d.tabLength/2,-d.tabDepth,p+d.tabLength/2,0.5);
  const insert=body.union(tab);
  return {tray,d,O,t,centres,gaps,plate,base,arm,bars,moat,slot,island,centreHole,stations,insert,loadedBody,
    parts:{'box-base':{cut:base,eng:EMPTY,count:1},'box-ramp':{cut:insert,eng:EMPTY,count:stations.length}}};
}
// Saint-Venant rectangle, long dimension b, short dimension t. No polar-I
// shortcut. tau <= T*t/J is a conservative surface-shear bound for b/t > 4.
const torsionJ=(b,t)=>b*t**3/3*(1-0.63*t/b+0.052*(t/b)**5);
function serializedFinished(g,kerf) {
  const paths=cut_svg(lg.compensate_cut(g,kerf));
  const rings=[...paths.matchAll(/<path\b[^>]*>/g)].flatMap(m=>lg.rings_of_svg(m[0]));
  return Polygon(rings[0],rings.slice(1)).buffer(-kerf/2,{join_style:'mitre'});
}
function seatedInsert(g,t) {
  // Contact at local x=0 measures only the drawn preload, not real-box seating.
  const finished=serializedFinished(g.insert,g.tray.kerf);
  const at=angle=>rotateSection(finished,angle,g.d.pivot,t);
  const overlap=angle=>at(angle).intersection(box(-5,g.d.padLow-2,1,g.d.padHigh+3)).bounds[0];
  let lo=0,hi=0.02;
  assert(overlap(lo)<0&&overlap(hi)>0,'insert has no positive, reachable seating angle');
  for(let i=0;i<50;i++) {const mid=(lo+hi)/2;if(overlap(mid)<0)lo=mid;else hi=mid;}
  const loaded=at(hi),pad=loaded.exterior.coords.filter(([y,z])=>z>=g.d.padLow-2&&z<=g.d.padHigh+3).sort((a,b)=>a[0]-b[0])[0];
  assert(Math.abs(pad[0])<0.00001&&pad[1]>=g.d.padLow-0.02&&pad[1]<=g.d.padHigh+0.02,`serialized insert contacts outside the ${g.d.padLow}..${g.d.padHigh} pad`);
  return {theta:hi,padHeight:pad[1],loaded};
}
// Keep generator metadata and the working search on one mechanics implementation.
function mechanics(g) {return mech.mechanics(g);}
function pieceCheck(id,g,kerf) {
  assert(g.is_valid&&polys(g).length===1,`${id}: disconnected/invalid`);
  assert(polys(g.buffer(-MIN_LOAD_BEARING_WIDTH/2+0.01)).length===1,`${id}: load path below 2 mm`);
  const paths=cut_svg(lg.compensate_cut(g,kerf));
  const rings=[...paths.matchAll(/<path\b[^>]*>/g)].flatMap(m=>lg.rings_of_svg(m[0]));
  const roundtrip=Polygon(rings[0],rings.slice(1)).buffer(-kerf/2,{join_style:'mitre'});
  assert(roundtrip.is_valid&&polys(roundtrip).length===1,`${id}: kerf disconnects piece`);
  assert(roundtrip.buffer(0.025).covers(g)&&g.buffer(0.025).covers(roundtrip),`${id}: kerf round trip >0.025 mm`);
  return paths;
}
function check(g,m) {
  const {d,tray,O}=g;
  assert(Number.isFinite(d.padInset)&&d.padInset>=1,'pad planes must be at least 2 mm smaller than drawn tray');
  assert(d.barWidth>=MIN_LOAD_BEARING_WIDTH&&d.barLength>=MIN_LOAD_BEARING_PROJECTION,'undersize torsion bar');
  assert(g.stations.length===4*g.gaps.length&&Object.values(g.parts).reduce((s,p)=>s+p.count,0)===1+g.stations.length,'box jig must have one base and a ramp per station');
  const paths=Object.fromEntries(Object.entries(g.parts).map(([id,p])=>[id,pieceCheck(id,p.cut,tray.kerf)]));
  // each tray sits centred on the jig's pads: its wall ring and its proud joints are checked where it really stands
  const trayRings=Object.values(tray.trays).map(t=>{const o=(O-t.out)/2;return box(o,o,O-o,O-o).difference(box(o+tray.wallT,o+tray.wallT,O-o-tray.wallT,O-o-tray.wallT));});
  for(const ring of trayRings)assert(g.base.covers(ring),'base must support all four tray wall bottoms');
  for(const [i,s] of g.stations.entries()) {
    { const gap=g.gaps[i%g.gaps.length]; assert(s.c-tray.stock[1]/2>gap[0]+0.5&&s.c+tray.stock[1]/2<gap[1]-0.5,'pad overlaps proud finger/floor tab'); }
    for(const ring of trayRings)assert(s.moat.distance(ring)>tray.proud+0.5,'station touches proud joint');
    assert((d.armWidth-(tray.stock[1]+d.slotClearance))/2>=d.minFeature,'mortise side ligaments below minimum');
    assert(s.slot.distance(s.moat)>=d.minFeature,'mortise breaks arm');
    // Sever both collinear bars, not the arm: exactly one arm must come free.
    const cuts=[-1,1].map(sign=>stationPlan(box(sign*(d.armWidth/2+d.barLength/2)-0.2,d.pivot-d.barWidth/2-0.1,sign*(d.armWidth/2+d.barLength/2)+0.2,d.pivot+d.barWidth/2+0.1),s.c,s.side,O,d.padInset));
    assert(polys(g.base.difference(unary_union(cuts))).length===2,'station is not attached by exactly its two bars');
    for(const q of g.stations.slice(i+1))assert(s.moat.distance(q.moat)>=2,'spring stations meet');
  }
  const loaded=rotateSection(g.insert,d.theta,d.pivot,g.t);
  assert(loaded.intersection(box(-5,0,-0.001,tray.height)).area<1e-5,'seated insert penetrates wall');
  const contact=loaded.intersection(LineString([[0.00001,d.padLow],[0.00001,d.padHigh]]));
  assert(contact.length>d.padHigh-d.padLow-0.05,`pad is not ${d.padLow}..${d.padHigh} mm above plate`);
  assert(loaded.intersection(box(-5,0,0.5,d.padLow-2)).is_empty,'insert hits low proud tab ends');
  assert(g.insert.bounds[0]<-0.02,'no unloaded interference');
  assert(d.tabDepth<tray.stock[0]-0.2,'tab sticks below arm');
  mech.checkWorking(g,m);
  return {paths,contactHeight:[d.padLow,d.padHigh],barWidth:d.barWidth,barLength:d.barLength,parts:1+g.stations.length,stations:g.stations.length,
    padInset:d.padInset,padPlaneSpan:O-2*d.padInset,
    workingStressPass:m.working.stressCeilingsSatisfied,forceTargetsSatisfied:m.working.forceTargetsSatisfied,
    minLoadPath:d.minFeature,underSpringClearance:1};
}
function doc(body,W,H,title,meta) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${H}mm" height="${W}mm" viewBox="0 0 ${H} ${W}">\n<title>${esc(title)}</title>\n<metadata>${esc(JSON.stringify(meta))}</metadata>\n<g id="datum-left" transform="matrix(0,1,-1,0,${H},0)">${body}</g>\n</svg>\n`;
}
function output(g,m,qa,opts,extra) {
  /* the game's extra jig (jigs.js): { parts: {id: {cut, eng, count}}, items: [[id, x, y, rot, gid]] in its own frame, meta, assembly } nested under the box jig */
  const parts={...g.parts};
  if(extra){for(const [id,p] of Object.entries(extra.parts)){assert(!(id in parts),`extra jig part ${id} clashes with the box jig`);parts[id]=p;}}
  const [W,H]=g.d.sheet,items=[],placed=[];
  function put(id,x,y,rot=0,gid=id) {
    const p=parts[id],cut=move(affinity.rotate(p.cut,rot,[0,0]),x,y);
    const comp=lg.compensate_cut(cut,g.tray.kerf);
    assert(box(3,3,W-3,H-3).covers(comp),`${gid}: outside ${W} x ${H} offcut`);
    for(const q of placed)assert(comp.distance(q.cut)>=1.5,`${gid}/${q.id}: nesting collision`);
    items.push([id,x,y,rot,gid]);placed.push({id:gid,cut:comp});
  }
  const bb=g.base.bounds,bx=(W-(bb[2]-bb[0]))/2-bb[0],by=21-bb[1];
  put('box-base',bx,by);
  const ib=g.insert.bounds,iw=ib[2]-ib[0],ih=ib[3]-ib[1];
  const NR=g.stations.length,hb=g.centreHole.bounds,hw=hb[2]-hb[0]-4,hh=hb[3]-hb[1]-4;
  const cols=Math.max(0,Math.floor((hw+2.1)/(iw+2.1))),rows=Math.max(0,Math.floor((hh+2.1)/(ih+2.1))),inHole=Math.min(NR,cols*rows);
  for(let k=0;k<inHole;k++){const row=Math.floor(k/cols),col=k%cols;put('box-ramp',bx+hb[0]+2-ib[0]+col*(iw+2.1),by+hb[1]+2-ib[1]+row*(ih+2.1),0,`box-ramp-${k+1}`);}
  let below=by+bb[3]+4;   /* the rest in rows across the sheet under the base */
  if(inHole<NR){const per=Math.floor((W-7+2.1)/(iw+2.1));for(let k=inHole;k<NR;k++){const j=k-inHole,row=Math.floor(j/per),col=j%per;put('box-ramp',3.5-ib[0]+col*(iw+2.1),below-ib[1]+row*(ih+2.1),0,`box-ramp-${k+1}`);}below+=Math.ceil((NR-inHole)/per)*(ih+2.1)+2;}
  if(extra){
    const nb=extra.bounds,cy=below,cx=(W-(nb[2]-nb[0]))/2;
    for(const [pid,x,y,rot,gid] of extra.items)put(pid,cx+x-nb[0],cy+y-nb[1],rot,gid);
  }
  assert(items.length===1+g.stations.length+(extra?extra.items.length:0),'the jig sheet lost a part');
  // Identification and machine settings only: how to use the jigs is in the
  // page's test-sheet card, never engraved on the sheet.
  const headers=[`ASSEMBLY JIG${extra?'S':''} / ${g.tray.stockName}`,`KERF ${g.tray.kerf} mm IN FILE / MACHINE OFF`];
  const headerEng=unary_union(headers.map((s,i)=>label(s,i?3.2:4,W/2,5+i*5)));
  assert(placed.every(p=>p.cut.distance(headerEng)>1),'header touches parts');
  const bodies=Object.fromEntries(Object.entries(parts).map(([id,p])=>[id,cut_svg(lg.compensate_cut(p.cut,g.tray.kerf))+eng_svg(p.eng)]));
  // All engraving first, all enclosed cuts next, all outlines last. Explicit
  // nesting order keeps the recovered inserts cut before releasing the base.
  const groups=items.map(([id,x,y,r,gid])=>({id,gid,tr:`translate(${fm(x)},${fm(y)}) rotate(${r})`}));
  const engraving=groups.map(q=>`<g id="${q.gid}-engrave" transform="${q.tr}">${eng_svg(parts[q.id].eng)}</g>`).join('');
  const cutGroups=groups.map(q=>({...q,paths:[...cut_svg(lg.compensate_cut(parts[q.id].cut,g.tray.kerf)).matchAll(/<path\b[^>]*\/>/g)].map(m=>m[0])}));
  const inner=cutGroups.map(q=>`<g transform="${q.tr}">${q.paths.slice(1).join('')}</g>`).join('');
  const outer=[...cutGroups.filter(q=>q.id!=='box-base'),...cutGroups.filter(q=>q.id==='box-base')].map(q=>`<g id="${q.gid}-outline" transform="${q.tr}">${q.paths[0]}</g>`).join('');
  const meta={design:`${g.stations.length} integral two-bar torsion stations + ${g.stations.length} identical glued ramp inserts`,sheet_w:W,sheet_h:H,headers,kerf:g.tray.kerf,kerf_comp:'file',margin:3,stock:g.tray.stockKey,
    part_kerf:Object.fromEntries(Object.keys(parts).map(k=>[k,g.tray.kerf])),boxPartCount:1+g.stations.length,extraPartCount:extra?extra.items.length:0,partCount:items.length,padCentres:g.centres,padHeight:[g.d.padLow,g.d.padHigh],dimensions:g.d,mechanics:m,checks:qa,
    // Where each ramp stands in the ASSEMBLED jig, not where it is nested for
    // cutting. The angle is measured by pushing a unit step along the arm
    // through the same sidePlan transform the geometry uses, so a mirrored
    // side cannot quietly place a ramp backwards.
    stations:g.stations.map(s=>{
      // Anchor on the ramp profile's ORIGIN at the inset pad plane, not the mortise:
      // the profile carries its tab at x = pivot along the outward direction, so
      // anchoring on the mortise would stand every ramp a pivot too far out.
      const a=stationPlan(LineString([[0,0],[0,1]]),s.c,s.side,g.O,g.d.padInset).coords;
      const inset=g.d.padInset,expected={N:[s.c,inset],E:[g.O-inset,s.c],S:[s.c,g.O-inset],W:[inset,s.c]}[s.side];
      assert(a[0].every((v,i)=>Math.abs(v-expected[i])<1e-8),`${s.side}: exported station must move inward`);
      return {side:s.side,x:+a[0][0].toFixed(3),y:+a[0][1].toFixed(3),
        rot:+(Math.atan2(a[1][1]-a[0][1],a[1][0]-a[0][0])*180/Math.PI).toFixed(1)};
    }),
    extra:extra?extra.meta:null,assembly:['Glue each box insert square into its mortise, ramp facing inward; let cure.',
    `Set the base on a flat central bench support at most ${Math.floor(g.O-6)} x ${Math.floor(g.O-6)} mm; leave at least 1 mm air below all spring stations. The support is workholding, not a cut jig part.`,
    `Lower the tray open side up; pad faces bear ${g.d.padLow}–${g.d.padHigh} mm above the plate. Lift straight up to remove.`].concat(extra&&extra.assembly?[extra.assembly]:[])};
  delete meta.checks.paths;
  const title=headers.join(' / '),svg=doc(eng_svg(headerEng)+engraving+inner+outer,W,H,title,meta);
  assert(!/<text\b|#00a000|id="reference"/.test(svg),'jig sheet must use outlines, no reference');
  const out=path.join(opts.out,'parts');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(opts.preview,{recursive:true});
  fs.writeFileSync(path.join(out,'jig-sheet.svg'),svg);
  fs.writeFileSync(path.join(opts.out,'jig.json'),JSON.stringify({parts:bodies,layout:{'jig-sheet':{title,mat:g.tray.mat,thick:g.tray.stock[1],items}},meta},null,2)+'\n');
  fs.writeFileSync(path.join(opts.preview,'box-jig-qa.json'),JSON.stringify(meta,null,2)+'\n');
  return {parts,meta,svg};
}
const fill=(g,style)=>`<path d="${polys(g).map(p=>ring_d(p.exterior.coords)+p.interiors.map(i=>ring_d(i.coords)).join('')).join('')}" fill-rule="evenodd" ${style}/>`;
async function render(g,result,opts) {
  const {chromium}=require('playwright');
  const wood='fill="#eadcbb" stroke="#654522" stroke-width="0.15"';
    for(const [id,name,width] of [['box-base','box-jig-base',1000],['box-ramp','box-jig-insert',520]]) {
      const p=g.parts[id],flat=id==='box-ramp'?affinity.affine_transform(p.cut,[1,0,0,-1,0,0]):p.cut,b=flat.bounds,pad=3;
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width*(b[3]-b[1]+2*pad)/(b[2]-b[0]+2*pad)}" viewBox="${b[0]-pad} ${b[1]-pad} ${b[2]-b[0]+2*pad} ${b[3]-b[1]+2*pad}"><rect x="${b[0]-pad}" y="${b[1]-pad}" width="${b[2]-b[0]+2*pad}" height="${b[3]-b[1]+2*pad}" fill="#fffaf0"/>${fill(flat,wood)}</svg>`;
      const raster=require('child_process').spawnSync('/usr/bin/rsvg-convert',['--output',path.join(opts.preview,name+'.png')],{input:svg,encoding:'utf8'});
      assert.equal(raster.status,0,`rsvg-convert: ${raster.error||raster.stderr}`);
    }
  const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage({viewport:{width:1400,height:1100},deviceScaleFactor:1});
    const head='<html><body style="margin:20px;background:#fffaf0;color:#352719;font:18px Arial">';
    const shapes={},instances=[],O=g.O,t=g.t,svg=cut=>`<svg xmlns="http://www.w3.org/2000/svg">${cut_svg(cut)}</svg>`;
    shapes.base=svg(g.base);instances.push({shape:'base',x:0,y:0,z:-t,thick:t});
    // Match the page's unloaded assembly. A seated tray would require its real
    // dimensions and extra spring deflection, not the drawn-preload angle.
    shapes.insert=svg(g.insert);
    for(const {x,y,rot} of result.meta.stations)
      instances.push({shape:'insert',x,y,rot,z:0,vertical:true,flipV:true,thick:t});
    await page.setContent(head+'<h2>17-part box jig · unloaded assembly</h2><p>One integral spring base + sixteen ramp inserts. Centre supported; springs free below.</p><canvas id="assembly" style="width:1300px;height:920px"></canvas></body></html>');
    await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../lib/render3d.js'),'utf8')});
    await page.evaluate(({shapes,instances,O})=>{
      const R=Render3D,parts=Object.fromEntries(Object.entries(shapes).map(([id,s])=>[id,R.parsePart(s)]));
      const scene=new R.Scene(document.getElementById('assembly'),{plain:true,table:'#fffaf0',pitch:49,yaw:35,dist:1100,cx:O/2,cy:O/2,cz:10,view:345,dpr:1});
      scene.static=instances.map((i,n)=>({...i,part:parts[i.shape],id:n+1,mat:'birch',shadow:false}));
      scene.render();window.__jigScene=scene;
    },{shapes,instances,O});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:path.join(opts.preview,'box-jig-assembled.png'),fullPage:true});
  } finally {await browser.close();}
}
async function main(GAME_DIR, argv) {
  const opts=argumentsFor(argv, GAME_DIR);
  assert(!path.resolve(opts.preview).startsWith(path.resolve(opts.out,'parts')),'preview cannot be in parts');
  const tray=readTray(opts.input);
  require('./node_fonts.js')(K);
  const extraFile=path.join(GAME_DIR,'jigs.js');
  const extra=fs.existsSync(extraFile)?require(extraFile)(tray):null;
  if(extra){for(const k of ['parts','items','bounds','meta'])assert(extra[k]!==undefined,`jigs.js must return ${k}`);}
  const g=build(tray),m=mechanics(g),qa=check(g,m),result=output(g,m,qa,opts,extra);
  if(!opts.noRender)await render(g,result,opts);
  console.log(`JIG CHECK PASS: ${g.d.sheet.join(' x ')} mm; ${result.meta.partCount} parts (box ${1+g.stations.length}${extra?', extra '+extra.items.length:''}); kerf ${g.tray.kerf} in-file, machine OFF.`);
  console.log(`Pads ${g.centres.map(x=>x.toFixed(3)).join(', ')}; inset ${g.d.padInset} mm/side, plane span ${g.O-2*g.d.padInset} mm; height ${g.d.padLow}–${g.d.padHigh} mm; two ${g.d.barWidth} x ${g.d.barLength} mm bars/station; drawn preload twist ${(g.d.theta*180/Math.PI).toFixed(4)} deg.`);
  console.log(m.scope);
  console.log(`WORKING STRESS PASS at ${m.working.interferencePerSide} mm/side (${m.working.boxes.map(b=>`${b.name} ${b.boxSize} mm: ${b.interferencePerSide.toFixed(2)}`).join(', ')}); softer-design force targets ${m.working.forceTargetsSatisfied?'PASS':'NOT MET (see working cases)'}.`);
  for(const c of m.cases)console.log(JSON.stringify(c));
  console.log(`Wrote parts/jig-sheet.svg and jig.json; renders ${opts.preview}`);
}
module.exports={serializedFinished,seatedInsert,main,readTray,parameters,build,mechanics,check,pieceCheck,rotateSection,torsionJ};
mech.use(module.exports);
if(require.main===module)main(process.cwd(),process.argv.slice(2)).catch(e=>{console.error(e.stack);process.exitCode=1;});
