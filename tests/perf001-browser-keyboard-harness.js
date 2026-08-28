'use strict';

const statusEl = document.getElementById('harnessStatus');
const appFrame = document.getElementById('appFrame');

function dispatchValue(element, value, eventType='change'){
  element.value = value;
  element.dispatchEvent(new appFrame.contentWindow.Event(eventType, { bubbles:true }));
}

async function waitFor(predicate, timeoutMs=15000){
  const startedAt = performance.now();
  while(performance.now() - startedAt < timeoutMs){
    if(predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('PERF-001 keyboard harness setup timeout');
}

appFrame.addEventListener('load', async () => {
  try {
    const doc = appFrame.contentDocument;
    dispatchValue(doc.getElementById('scaleMode'), 'original');
    dispatchValue(doc.getElementById('paletteMode'), 'auto');
    dispatchValue(doc.getElementById('cleanNum'), '20', 'input');

    const response = await fetch('../pixelizer-codex-research/evidence/perf-001/browser-fixtures/perf-2048x2048.png');
    if(!response.ok) throw new Error(`fixture request failed: ${response.status}`);
    const blob = await response.blob();
    const file = new File([blob], 'perf-2048x2048.png', { type:'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = doc.getElementById('fileInput');
    input.files = transfer.files;
    input.dispatchEvent(new appFrame.contentWindow.Event('change', { bubbles:true }));
    await waitFor(() => !doc.getElementById('runBtn').disabled);
    statusEl.textContent = 'READY — production app, QLT 4M fixture, cleanup 20 passes';
  } catch(error){
    statusEl.textContent = `FAILED — ${error instanceof Error ? error.message : String(error)}`;
  }
});
