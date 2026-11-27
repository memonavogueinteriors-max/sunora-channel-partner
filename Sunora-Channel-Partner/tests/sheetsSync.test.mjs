import test from 'node:test';
import assert from 'node:assert/strict';
import { mapSalesToSheetRows, planSalesSheetSync, validateSheetsSyncRequest, SALES_SHEET_HEADERS, buildSafeSheetsSyncFailure } from '../supabase/functions/_shared/sheetsSync.js';
const sale = { id:'sale-001', partner_id:'partner-001', invoice_number:'SUN-001', invoice_date:'2026-11-27', product_description:'Sunora Panel', panel_quantity:4, invoice_currency:'AED', subtotal_ex_vat:1000, vat_amount:50, total_inc_vat:1050 };
const partner = { id:'partner-001', partner_code:'CH202611001', full_name:'Test Partner' };
test('maps a sale to a stable, minimal, 12-column sheet row',()=>{const result=mapSalesToSheetRows([sale],[partner]);assert.equal(result.rows.length,1);assert.equal(result.rows[0].length,SALES_SHEET_HEADERS.length);assert.equal(result.rows[0][0],sale.id);assert.equal(result.rows[0][3],partner.partner_code);assert.equal(result.rows[0][4],partner.full_name);assert.deepEqual(result.duplicateIds,[]);});
test('source duplicate sale IDs are skipped and reported',()=>{const result=mapSalesToSheetRows([sale,sale],[partner]);assert.equal(result.rows.length,1);assert.deepEqual(result.duplicateIds,['sale-001']);});
test('first sync appends new stable IDs and no duplicate incoming rows',()=>{const header=SALES_SHEET_HEADERS.slice();const rows=mapSalesToSheetRows([sale,sale],[partner]).rows;const plan=planSalesSheetSync([header],[rows[0],rows[0]]);assert.equal(plan.appendRows.length,1);assert.deepEqual(plan.updateRows,[]);assert.deepEqual(plan.duplicateIncomingIds,['sale-001']);});
test('retry after a successful append is idempotent and plans no changes',()=>{const mapped=mapSalesToSheetRows([sale],[partner]).rows;const plan=planSalesSheetSync([SALES_SHEET_HEADERS.slice(),mapped[0]],mapped);assert.equal(plan.appendRows.length,0);assert.equal(plan.updateRows.length,0);});
test('updates existing rows in place and appends missing records',()=>{const original=mapSalesToSheetRows([{...sale,total_inc_vat:1000}],[partner]).rows[0];const changed=mapSalesToSheetRows([sale,{...sale,id:'sale-002',invoice_number:'SUN-002'}],[partner]).rows;const plan=planSalesSheetSync([SALES_SHEET_HEADERS.slice(),original],changed);assert.equal(plan.updateRows.length,1);assert.equal(plan.updateRows[0].rowNumber,2);assert.equal(plan.appendRows.length,1);assert.equal(plan.appendRows[0][0],'sale-002');});
test('detects duplicate stable IDs already present in the sheet instead of silently choosing',()=>{const row=mapSalesToSheetRows([sale],[partner]).rows[0];const plan=planSalesSheetSync([SALES_SHEET_HEADERS.slice(),row,row],[row]);assert.deepEqual(plan.duplicateExistingIds,['sale-001']);});
test('RAW row values preserve strings without evaluating formula-like text',()=>{const mapped=mapSalesToSheetRows([{...sale,product_description:'=IMPORTXML("unsafe")'}],[partner]).rows[0];assert.equal(mapped[6],'=IMPORTXML("unsafe")');});

test('sync request validation defaults to dry-run and accepts explicit write mode',()=>{
  assert.deepEqual(validateSheetsSyncRequest({}),{valid:true,dryRun:true});
  assert.deepEqual(validateSheetsSyncRequest({dry_run:true}),{valid:true,dryRun:true});
  assert.deepEqual(validateSheetsSyncRequest({dry_run:false}),{valid:true,dryRun:false});
});
test('sync request validation rejects null, arrays and non-boolean dry_run values',()=>{
  assert.equal(validateSheetsSyncRequest(null).valid,false);
  assert.equal(validateSheetsSyncRequest([]).valid,false);
  assert.equal(validateSheetsSyncRequest({dry_run:'false'}).valid,false);
});

import { collectPages } from '../supabase/functions/_shared/sheetsSync.js';

test('collectPages retrieves every row across 500-row pages without silent REST truncation',async()=>{
  const source=Array.from({length:1205},(_,id)=>({id}));
  const calls=[];
  const rows=await collectPages(async(from,to)=>{calls.push([from,to]);return {data:source.slice(from,to+1),error:null};});
  assert.equal(rows.length,1205);
  assert.deepEqual(calls,[[0,499],[500,999],[1000,1499]]);
  assert.deepEqual(rows.map(row=>row.id),source.map(row=>row.id));
});
test('collectPages propagates a page error and stops rather than returning partial data',async()=>{
  let calls=0;
  await assert.rejects(()=>collectPages(async(from,to)=>{calls++;return from===500?{data:null,error:new Error('page failed')}:{data:Array.from({length:500},(_,id)=>({id:from+id})),error:null};}),/page failed/);
  assert.equal(calls,2);
});
test('collectPages rejects unsafe or non-integer page sizes',async()=>{
  await assert.rejects(()=>collectPages(async()=>({data:[],error:null}),0),/pageSize/);
  await assert.rejects(()=>collectPages(async()=>({data:[],error:null}),1001),/pageSize/);
  await assert.rejects(()=>collectPages(async()=>({data:[],error:null}),1.5),/pageSize/);
});

import { chunkValues } from '../supabase/functions/_shared/sheetsSync.js';

test('chunkValues splits large partner ID lookups into bounded chunks without loss',()=>{
  const ids=Array.from({length:1205},(_,id)=>'partner-'+id);
  const chunks=chunkValues(ids,100);
  assert.deepEqual(chunks.map(chunk=>chunk.length),[100,100,100,100,100,100,100,100,100,100,100,100,5]);
  assert.deepEqual(chunks.flat(),ids);
});
test('chunkValues handles empty lists and invalid sizes',()=>{
  assert.deepEqual(chunkValues([]),[]);
  assert.throws(()=>chunkValues('not-an-array'),/array/);
  assert.throws(()=>chunkValues([],0),/chunkSize/);
  assert.throws(()=>chunkValues([],1001),/chunkSize/);
  assert.throws(()=>chunkValues([],1.2),/chunkSize/);
});

test('collectPages rejects malformed responses and oversized pages',async()=>{
  await assert.rejects(()=>collectPages(async()=>({data:null,error:null})),/data array/);
  await assert.rejects(()=>collectPages(async()=>({data:[1,2,3],error:null}),2),/exceeded/);
});


test('safe sync failure response contains only a generic message and UUID reference',()=>{
  const reference='d34c1b56-78e9-4abc-8def-0123456789ab';
  const payload=buildSafeSheetsSyncFailure(reference);
  assert.deepEqual(payload,{error:'Sheets sync failed. Internal details are withheld; check server logs using this reference.',request_id:reference});
  assert.ok(!JSON.stringify(payload).includes('private_key'));
});

test('invalid request references are replaced with unavailable',()=>{
  assert.equal(buildSafeSheetsSyncFailure('bad').request_id,'unavailable');
});
