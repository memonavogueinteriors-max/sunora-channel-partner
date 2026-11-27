import test from 'node:test';
import assert from 'node:assert/strict';
import { assessZohoBooksReadiness } from '../supabase/functions/_shared/zohoBooksReadiness.js';

test('Zoho Books readiness stays blocked without credentials, authorization and direction',()=>{
  const result=assessZohoBooksReadiness({});
  assert.equal(result.ready,false);
  assert.deepEqual(result.missing,['clientId','clientSecret','refreshToken','organizationId','oauthGrantConfirmed','direction']);
  assert.equal(result.networkEnabled,false);
  assert.equal(result.writesEnabled,false);
});
test('complete configuration only marks readiness; does not enable API calls or writes',()=>{
  const result=assessZohoBooksReadiness({clientId:'client',clientSecret:'secret',refreshToken:'refresh',organizationId:'org',oauthGrantConfirmed:true,direction:'import_invoices_from_zoho'});
  assert.equal(result.ready,true);
  assert.deepEqual(result.missing,[]);
  assert.equal(result.networkEnabled,false);
  assert.equal(result.writesEnabled,false);
});
test('invalid integration direction does not pass readiness',()=>{
  const result=assessZohoBooksReadiness({clientId:'client',clientSecret:'secret',refreshToken:'refresh',organizationId:'org',oauthGrantConfirmed:true,direction:'unspecified'});
  assert.equal(result.ready,false);
  assert.deepEqual(result.missing,['direction']);
});
