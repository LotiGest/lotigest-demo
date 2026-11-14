import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../prueba-diseno-v08.html', import.meta.url), 'utf8');
const env = {};
function source(start, end) {
  return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
}
vm.runInNewContext(source('function validateResidentialMap(', 'async function importResidentialMap(') +
  source('function calculatedLotArea(', 'function updateLotAreaForm('), env);

const residence = { id: 'arrayan', builtin: 'arrayan', records: { prior: { lotId: 'AR-BA-01', status: 'sold' } } };
const lots = [{ id: 'AR-BA-01', residenceId: 'arrayan', block: 'A', sourceNumber: '1', status: 'sold', area: 165 }];
const feature = { key: 'prior', number: '01', block: 'A', points: [[0, 0], [4, 0], [4, 4]], label: [2, 2] };
test('el PDF admite solares y locales revisados sin sobrescribir terrenos comprados', () => {
  const original = JSON.stringify(lots);
  const plan = env.planAnnexLots('E2-A-01;Bloque A;01;Solar;12;16;\nE2-C-01;E2-C;01;Local;11;15;\nE2-C-02;E2-C;02;Solar;;;172.25',
    residence, lots, [feature], 'etapa-2.pdf');
  assert.equal(plan.skipped, 1);
  assert.equal(plan.added.length, 2);
  assert.equal(plan.added[0].type, 'commercial');
  assert.equal(plan.added[0].area, 165);
  assert.equal(plan.added[1].area, 172.25);
  assert.equal(JSON.stringify(lots), original);
  assert.throws(() => env.planAnnexLots('E2-X;B;16;Solar;1;;', residence, lots, [feature], 'plano.pdf'), /Fila 1/);
  assert.equal(env.planAnnexLots('E2-C-01;E2-C;01;Local;11;15;', residence, [...lots, ...plan.added], [feature], 'plano.pdf').skipped, 1);
});
test('anexar un JSON mantiene trazados anteriores y conserva medidas de los nuevos', () => {
  const data = env.validateResidentialMap({format: 'residential-map-v1', viewBox: [0,0,10,10], features: [
    { ...feature, key: 'alias' },
    { ...feature, key: 'nuevo', block: 'E2-A', type: 'commercial', initial: 'sold', measurements: [11, 15], areaFromDimensions: 165 },
  ]});
  const merged = env.appendTracedMap(residence, data, lots, [feature]);
  assert.equal(merged.builtin, 'arrayan');
  assert.equal(merged.records.prior.status, 'sold');
  assert.equal(merged.features.length, 1);
  assert.equal(merged.features[0].initial, 'available');
  assert.equal(merged.features[0].areaFromDimensions, 165);
  assert.equal(merged.features[0].measurements.join(','), '11,15');
  assert.equal(env.appendTracedMap(merged, data, lots, [feature, ...merged.features]), null);
});
