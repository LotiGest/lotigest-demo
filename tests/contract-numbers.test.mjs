import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureContractNumbers} from '../contract-numbers.mjs';
test('primero registrado recibe CM-0001 sin alterar ids, vínculos ni fecha del contrato',()=>{
 const state={contractTexts:[{id:'nuevo',clientId:'B',saleId:'V2',createdAt:'2026-11-25T10:00:00Z',structured:{date:'2024-01-01'}},{id:'primero',clientId:'A',saleId:'V1',createdAt:'2026-11-20T10:00:00Z'}]};
 const before=structuredClone(state);ensureContractNumbers(state);
 assert.deepEqual(state.contractTexts.map(d=>d.number),['CM-0002','CM-0001']);
 assert.deepEqual(state.contractTexts.map(({number,...d})=>d),before.contractTexts);
 const assigned=structuredClone(state);ensureContractNumbers(state);assert.deepEqual(state,assigned);
});
test('edición, anulación y eliminación no renumeran ni reciclan correlativos',()=>{
 const previous=ensureContractNumbers({contractTexts:[{id:'b',createdAt:'2026-02-01'},{id:'a',createdAt:'2026-01-01'}]});
 const next={contractSequence:999,contractTexts:[{id:'c',number:'CM-0001',createdAt:'2020-01-01'},{id:'a',number:'CM-0999',status:'voided'}]};
 ensureContractNumbers(next,previous);
 assert.equal(next.contractTexts[0].number,'CM-0003');assert.equal(next.contractTexts[1].number,'CM-0001');assert.equal(next.contractSequence,3);
});
test('vista previa y servidor asignan el mismo siguiente número, sin saltos',()=>{
 const before=ensureContractNumbers({contractTexts:[{id:'a'}]});const next=structuredClone(before);next.contractTexts.unshift({id:'b'});ensureContractNumbers(next);
 assert.equal(next.contractTexts[0].number,'CM-0002');ensureContractNumbers(next,before);assert.equal(next.contractTexts[0].number,'CM-0002');
});
test('conserva orden original sin timestamps y sigue después de 9999',()=>{
 const state=ensureContractNumbers({contractTexts:[{id:'ultimo'},{id:'primero'}]});assert.equal(state.contractTexts[1].number,'CM-0001');
 const prior=ensureContractNumbers({contractSequence:9999,contractTexts:[]});const next={contractTexts:[{id:'n'}]};ensureContractNumbers(next,prior);assert.equal(next.contractTexts[0].number,'CM-10000');
});
