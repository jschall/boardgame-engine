/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* review-layout.js (boardgame-engine): DOM evidence of the layout defects independent reviews keep catching in rulebooks: pages with a worked example or a
   safety warning, captions and paragraphs ending in a one-word line (orphans). Runs in the manual page; manual/build.js records it in qa/layout.json. */
module.exports=()=>{
 const pages=[...document.querySelectorAll('.sheet')];
 const kicker=p=>{const k=p.querySelector('.kicker');return k?k.textContent:''};
 const captionLines=el=>{
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),lines=new Map();
  while(walker.nextNode()){
   const node=walker.currentNode;
   for(const word of node.data.matchAll(/\S+/g)){
    const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);
    const box=range.getBoundingClientRect(),y=Math.round(box.top);
    if(!lines.has(y))lines.set(y,[]);lines.get(y).push(word[0]);
   }
  }
  return [...lines.values()].map(words=>words.join(' '));
 };
 return {
  examplePages:pages.flatMap((p,i)=>/worked example/i.test(kicker(p))?[i+1]:[]),
  warningPages:pages.flatMap((p,i)=>p.querySelector('.safety-warning')?[i+1]:[]),
  orphanCaptions:pages.flatMap((p,i)=>[...p.querySelectorAll('figcaption')].flatMap(c=>{
   const lines=captionLines(c),last=lines.at(-1);
   const br=[...c.querySelectorAll('br')].at(-1),tail=document.createRange();
   // Intentional labels such as "Circle" below a colony name are not wrapped widows.
   if(br){tail.setStartAfter(br);tail.setEnd(c,c.childNodes.length);if(tail.toString().trim()===last)return [];}
   return lines.length>1&&last.split(/\s+/).length===1?[{page:i+1,lines}]:[];
  })),
  orphanParagraphs:pages.flatMap((p,i)=>[...p.querySelectorAll('.body p,.body li,.body td,.body .note:not(:has(p))')].flatMap(c=>{
   // Narrow table labels such as "Royal jelly" deliberately wrap as two words.
   if(c.matches('td:first-child'))return [];
   if(c.closest('figure,.routes,.safety-warning')||c.querySelector('br'))return [];
   const lines=captionLines(c),last=lines.at(-1);
   return lines.length>1&&last.split(/\s+/).length===1?[{page:i+1,lines}]:[];
  }))
 };
};
