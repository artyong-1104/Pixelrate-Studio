import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../pixelate_studio.html',import.meta.url),'utf8');
const start=html.indexOf('  const downs = measurePerfStage');
const code=html.slice(start,html.indexOf('  assertProcessingJobActive(job);',start))+'\nthis.result=downs;';
for(const scaleMode of ['square','factor','preserve-sheet','grid-repair','original']){
 const image={width:24,height:32};
 const ctx={scaleMode,uploadedFiles:[{name:'sprite.png',img:image,addedIndex:1}],job:{},size:16,method:'box',representativeColor:'mean-srgb',alphaThreshold:10,lineAwareSettings:{},factor:2,factorFrameMode:'whole',factorFrameWidth:16,factorFrameHeight:16,frameWidth:16,frameHeight:16,pixelBlockSize:2,gridFrameMode:'whole',gridFrameWidth:16,gridFrameHeight:16,appliedGrid:{},measurePerfStage:(_j,_s,fn)=>fn(),boxDownscale:()=>({}),exactFactorDownscale:()=>({}),preserveSheetDownscale:()=>({}),gridRepairDownscale:()=>({}),getRawPixels:()=>({data:[],width:24,height:32}),createLineAwareContext:()=>({}),applyLineAwareIdentity:x=>x,getLineAwareMetadata:()=>({})};
 vm.runInNewContext(code,ctx);assert.equal(ctx.result[0].img,image,scaleMode+' must retain actual source reference');
}
console.log('Production downscale result source reference preserved in all five modes PASS');
