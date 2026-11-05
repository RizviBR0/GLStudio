import { cloudCompilerHealth } from '../server/cloud-compiler.js';

export default {
  fetch() { return Response.json(cloudCompilerHealth(), { headers: { 'Cache-Control': 'no-store' } }); },
};
