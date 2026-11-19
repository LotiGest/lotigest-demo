import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseContractIntake,intakeSolarCandidates,intakeCheckValues,intakeResetPreview,intakePrepareFreshClientRegister} from '../../contract-intake-core.mjs';
const receipt="LOTIFICADORA ALTOS DEL ARRAYAN\nGENERALES DE CLIENTE\nNOMBRE DE CLIENTE: CLIENTE FICTICIO DE PRUEBA\nDNI: 0801 1990 00021\nRTN:\nESTADO CIVIL: SOLTERO\nPROFESION U OFICIO:\nDIRECCION: RESIDE EN EL EXTRANJERO\nSOBRE LOTE\nLOTE (S): 16\nBLOQUE (S): G\nAREA: 252.42 VARAS2\nMETROS CUADRADOS: 176 M2\nCOLINDANCIAS\nNORTE: CALLE DE ACCESO DE 8 METROS DE ANCHO\nSUR: LOTE G-3\nESTE: LOTE G-15\nOESTE: LOTE G-17\nDATOS DE VENTA\nPRECIO DE LOTE: L 580,564.16\nVALOR DE PRIMA: L 58,056.42\nSALDO A FINANCIAR: L 522,507.74\nCUOTA: L 6,220.33 MENSUAL\nTIEMPO DE CONTRATO: 7 ANOS / 84 CUOTAS\nOBSERVACIONES\nPRECIO POR VARA2: L 2,300. REPRESENTANTE EN HONDURAS: PERSONA FICTICIA";
test('Lectura OCR de ficha contractual: no inventar etapa ni campos vacíos',()=>{
 const d=parseContractIntake(receipt);
 assert.equal(d.name,'CLIENTE FICTICIO DE PRUEBA');assert.equal(d.identity,'0801 1990 00021');
 assert.equal(d.rtn,'');assert.equal(d.occupation,'');assert.equal(d.maritalStatus,'SOLTERO');
 assert.equal(d.address,'RESIDE EN EL EXTRANJERO');assert.equal(d.number,'16');assert.equal(d.block,'G');
 assert.equal(d.stage,null);assert.equal(d.areaM2,176);assert.equal(d.areaVaras,252.42);
 assert.equal(d.north,'CALLE DE ACCESO DE 8 METROS DE ANCHO');assert.equal(d.south,'LOTE G-3');
 assert.equal(d.east,'LOTE G-15');assert.equal(d.west,'LOTE G-17');
 assert.equal(d.price,580564.16);assert.equal(d.down,58056.42);assert.equal(d.financed,522507.74);
 assert.equal(d.monthly,6220.33);assert.equal(d.months,84);assert.equal(d.pricePerVara,2300);
 assert.equal(Math.round((d.price-d.down)/d.months*100)/100,d.monthly);
});
test('La etapa y solar exacto son obligatorios; no sobrescribir medidas',()=>{
 const d=parseContractIntake(receipt),lot={id:'G-2-16',area:170,status:'sold',dimensions:{front:10,depth:17}};
 assert.deepEqual(intakeCheckValues({...d,lotId:lot.id},lot),[]);
 assert.ok(intakeCheckValues({...d,lotId:lot.id,down:d.price},lot).some(e=>e.includes('prima')));
 assert.ok(intakeCheckValues({...d,lotId:''},null).some(e=>e.includes('solar exacto')));
});
test('Reinicio conserva catastro completo y elimina dependencias del padrón',()=>{
 const state={version:3,company:{name:'Grupo H'},residences:[{id:'R',name:'Altos',viewBox:[0,0,100,100]}],
 lots:[{id:'L1',residenceId:'R',stage:2,block:'G',sourceNumber:'16',area:176,areaVaras2:252.42,price:580564.16,dimensions:{front:11,depth:16},status:'sold',ownerClientId:'C1'}],
 clients:[{id:'C1',name:'FICTICIO',identity:'TEST'}],sales:[{id:'S1',lotId:'L1',clientId:'C1'}],payments:[{id:'P1',saleId:'S1'}],
 reservations:[],contractTexts:[{id:'D1',clientId:'C1'}],historicalPayments:[{id:'H1'}],historicalContracts:[],
 ownerPayments:[{id:'OP1'}],ownershipStatements:[{id:'OS1'}],ledgerImportBatches:[{id:'B1'}],cashEntries:[{id:'E1',kind:'expense',amount:100,date:'2026-01-01'}]};
 const before=structuredClone(state),next=intakePrepareFreshClientRegister(state);
 assert.deepEqual(state,before);assert.deepEqual(next.residences,before.residences);
 assert.equal(next.lots[0].area,176);assert.deepEqual(next.lots[0].dimensions,before.lots[0].dimensions);
 assert.equal(next.lots[0].price,580564.16);assert.equal(next.lots[0].stage,2);assert.equal(next.lots[0].ownerClientId,undefined);
 assert.deepEqual(next.cashEntries,before.cashEntries);
 for(const k of ['clients','sales','payments','historicalPayments','historicalContracts','ownershipStatements','ownerPayments','contractTexts','ledgerImportBatches'])assert.deepEqual(next[k],[],k);
 assert.equal(intakeResetPreview(state).clients,1);assert.equal(intakeResetPreview(state).ownerPayments,1);
});
test('El contrato reconoce bloque G y solar 16, pero exige elegir la etapa manualmente',()=>{
 const data=parseContractIntake('SOBRE LOTE\nLOTE (S): 16\nBLOQUE (S): G\nAREA: 252.42 VARAS2');
 assert.equal(data.block,'G');assert.equal(data.number,'16');
 const lots=[
  {id:'E1G16',stage:1,block:'G',sourceNumber:'16',status:'available'},
  {id:'E2G16',stage:2,block:'G',sourceNumber:'16',status:'available'},
  {id:'E2G17',stage:2,block:'G',sourceNumber:'17',status:'available'}
 ];
 assert.deepEqual(intakeSolarCandidates(lots,'',data.block,data.number),[]);
 assert.deepEqual(intakeSolarCandidates(lots,1,data.block,data.number).map(l=>l.id),['E1G16']);
 assert.deepEqual(intakeSolarCandidates(lots,2,data.block,data.number).map(l=>l.id),['E2G16']);
 const values={...data,lotId:'E2G16',name:'CLIENTE DE PRUEBA',identity:'0801 1990 00021',
  price:580564.16,down:58056.42,months:84};
 assert.ok(intakeCheckValues({...values,stage:''},lots[1]).some(e=>e.includes('Etapa')));
 assert.deepEqual(intakeCheckValues({...values,stage:'2'},lots[1]),[]);
 assert.ok(intakeCheckValues({...values,stage:'1'},lots[1]).some(e=>e.includes('no pertenece')));
 assert.ok(intakeCheckValues({...values,stage:'2',number:'17'},lots[1]).some(e=>e.includes('no coinciden')));
});
