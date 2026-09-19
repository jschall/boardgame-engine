#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* manual/build.js (boardgame-engine): the print rulebook from the game's manual/manual.html: a press PDF (180 x 180 mm trim, 3 mm bleed, crop marks,
   pages in reading order) and a US Letter fold-and-staple booklet (imposed, 135 mm finished), with a layout audit in manual/qa/layout.json.
   The page count is whatever manual.html lays out; it must be a multiple of four for the booklet. node engine/bin/bg.js manual runs it. */
const fs=require('fs'),path=require('path');
const {PDFDocument,rgb}=require('pdf-lib');
const ENGINE=path.join(__dirname,'..'),mm=n=>n*72/25.4;
const launch=()=>require('../checks/browser.js').launchPlain();
async function main(GAME_DIR){
 const ROOT=path.join(GAME_DIR,'manual'),CFG=JSON.parse(fs.readFileSync(path.join(GAME_DIR,'game.json'),'utf8')),SLUG=CFG.slug,TITLE=CFG.name;
 for(const d of ['output','tmp/pdfs','qa'])fs.mkdirSync(path.join(ROOT,d),{recursive:true});
 const browser=await launch();
 const pg=await browser.newPage();await pg.goto('file://'+path.join(ROOT,'manual.html'));await pg.evaluate(()=>document.fonts.ready);await pg.emulateMedia({media:'print'});
 const audit=await pg.evaluate(()=>({pageCount:window.__manualPageCount,missingImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),overflow:[...document.querySelectorAll('.page')].flatMap((p,i)=>{const foot=p.querySelector('.footer').getBoundingClientRect(),pr=p.getBoundingClientRect(),body=p.querySelector('.body').getBoundingClientRect();return body.bottom>foot.top-5?[{page:i+1,overflowPx:body.bottom-(foot.top-5)}]:[]}),minBodyPt:Math.min(...[...document.querySelectorAll('p,li,td')].filter(e=>!e.closest('figcaption,.routes')&&!e.classList.contains('caption')).map(e=>parseFloat(getComputedStyle(e).fontSize)*.75))}));
 Object.assign(audit,await pg.evaluate(require(path.join(ENGINE,'manual','review-layout.js'))));
 if(fs.existsSync(path.join(ROOT,'review-layout.js')))Object.assign(audit,await pg.evaluate(require(path.join(ROOT,'review-layout.js'))));   // the game's own layout evidence, merged
 const paper=await pg.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
 if(!/^#[0-9a-f]{6}$/i.test(paper))throw Error('Expected a six-digit paper colour');
 const paperRgb=paper.slice(1).match(/../g).map(v=>parseInt(v,16)/255);
 fs.writeFileSync(path.join(ROOT,'qa/layout.json'),JSON.stringify(audit,null,2));
 await pg.pdf({path:path.join(ROOT,'tmp/pdfs/chromium.pdf'),printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
 const N=audit.pageCount;if(!(Number.isInteger(N)&&N>=4&&N%4===0))throw Error(`the manual lays out ${N} pages; the booklet needs a multiple of four`);
 if((CFG.manual&&CFG.manual.format)!=='letter')await pg.goto('file://'+path.join(ENGINE,'manual','imposition-guide.html'));
 if((CFG.manual&&CFG.manual.format)!=='letter')await pg.evaluate(o=>window.makeGuides(o),{pageCount:N,sheetCount:N/4,size:135,bleed:3});await pg.evaluate(()=>document.fonts.ready);
 await pg.pdf({path:path.join(ROOT,'tmp/pdfs/guides.pdf'),printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});await browser.close();
 const raw=fs.readFileSync(path.join(ROOT,'tmp/pdfs/chromium.pdf'));
 const press=await PDFDocument.load(raw),P=press.getPages();if(P.length!==N)throw Error(`Expected ${N} pages, got ${P.length}`);
 /* the US Letter format (game.json manual.format 'letter'): the pages as the game's CSS printed them, no bleed or crop marks; the booklet is two
    Letter pages a side on Tabloid landscape, saddle-stitched (TUMBLER's rulebook was laid out for Letter) */
 if((CFG.manual&&CFG.manual.format)==='letter'){
  for(const p of P){if(Math.abs(p.getWidth()-612)>1||Math.abs(p.getHeight()-792)>1)throw Error(`a page prints at ${p.getWidth().toFixed(0)} x ${p.getHeight().toFixed(0)} pt, not US Letter: set @page { size: Letter }`);p.setTrimBox(0,0,612,792);p.setBleedBox(0,0,612,792);}
  press.setTitle(`${TITLE} · Rules · US Letter edition`);press.setSubject(`${N} pages; US Letter`);press.setCreator('HTML/CSS via Playwright Chromium; PDF boxes and imposition via pdf-lib');
  await fs.promises.writeFile(path.join(ROOT,`output/${SLUG}-print.pdf`),await press.save());
  const booklet=await PDFDocument.create(),src=await PDFDocument.load(raw),order=[];
  for(let i=0;i<N/4;i++)for(const pair of [[N-2*i,1+2*i],[2+2*i,N-1-2*i]]){order.push(pair);const pg=booklet.addPage([1224,792]);for(let j=0;j<2;j++){const e=await booklet.embedPage(src.getPage(pair[j]-1));pg.drawPage(e,{x:j*612,y:0,width:612,height:792});}}
  booklet.setTitle(`${TITLE} · Tabloid booklet · duplex short-edge`);booklet.setSubject(`Print at actual size on 11 x 17 in landscape, duplex short-edge, fold and staple: ${N/4} sheets, a US Letter booklet.`);
  await fs.promises.writeFile(path.join(ROOT,`output/${SLUG}-letter-booklet.pdf`),await booklet.save());
  fs.writeFileSync(path.join(ROOT,'qa/imposition.json'),JSON.stringify({sheet:'Tabloid landscape',duplex:'short-edge',printScale:'100%',finishedSizeMm:[215.9,279.4],bleedMm:0,paperColor:paper,sheets:order},null,2));
  console.log(JSON.stringify(audit,null,2));console.log('Built the US Letter press PDF and the Tabloid booklet.');
  const rows=Object.entries(audit).filter(([k,v])=>/Rows$/.test(k)&&Array.isArray(v)).flatMap(([,v])=>v);
  if(audit.missingImages.length||audit.overflow.length||audit.orphanCaptions.length||audit.orphanParagraphs.length||rows.some(row=>row.bottomDifferenceMm>.01))throw Error('the manual layout audit failed (manual/qa/layout.json)');
  return;
 }
 for(const p of P){
  p.setMediaBox(0,0,mm(192),mm(192));p.setTrimBox(mm(6),mm(6),mm(180),mm(180));p.setBleedBox(mm(3),mm(3),mm(186),mm(186));p.setCropBox(0,0,mm(192),mm(192));
  // Chromium rounds painted CSS edges. Paint the margins in PDF coordinates,
  // through the BleedBox plus 0.25 mm, while leaving the entire trim untouched.
  const t=p.getTrimBox(),b=p.getBleedBox(),overlap=mm(.25);
  const left=b.x-overlap,bottom=b.y-overlap,right=b.x+b.width+overlap,top=b.y+b.height+overlap;
  for(const [x,y,width,height] of [
   [left,bottom,right-left,t.y-bottom],
   [left,t.y+t.height,right-left,top-t.y-t.height],
   [left,t.y,t.x-left,t.height],
   [t.x+t.width,t.y,right-t.x-t.width,t.height]
  ])p.drawRectangle({x,y,width,height,color:rgb(...paperRgb)});
  for(const x of [6,186])for(const y of [6,186]){
   p.drawLine({start:{x:mm(x),y:mm(y<96?0.5:189.5)},end:{x:mm(x),y:mm(y<96?2.5:191.5)},thickness:.3,color:rgb(0,0,0)});
   p.drawLine({start:{x:mm(x<96?.5:189.5),y:mm(y)},end:{x:mm(x<96?2.5:191.5),y:mm(y)},thickness:.3,color:rgb(0,0,0)});
  }
 }
 press.setTitle(`${TITLE} · Rules · 180 mm print edition`);press.setSubject(`${N} pages; 180 × 180 mm trim; 3 mm bleed; crop marks`);press.setCreator('HTML/CSS via Playwright Chromium; PDF boxes and imposition via pdf-lib');
 await fs.promises.writeFile(path.join(ROOT,`output/${SLUG}-print.pdf`),await press.save());
 const trim=await PDFDocument.create(),booklet=await PDFDocument.create(),src=await PDFDocument.load(raw),guides=await PDFDocument.load(fs.readFileSync(path.join(ROOT,'tmp/pdfs/guides.pdf'))),order=[];
 const clip={left:mm(6),bottom:mm(6),right:mm(186),top:mm(186)};
 for(const p of src.getPages()){const e=await trim.embedPage(p,clip),page=trim.addPage([mm(180),mm(180)]);page.drawPage(e,{x:0,y:0,width:mm(180),height:mm(180)});}
 for(let i=0;i<P.length/4;i++)for(const pair of [[P.length-2*i,1+2*i],[2+2*i,P.length-1-2*i]]){
  order.push(pair);
  const pg=booklet.addPage([792,612]),w=mm(135),y=(612-w)/2,bleed=mm(3);
  const guide=await booklet.embedPage(guides.getPage(order.length-1));
  pg.drawPage(guide,{x:0,y:0,width:792,height:612});
  // All page edges are the same solid paper colour. Extend it at the final
  // physical scale: reducing the source's 3 mm bleed would leave only 2.25 mm.
  pg.drawRectangle({x:396-w-bleed,y:y-bleed,width:2*w+2*bleed,height:w+2*bleed,color:rgb(...paperRgb)});
  for(let j=0;j<2;j++){const e=await booklet.embedPage(src.getPage(pair[j]-1),clip);pg.drawPage(e,{x:396+(j-1)*w,y,width:w,height:w});}
  for(const x of [396-w,396+w])for(const yy of [y,y+w]){pg.drawLine({start:{x:x+(x<396?-mm(3.5):mm(1)),y:yy},end:{x:x+(x<396?-mm(1):mm(3.5)),y:yy},thickness:.3,color:rgb(0,0,0)});}
  for(const yy of [y,y+w])for(const x of [mm(20),792-mm(20)]){const d=yy<306?-1:1;pg.drawLine({start:{x,y:yy+d*mm(4)},end:{x,y:yy},thickness:.4,color:rgb(0,0,0)});for(const sign of [-1,1])pg.drawLine({start:{x:x+sign*mm(1),y:yy+d*mm(2)},end:{x,y:yy},thickness:.4,color:rgb(0,0,0)});}
  for(const yy of [y,y+w]){pg.drawLine({start:{x:396,y:yy+(yy<306?-mm(4):mm(1))},end:{x:396,y:yy+(yy<306?-mm(1):mm(4))},thickness:.3,color:rgb(0,0,0)});}
 }
 booklet.setTitle(`${TITLE} · US Letter booklet · duplex short-edge`);booklet.setSubject(`Print at actual size, landscape US Letter, duplex short-edge. ${N/4} sheets, 135 mm finished booklet.`);
 await fs.promises.writeFile(path.join(ROOT,`output/${SLUG}-letter-booklet.pdf`),await booklet.save());await fs.promises.writeFile(path.join(ROOT,'tmp/pdfs/trim.pdf'),await trim.save());
 fs.writeFileSync(path.join(ROOT,'qa/imposition.json'),JSON.stringify({sheet:'US Letter landscape',duplex:'short-edge',printScale:'100%',finishedSizeMm:[135,135],bleedMm:3,paperColor:paper,spreadTrimMm:{left:4.7,right:274.7,top:40.45,bottom:175.45},spreadBleedMm:{left:1.7,right:277.7,top:37.45,bottom:178.45},contentScale:.75,bodyPt:12.2*.75,captionPt:10.2*.75,sideOrder:order},null,2));
 console.log(JSON.stringify(audit,null,2));console.log('Built press PDF and US Letter booklet.');
 const rows=Object.entries(audit).filter(([k,v])=>/Rows$/.test(k)&&Array.isArray(v)).flatMap(([,v])=>v);
 const bad=audit.missingImages.length||audit.overflow.length||audit.orphanCaptions.length||audit.orphanParagraphs.length||rows.some(row=>row.bottomDifferenceMm>.01);
 if(bad)throw Error('the manual layout audit failed (manual/qa/layout.json)');
}
module.exports=main;
if(require.main===module)main(process.cwd()).catch(e=>{console.error(e);process.exit(1)});
