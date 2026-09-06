'use strict';
const frame=document.getElementById('app');
const statusEl=document.getElementById('status');
const reportEl=document.getElementById('report');
let report={items:[]};
const w=()=>frame.contentWindow;
const d=()=>frame.contentDocument;
const el=id=>d().getElementById(id);
const check=(value,message)=>{if(!value)throw new Error(message);};
const wait=async(predicate,timeoutMs=120000)=>{const started=performance.now();while(!predicate()){if(performance.now()-started>timeoutMs)throw new Error('timeout');await new Promise(resolve=>setTimeout(resolve,25));}};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
const canvasPixels=canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
const canvasHash=async canvas=>sha(canvasPixels(canvas));

function set(id,value){
  const node=el(id);
  check(node,`missing control ${id}`);
  if(node.type==='checkbox'||node.type==='radio')node.checked=Boolean(value);
  else node.value=String(value);
  node.dispatchEvent(new (w().Event)('input',{bubbles:true}));
  node.dispatchEvent(new (w().Event)('change',{bubbles:true}));
}

async function fresh(item){
  statusEl.textContent=`RUNNING ${item}`;
  frame.src=`../pixelate_studio.html?qa=current-hash-${item}-${Date.now()}`;
  await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
  await wait(()=>typeof w().processAll==='function');
}

async function loadFiles(entries){
  const files=[];
  for(const entry of entries){
    let blob;
    if(entry.path){
      const response=await fetch(`../pixelizer-codex-research/evidence/${entry.path}`);
      check(response.ok,`fixture fetch ${entry.path}`);
      blob=await response.blob();
    }else blob=entry.blob;
    files.push(new (w().File)([blob],entry.name,{type:blob.type||'image/png'}));
  }
  await w().handleFiles(files);
  await wait(()=>!el('runBtn').disabled||el('scaleMode').value==='grid-repair');
}

async function process(){
  await w().processAll();
  const perf=JSON.parse(el('status').dataset.perfReport||'{}');
  check(perf.outcome==='completed',`processing outcome ${perf.outcome}`);
  return perf;
}

async function captureDownload(button){
  let captured;
  const original=w().downloadBlob;
  w().downloadBlob=(blob,name)=>{captured={blob,name};};
  try{button.click();await wait(()=>captured);return captured;}finally{w().downloadBlob=original;}
}

async function resultJson(index=0){
  const buttons=Array.from(d().querySelectorAll('.card button')).filter(node=>node.textContent.trim()==='JSON');
  check(buttons[index],`missing result JSON ${index}`);
  const captured=await captureDownload(buttons[index]);
  return JSON.parse(await captured.blob.text());
}

function generatedPng(kind,size=64,height=size){
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=height;
  const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(size,height);
  for(let y=0;y<height;y++)for(let x=0;x<size;x++){
    const i=(y*size+x)*4;let r=0,g=0,b=0,a=255;
    if(kind==='checker'){const v=((x>>3)+(y>>3))%2?235:25;r=g=b=v;}
    if(kind==='grid'){const light=(Math.floor(x/8)+Math.floor(y/8))%2===0;r=light?220:36;g=light?184:48;b=light?92:170;}
    if(kind==='frame-a'){r=x<size/2?255:20;g=y<size/2?80:210;b=40;}
    if(kind==='frame-b'){r=y<size/2?30:230;g=x<size/2?210:40;b=180;}
    if(kind==='alpha'){r=220;g=70;b=40;a=[0,64,128,255][Math.floor(x/(size/4))];}
    if(kind==='gradient'){const v=Math.round(x/(size-1)*255);r=g=b=v;}
    pixels.data.set([r,g,b,a],i);
  }
  ctx.putImageData(pixels,0,0);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
}

async function item(id,run){
  try{
    const measurements=await run();
    report.items.push({id,status:'PASS',measurements});
  }catch(error){
    report.items.push({id,status:'FAIL',error:String(error.stack||error)});
  }
  reportEl.textContent=JSON.stringify(report,null,2);
}

document.getElementById('run').onclick=async()=>{
  report={schemaVersion:1,runDateKst:'2026-09-06',items:[]};
  const htmlBytes=await(await fetch('../pixelate_studio.html')).arrayBuffer();
  const workerBytes=await(await fetch('../pixelate-worker.js')).arrayBuffer();
  report.applicationSha256=await sha(htmlBytes);
  report.workerSha256=await sha(workerBytes);
  report.browser=navigator.userAgent;
  report.url=location.href;

  await item('QLT-001',async()=>{
    await fresh('qlt');
    await loadFiles([{name:'qlt-checker.png',blob:await generatedPng('checker')}]);
    set('scaleMode','square');set('size',16);set('paletteMode','auto');set('colorsNum',16);set('cleanEnabled',false);
    const perf=await process();const canvas=d().querySelector('.preview canvas');
    check(canvas?.width===16&&canvas?.height===16,'QLT result dimensions');
    const json=await resultJson();
    return {fixture:'generated 8px checker',dimensions:[canvas.width,canvas.height],rgbaSha256:await canvasHash(canvas),mode:json.processing.mode,workerUsed:perf.workerUsed};
  });

  await item('ANI-001',async()=>{
    await fresh('ani');
    await loadFiles([{name:'walk_01.png',blob:await generatedPng('frame-a',16)},{name:'walk_02.png',blob:await generatedPng('frame-b',16)}]);
    set('scaleMode','original');set('paletteMode','unlimited');set('cleanEnabled',false);await process();
    check(el('animReviewBtn').style.display!=='none','animation button visible');
    w().openAnimModal(0);await wait(()=>el('animModal').classList.contains('open'));
    const before=el('animFrameLabel').textContent;el('animPlayPauseBtn').click();el('animNextBtn').click();
    const after=el('animFrameLabel').textContent;el('animZoom8x').click();
    check(before==='1 / 2'&&after==='2 / 2','animation frame order');
    check(el('animZoom8x').getAttribute('aria-pressed')==='true','animation 8x');
    const sourceOptions=el('animSourceSelect').options.length;w().closeAnimModal();
    check(!el('animModal').classList.contains('open'),'animation close');
    return {before,after,sourceOptions,zoom8:true,closed:true};
  });

  await item('GRID-001',async()=>{
    await fresh('grid');
    await loadFiles([{name:'grid-8px.png',blob:await generatedPng('grid',192,160)}]);
    set('showExperimentalFeatures',true);set('scaleMode','grid-repair');
    await w().runGridAnalysis();
    const analysis=el('gridAnalysisResult').textContent;
    check(/X 8px \/ offset 0 · Y 8px \/ offset 0/.test(analysis),`8x8 grid detected: ${analysis}`);
    check(!el('gridApplyBtn').disabled,'grid apply enabled');el('gridApplyBtn').click();
    const perf=await process();const json=await resultJson();
    check(json.processing.mode==='grid-repair','grid metadata mode');
    return {analysis,size:[json.processing.grid.sizeX,json.processing.grid.sizeY],phase:[json.processing.grid.phaseX,json.processing.grid.phaseY],source:json.processing.grid.source,maxInputDelayMs:perf.maxInputDelayMs};
  });

  await item('ALP-002',async()=>{
    await fresh('alp002');
    await loadFiles([{name:'alpha-gradient.png',blob:await generatedPng('alpha',16)}]);
    set('scaleMode','original');set('paletteMode','unlimited');set('cleanEnabled',false);set('alphaModeCoverage',true);
    await process();let canvas=d().querySelector('.preview canvas');const coverage=Array.from(canvasPixels(canvas)).filter((v,i)=>i%4===3&&v>0&&v<255).length;
    const coverageHash=await canvasHash(canvas);const coverageJson=await resultJson();
    check(coverage>0&&Array.isArray(coverageJson.alpha),'coverage alpha retained');
    set('alphaModeBinary',true);await process();canvas=d().querySelector('.preview canvas');
    const alphas=Array.from(canvasPixels(canvas)).filter((_,i)=>i%4===3);check(alphas.every(v=>v===0||v===255),'binary alpha only');
    const binaryHash=await canvasHash(canvas);check(binaryHash!==coverageHash,'alpha policies differ');
    return {coveragePartialPixels:coverage,coverageHash,binaryHash,binaryOnly:true};
  });

  await item('CELL-001',async()=>{
    await fresh('cell');
    await loadFiles([{name:'eye-highlight.png',path:'cell-001/fixture-eye-highlight.png'}]);
    set('showExperimentalFeatures',true);set('representativeColor','center');set('scaleMode','square');set('size',16);set('paletteMode','unlimited');set('cleanEnabled',false);
    await process();const json=await resultJson();
    check(json.processing.representativeColor==='center','center metadata');
    check(el('representativeColorWarning').style.display!=='none','candidate warning');
    return {representativeColor:json.processing.representativeColor,warning:el('representativeColorWarning').textContent,resultText:d().querySelector('.card .meta').textContent};
  });

  await item('PAL-002',async()=>{
    await fresh('pal002');
    await loadFiles([{name:'palette_01.png',blob:await generatedPng('frame-a',32)},{name:'palette_02.png',blob:await generatedPng('frame-b',32)}]);
    set('showExperimentalFeatures',true);set('scaleMode','original');set('paletteMode','auto');set('colorsNum',16);set('shared',true);set('paletteAlgorithm','kmeans-oklab');set('paletteSampling','image-balanced');set('cleanEnabled',false);
    await process();const json=await resultJson();const meta=json.processing.palette;
    check(meta.algorithm==='kmeans-oklab'&&meta.sampling==='image-balanced','palette experiment metadata');
    return {algorithm:meta.algorithm,sampling:meta.sampling,distance:meta.distance,experimental:meta.experimental,error:meta.error};
  });

  await item('DIT-001',async()=>{
    await fresh('dit');
    await loadFiles([{name:'gradient.png',blob:await generatedPng('gradient')}]);
    set('showExperimentalFeatures',true);set('scaleMode','original');set('paletteMode','auto');set('colorsNum',4);set('cleanEnabled',false);set('ditherMode','off');
    await process();let canvas=d().querySelector('.preview canvas');const offHash=await canvasHash(canvas);
    set('ditherMode','bayer4');set('ditherStrengthNum',75);await process();canvas=d().querySelector('.preview canvas');
    const onHash=await canvasHash(canvas);const json=await resultJson();
    check(json.processing.dither.mode==='bayer4'&&json.processing.dither.strength===75,'dither metadata');check(onHash!==offHash,'dither changes gradient');
    return {mode:json.processing.dither.mode,strength:json.processing.dither.strength,origin:json.processing.dither.origin,offHash,onHash};
  });

  await item('EDGE-001',async()=>{
    await fresh('edge');
    await loadFiles([{name:'small-face.png',path:'edge-001/fixture-small-face.png'}]);
    set('showExperimentalFeatures',true);set('lineAwareEnabled',true);set('seloutEnabled',true);set('scaleMode','square');set('size',16);set('paletteMode','unlimited');set('cleanEnabled',false);
    await process();const json=await resultJson();const detail=json.processing.detailPreservation;
    check(detail.lineAware.enabled&&detail.selout.enabled,'edge experiments enabled');
    return {
      lineAware:{enabled:detail.lineAware.enabled,candidatePixels:detail.lineAware.candidatePixels,coveredCells:detail.lineAware.coveredCells},
      selout:{enabled:detail.selout.enabled,pixelCount:detail.selout.pixelCount},
      resultText:d().querySelector('.card .meta').textContent
    };
  });

  report.consoleCapture='Collected by the browser controller after completion.';
  report.status=report.items.every(entry=>entry.status==='PASS')?'PASS':'FAIL';
  report.finishedAt=new Date().toISOString();
  statusEl.textContent=report.status;
  reportEl.textContent=JSON.stringify(report,null,2);
};
