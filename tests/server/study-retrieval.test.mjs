import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {queryStudy,listStudies,StudyRetrievalError} from '../../worker/server/study-retrieval.mjs';

const directory=fileURLToPath(new URL('../../public/data/research-studies/',import.meta.url));
const json=file=>JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));
const fixtures=json('query-fixtures.json');
const manifest=json('manifest.json');

test('both packaged collections preserve independently addressable study identities',()=>{
  const studies=listStudies();
  assert.deepEqual(studies.map(study=>[study.id,study.recordCount]),[['rag1_lu2020',6],['rag2_gse293381',7]]);
  for(const study of studies){
    assert.equal(study.rawDataAvailable,false);
    assert.equal(study.summaryOnly,true);
    assert.equal(study.embeddingKind,'lexical_tfidf');
    assert.equal(study.sourcePackageSha256,manifest.sourcePackageSha256);
    assert.ok(study.sqliteUrl.includes(study.id));
    assert.ok(study.indexUrl.includes(study.id));
  }
});

test('runtime query vectors reproduce sklearn scores and rankings for both archives',()=>{
  assert.equal(fixtures.length,12);
  for(const fixture of fixtures){
    const actual=queryStudy(fixture.study,fixture.question).results;
    assert.deepEqual(actual.map(r=>r.id),fixture.expected.map(r=>r.id),fixture.question);
    actual.forEach((result,i)=>assert.ok(Math.abs(result.score-fixture.expected[i].score)<=1e-8,`${fixture.study}: ${fixture.question}: ${result.score} != ${fixture.expected[i].score}`));
  }
});

test('retrieval never crosses a study boundary or silently chooses one',()=>{
  const sourceIDs=new Map(listStudies().map(study=>[study.id,new Set(json(`${study.id}/index.json`).records.map(record=>record.id))]));
  for(const study of sourceIDs.keys()){
    for(const question of ['OSK WIF1 methylation','retina mouse','human']){
      const answer=queryStudy(study,question);
      assert.equal(answer.study,study);
      for(const result of answer.results){
        assert.ok(sourceIDs.get(study).has(result.id));
        assert.ok(result.locator.file.startsWith(study+'/'));
      }
    }
  }
  for(const study of [undefined,null,'','lu','rag3','__proto__','constructor',{}])assert.throws(()=>queryStudy(study,'mouse'),error=>error instanceof StudyRetrievalError&&error.code==='unknown_study');
});

test('unrelated and tokenless queries produce no evidence instead of zero-score cards',()=>{
  for(const study of listStudies())for(const question of ['zzzzquuxxxxx','!!!','x y z','🧬']){
    const result=queryStudy(study.id,question);
    assert.deepEqual(result.results,[]);
    assert.equal(result.status,'no_matches');
    assert.equal(result.quoteVerified,false);
    assert.equal(result.rawDataAvailable,false);
  }
});

test('summary provenance remains a note locator, never a claimed paper passage',()=>{
  for(const study of listStudies()){
    const result=queryStudy(study.id,'mouse methylation retina');
    assert.ok(result.results.length>0);
    assert.equal(result.modelCalls,0);
    assert.equal(result.summaryOnly,true);
    assert.ok(result.warnings.some(w=>/not an independently verified quotation/.test(w)));
    assert.ok(result.warnings.some(w=>/does not measure whether a source supports a claim/.test(w)));
    for(const record of result.results){
      assert.equal(record.evidenceLevel,'source_summary_not_raw_data');
      assert.equal(record.quoteVerified,false);
      assert.equal(record.independentlyVerified,false);
      assert.ok(record.score>0);
      assert.match(record.sourceUrl,/^https:\/\//);
      assert.ok(Number.isInteger(record.locator.line)&&record.locator.line>=1);
      assert.equal(record.locator.recordId,record.id);
      assert.equal(record.locator.sourcePackageSha256,manifest.sourcePackageSha256);
      const note=fs.readFileSync(path.join(directory,record.locator.file),'utf8').split('\n')[record.locator.line-1];
      assert.equal(JSON.parse(note).text,record.text);
    }
  }
});

test('query and output limits are enforced before retrieval',()=>{
  for(const question of ['', '  ',null,undefined,42,{},'x'.repeat(2001)])assert.throws(()=>queryStudy('rag1_lu2020',question),error=>error.code==='invalid_question');
  for(const options of [null,[],{other:3}])assert.throws(()=>queryStudy('rag1_lu2020','mouse',options),error=>error.code==='invalid_options');
  for(const limit of [0,-1,6,1.5,Infinity,'2'])assert.throws(()=>queryStudy('rag1_lu2020','mouse',{limit}),error=>error.code==='invalid_limit');
  assert.equal(queryStudy('rag1_lu2020','mouse retinal',{limit:1}).results.length,1);
  assert.ok(queryStudy('rag1_lu2020','a'.repeat(2000)).results.length<=5);
});

test('returned objects cannot mutate future retrievals and ranking is repeatable',()=>{
  const expected=queryStudy('rag1_lu2020','retinal mouse methylation');
  const changed=queryStudy('rag1_lu2020','retinal mouse methylation');
  changed.results[0].text='altered';changed.results[0].locator.file='wrong';changed.warnings.length=0;
  const studies=listStudies();studies[0].id='wrong';
  assert.deepEqual(queryStudy('rag1_lu2020','retinal mouse methylation'),expected);
  assert.equal(listStudies()[0].id,'rag1_lu2020');
});

test('static archive, note, vector and fixture bytes match their publication manifest',()=>{
  assert.equal(manifest.aiCalls,0);
  assert.match(manifest.sourcePackageSha256,/^[a-f0-9]{64}$/);
  assert.equal(Object.keys(manifest.files).length,7);
  for(const [file,expected] of Object.entries(manifest.files)){
    const bytes=fs.readFileSync(path.join(directory,file));
    assert.equal(bytes.byteLength,expected.bytes,file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256,file);
  }
  for(const study of listStudies()){
    const index=json(`${study.id}/index.json`);
    assert.equal(index.sourceSqliteSha256,manifest.files[`${study.id}/vectors.sqlite`].sha256);
    assert.equal(index.sourceNotesSha256,manifest.files[`${study.id}/source_documents/verified_source_notes.jsonl`].sha256);
    assert.ok(index.records.every(record=>record.vector.every(([i,value])=>Number.isInteger(i)&&i>=0&&i<index.idf.length&&Number.isFinite(value))));
  }
});
