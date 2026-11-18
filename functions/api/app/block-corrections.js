import {correctConfirmedStages} from './stage-corrections.js';
// Corrección confirmada por el propietario del plano: I tiene 20 solares, L tiene 12.
export function canonicalBlock(feature){const n=Number(String(feature).replace('ar-',''));return n>=243&&n<=252||n>=304&&n<=313?'I':n>=361&&n<=372?'L':null;}
export function correctConfirmedBlocks(state){if(!state)return state;for(const l of state.lots||[]){if(l.residenceId!=='arrayan')continue;const b=canonicalBlock(l.sourceFeatureKey);if(b)l.block=b;}for(const r of state.residences||[]){if(r.id!=='arrayan')continue;for(const [key,record] of Object.entries(r.records||{})){const b=canonicalBlock(key);if(b)record.block=b;}for(const f of r.features||[]){const b=canonicalBlock(f.key);if(b)f.block=b;}}return correctConfirmedStages(state);}
