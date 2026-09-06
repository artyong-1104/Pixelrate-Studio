import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {extractInlineFunction} from './lib/extract-inline-function.mjs';
const html=fs.readFileSync(new URL('../pixelate_studio.html',import.meta.url),'utf8');
const fn=vm.runInNewContext('('+extractInlineFunction(html,'validatePaletteFileResult')+')');
assert.throws(()=>fn({hexes:['#000000','#FFFFFF'],errors:['Line 3 invalid']}),/Line 3/);
for(const n of [0,1,257]) assert.throws(()=>fn({hexes:Array(n).fill('#000000'),errors:[]}),/2~256/);
for(const n of [2,256]) {const p={hexes:Array(n).fill('#000000'),errors:[]};assert.equal(fn(p),p);}
console.log('Palette file boundary: malformed and out-of-range imports rejected before UI mutation PASS');
