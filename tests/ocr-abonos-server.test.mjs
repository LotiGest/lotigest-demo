import test from 'node:test';
import assert from 'node:assert/strict';
import {validate} from '../functions/api/app/state.js';
const state=()=>({
 version:3,company:{},residences:[{id:'r',name:'PRUEBAS'}],
 lots:[{id:'L1',residenceId:'r',stage:1,block:'A',sourceNumber:'1',status:'sold'},
       {id:'L2',residenceId:'r',stage:1,block:'A',sourceNumber:'2',status:'sold'}],
 clients:[{id:'C1',name:'CLIENTE PRUEBA'}],
 sales:[{id:'S1',lotId:'L1',clientId:'C1',type:'credit',price:10000,downPayment:1000,months:12,date:'2024-01-01',firstDueDate:'2024-02-01'},
        {id:'S2',lotId:'L2',clientId:'C1',type:'credit',price:10000,downPayment:1000,months:12,date:'2024-01-01',firstDueDate:'2024-02-01'}],
 payments:[],ownerPayments:[]
});
test('un solo recibo conjunto puede pagar dos solares sin duplicar folio',()=>{
 const d=state();
 d.payments=[{id:'P1',saleId:'S1',groupId:'RC-1',date:'2024-02-10',amount:500,receiptReference:'00001234'},
             {id:'P2',saleId:'S2',groupId:'RC-1',date:'2024-02-10',amount:500,receiptReference:'00001234'}];
 assert.doesNotThrow(()=>validate(d));
});
test('un folio duplicado en otra operación o propietario queda bloqueado',()=>{
 const d=state();
 d.payments=[{id:'P1',saleId:'S1',groupId:'RC-1',date:'2024-02-10',amount:500,receiptReference:'00001234'},
             {id:'P2',saleId:'S2',groupId:'RC-2',date:'2024-02-10',amount:500,receiptReference:'00001234'}];
 assert.throws(()=>validate(d),/duplicado/i);
});
test('abonos sin folio antiguo permanecen válidos',()=>{
 const d=state();
 d.payments=[{id:'P1',saleId:'S1',date:'2024-02-10',amount:500},
             {id:'P2',saleId:'S2',date:'2024-02-10',amount:500}];
 assert.doesNotThrow(()=>validate(d));
});
