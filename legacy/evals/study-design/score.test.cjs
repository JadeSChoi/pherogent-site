'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateCases,replay}=require('./score.cjs');
const example=require('./example-outputs.json');
test('a partial replay counts every planned packet and never rewards missing outputs',()=>{
  validateCases(); const r=replay(example);
  assert.equal(r.rows.length,12);
  assert.equal(r.writtenRules.unsupportedEndorsements,1);assert.equal(r.executedRules.unsupportedEndorsements,0);
  assert.equal(r.writtenRules.answerableCorrectLabels,1);assert.equal(r.executedRules.answerableCorrectLabels,1);
  assert.equal(r.executedRules.unsupportedEndorsementsOrFailures,r.executedRules.unsupportedN-1);
  assert.equal(r.executedRules.answerableFailures,r.executedRules.answerableN-1);
});
test('empty, unsupported labels or blank reasons count as failed, never as abstentions',()=>{
  for(const r of [replay([]),replay([{id:'p03',label:'supports',reason:' '}]),replay([{id:'p01',label:'PASS',reason:'X'}])]){
    assert.equal(r.writtenRules.unsupportedEndorsementsOrFailures,r.writtenRules.unsupportedN);
    assert.equal(r.executedRules.unsupportedEndorsementsOrFailures,r.writtenRules.unsupportedN);
    assert.equal(r.executedRules.answerableCorrectLabels,0);
  }
  assert.throws(()=>replay([example[0],example[0]]),/Duplicate/);assert.throws(()=>replay([{id:'outside'}]),/Unrecognized/);
});
