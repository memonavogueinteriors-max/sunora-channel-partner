import test from 'node:test';
import assert from 'node:assert/strict';
import { requestGoogleApi } from '../supabase/functions/_shared/sheetsGoogle.js';

test('mock fetch verifies transient 503 and 429 retries with bounded backoff then success',async()=>{
  const responses=[
    new Response(JSON.stringify({message:'temporary'}),{status:503}),
    new Response(JSON.stringify({message:'rate limited'}),{status:429}),
    new Response(JSON.stringify({values:[['ok']]}),{status:200,headers:{'Content-Type':'application/json'}})
  ];
  const delays=[],requests=[];
  const result=await requestGoogleApi('https://example.test/sheets','mock-token',{
    fetchImpl:async(url,options)=>{requests.push({url,options});return responses.shift();},
    wait:async(ms)=>delays.push(ms)
  });
  assert.deepEqual(result,{values:[['ok']]});
  assert.equal(requests.length,3);
  assert.deepEqual(delays,[250,500]);
  assert.equal(requests[0].options.headers.Authorization,'Bearer mock-token');
  assert.equal(requests[0].options.method,'GET');
});

test('mock fetch confirms non-retryable append stops after ambiguous network error',async()=>{
  let calls=0;const delays=[];
  await assert.rejects(()=>requestGoogleApi('https://example.test/append','mock-token',{
    method:'POST',body:{values:[['sale-id']]},retryable:false,
    fetchImpl:async(url,options)=>{calls++;assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{values:[['sale-id']]});throw new TypeError('simulated network timeout');},
    wait:async(ms)=>delays.push(ms)
  }),/simulated network timeout/);
  assert.equal(calls,1);
  assert.deepEqual(delays,[]);
});

test('mock fetch confirms client errors are not retried',async()=>{
  let calls=0;
  await assert.rejects(()=>requestGoogleApi('https://example.test/sheets','mock-token',{
    fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:'invalid request'}),{status:400});},
    wait:async()=>{}
  }),/HTTP 400/);
  assert.equal(calls,1);
});

test('mock fetch treats a successful empty 204 response as an empty result',async()=>{
  const result=await requestGoogleApi('https://example.test/sheets','mock-token',{
    method:'PUT',fetchImpl:async()=>new Response(null,{status:204}),wait:async()=>{}
  });
  assert.deepEqual(result,{});
});
