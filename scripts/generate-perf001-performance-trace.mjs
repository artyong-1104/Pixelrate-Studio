import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(root, 'pixelizer-codex-research', 'evidence', 'perf-001');
const browserQaPath = path.join(evidenceDir, 'browser-qa.json');
const outputPath = path.join(evidenceDir, 'performance-trace.json');
const browserQa = JSON.parse(fs.readFileSync(browserQaPath, 'utf8'));
const stageOrder = ['decode', 'downscale', 'grid', 'palette', 'map', 'cleanup', 'outline', 'export'];
const traceEvents = [];

traceEvents.push(
  { name:'process_name', ph:'M', pid:1, tid:0, args:{ name:'Pixelate Studio PERF-001 browser runs' } },
  { name:'thread_name', ph:'M', pid:1, tid:1, args:{ name:'256K original pipeline' } },
  { name:'thread_name', ph:'M', pid:1, tid:2, args:{ name:'1M original pipeline' } },
  { name:'thread_name', ph:'M', pid:1, tid:3, args:{ name:'4M original pipeline' } }
);

for(const [runIndex, fixtureId] of ['256K', '1M', '4M'].entries()){
  const run = browserQa.completionRuns[fixtureId];
  const fixture = browserQa.fixtures[fixtureId];
  const tid = runIndex + 1;
  const baseTs = runIndex * 10_000_000;
  let stageTs = baseTs;
  traceEvents.push({
    name:'pipeline', cat:'PERF-001', ph:'X', pid:1, tid,
    ts:baseTs, dur:Math.round(run.wallTimeMs * 1000),
    args:{
      fixture:fixtureId,
      pixels:fixture.pixels,
      workerUsed:run.workerUsed,
      resultCount:run.resultCount,
      maxWorkerChunkMs:run.maxWorkerChunkMs,
      maxInputDelayMs:run.maxInputDelayMs,
      longTaskCount:run.longTaskCount,
      estimatedPeakBytes:run.estimatedPeakBytes
    }
  });
  for(const stage of stageOrder){
    const durationMs = run.stagesMs[stage];
    traceEvents.push({
      name:stage, cat:'PERF-001.stage', ph:'X', pid:1, tid,
      ts:stageTs, dur:Math.round(durationMs * 1000),
      args:{ fixture:fixtureId, samples:durationMs > 0 ? 1 : 0 }
    });
    stageTs += Math.round(durationMs * 1000);
  }
  traceEvents.push({
    name:'responsiveness', cat:'PERF-001.metric', ph:'i', s:'t', pid:1, tid,
    ts:baseTs + Math.round(run.wallTimeMs * 1000),
    args:{ maxWorkerChunkMs:run.maxWorkerChunkMs, maxInputDelayMs:run.maxInputDelayMs, longTaskCount:run.longTaskCount }
  });
}

const trace = {
  traceFormat:'Chrome Trace Event Format',
  schemaVersion:1,
  itemId:'PERF-001',
  runDateKst:browserQa.runDateKst,
  source:{
    file:'browser-qa.json',
    applicationSha256:browserQa.applicationSha256,
    workerSha256:browserQa.workerSha256,
    fixtureProvenance:browserQa.fixtureProvenance,
    note:'Trace events are generated from the measured one-run browser stage totals; benchmark warm medians remain in benchmark-report.json.'
  },
  displayTimeUnit:'ms',
  traceEvents
};

fs.writeFileSync(outputPath, `${JSON.stringify(trace, null, 2)}\n`);
console.log(JSON.stringify({
  output:path.relative(root, outputPath),
  events:traceEvents.length,
  runs:Object.fromEntries(['256K', '1M', '4M'].map(id => [id, browserQa.completionRuns[id].wallTimeMs]))
}, null, 2));
