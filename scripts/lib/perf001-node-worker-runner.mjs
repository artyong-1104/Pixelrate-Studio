import { parentPort } from 'node:worker_threads';

if (!parentPort) throw new Error('PERF-001 runner requires worker_threads');

const listeners = new Map();
globalThis.self = {
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  postMessage(message, transfer = []) {
    parentPort.postMessage(message, transfer);
  }
};

parentPort.on('message', data => {
  const handler = listeners.get('message');
  if (handler) handler({ data });
});

await import('../../pixelate-worker.js');
