import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./receipt-ocr-ui.js',import.meta.url),'utf8');
const nextReceiptSuggestion=vm.runInNewContext(source.slice(0,source.indexOf('function suggestReceiptField'))+'\nnextReceiptSuggestion');
const cases=[
  [
    {
      "payments": [
        {
          "receiptReference": "5562",
          "recordedAt": "2026-11-26T18:01:00Z"
        }
      ]
    },
    "5563"
  ],
  [
    {
      "payments": [
        {
          "receiptReference": "7155",
          "recordedAt": "2026-11-25T19:00:00Z"
        },
        {
          "receiptReference": "0005562",
          "recordedAt": "2026-11-26T18:01:00Z"
        }
      ],
      "ownerPayments": [
        {
          "receiptReference": "5563",
          "recordedAt": "2026-11-25T19:00:00Z"
        }
      ]
    },
    "5564"
  ],
  [
    {
      "payments": [
        {
          "receiptReference": "5562"
        },
        {
          "receiptReference": "5563",
          "status": "voided"
        }
      ]
    },
    "5564"
  ],
  [
    {
      "historicalPayments": [
        {
          "receiptReference": "5562"
        }
      ]
    },
    ""
  ],
  [
    {
      "payments": [
        {
          "receiptReference": "5562",
          "recordedAt": "2026-11-26T18:01:00Z"
        }
      ],
      "historicalPayments": [
        {
          "sourceRaw": {
            "folio": "0005563"
          }
        }
      ]
    },
    "5564"
  ],
  [
    {
      "ownerPayments": [
        {
          "receiptReference": "5562"
        }
      ]
    },
    "5563"
  ]
];
for(const [state,expected] of cases)test('siguiente correlativo '+JSON.stringify(state),()=>assert.equal(nextReceiptSuggestion(state),expected));

test('talonario continúa el último ingresado sin importar cliente, fecha de pago ni folio mayor antiguo',()=>{
 const state={payments:[{receiptReference:'5626',clientId:'B',date:'2026-11-28',recordedAt:'2026-11-27T10:00:00Z'},{receiptReference:'5526',clientId:'A',date:'2025-01-01',recordedAt:'2026-11-28T10:00:00Z'}]};
 assert.equal(nextReceiptSuggestion(state),'5527');state.payments.push({receiptReference:'5527',clientId:'B',recordedAt:'2026-11-28T10:01:00Z'});assert.equal(nextReceiptSuggestion(state),'5528');
});
test('consecutivo inicia en 1, no salta al talonario anterior y evita folios ya usados',()=>{
 const state={company:{receiptSequence:{mode:'consecutive',start:'1',since:'2026-11-28T10:00:00Z'}},payments:[{receiptReference:'5626',recordedAt:'2026-11-27T10:00:00Z'}],historicalPayments:[{receiptReference:'2'}]};
 assert.equal(nextReceiptSuggestion(state),'1');state.payments.push({receiptReference:'1',recordedAt:'2026-11-28T10:01:00Z'});assert.equal(nextReceiptSuggestion(state),'3');state.payments.push({receiptReference:'3',recordedAt:'2026-11-28T10:02:00Z'});assert.equal(nextReceiptSuggestion(state),'4');
});
test('nuevo talonario configurado continúa desde su número real y conserva los anteriores',()=>{
 const state={company:{receiptSequence:{mode:'book',start:'5527',since:'2026-11-28T10:00:00Z'}},payments:[{receiptReference:'7155',recordedAt:'2026-11-27T10:00:00Z'}]};
 assert.equal(nextReceiptSuggestion(state),'5527');state.payments.push({receiptReference:'5527',recordedAt:'2026-11-28T10:01:00Z'});assert.equal(nextReceiptSuggestion(state),'5528');
});
