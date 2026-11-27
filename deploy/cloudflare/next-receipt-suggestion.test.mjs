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
