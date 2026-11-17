// Read-only, isolated lexical vector indexes. This module has no network or model
// client, and does not elevate supplied summary notes into verified quotations.
import lu from '../public/data/research-studies/rag1_lu2020/index.json' with {type:'json'};
import wif1 from '../public/data/research-studies/rag2_gse293381/index.json' with {type:'json'};

const indexes = Object.freeze({rag1_lu2020:lu,rag2_gse293381:wif1});
const warnings = Object.freeze([
  'Retrieved text is a supplied source summary, not an independently verified quotation.',
  'No primary numerical matrix or full paper is included in these collections. Retrieval is not a reanalysis.',
  'Similarity ranks matching terms; it does not measure whether a source supports a claim.'
]);

export class StudyRetrievalError extends Error {
  constructor(code,message){super(message);this.name='StudyRetrievalError';this.code=code;}
}

export function listStudies() {
  return Object.values(indexes).map(index=>({
    id:index.study,label:index.label,title:index.title,recordCount:index.recordCount,
    sourceUrl:index.sourceUrl,rawDataAvailable:false,summaryOnly:true,
    indexUrl:`/data/research-studies/${index.study}/index.json`,
    sqliteUrl:`/data/research-studies/${index.study}/vectors.sqlite`,
    sourcePackageSha256:index.sourcePackageSha256,embeddingKind:'lexical_tfidf'
  }));
}

function queryVector(index,question) {
  // Python's (?u)\b\w\w+\b is two-or-more Unicode letters/numbers/underscores.
  // There are deliberately no stop words, stemming, neural embeddings or calls.
  const tokens=question.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu)||[];
  const terms=[...tokens];
  for(let i=1;i<tokens.length;i++)terms.push(tokens[i-1]+' '+tokens[i]);
  const frequencies=new Map();
  for(const term of terms)if(Object.hasOwn(index.vocabulary,term)){
    const id=index.vocabulary[term];frequencies.set(id,(frequencies.get(id)||0)+1);
  }
  const vector=new Map();let norm=0;
  for(const [id,count] of frequencies){const value=(1+Math.log(count))*index.idf[id];vector.set(id,value);norm+=value*value;}
  norm=Math.sqrt(norm);
  if(norm>0)for(const [id,value] of vector)vector.set(id,value/norm);
  return vector;
}

export function queryStudy(study,question,options={}) {
  if(typeof study!=='string'||!Object.hasOwn(indexes,study))throw new StudyRetrievalError('unknown_study','Select RAG 1 (Lu 2020) or RAG 2 (GSE293381). No default study is inferred.');
  if(typeof question!=='string'||!question.trim()||question.length>2000)throw new StudyRetrievalError('invalid_question','Enter a question of 1–2,000 characters.');
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='limit'))throw new StudyRetrievalError('invalid_options','Only a retrieval limit may be supplied.');
  const limit=options.limit??5;
  if(!Number.isInteger(limit)||limit<1||limit>5)throw new StudyRetrievalError('invalid_limit','Retrieve between 1 and 5 source summaries.');
  const index=indexes[study],vector=queryVector(index,question);
  const matches=index.records.map(record=>{
    let score=0;
    for(const [id,value] of record.vector)score+=(vector.get(id)||0)*value;
    return {record,score};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.record.id.localeCompare(b.record.id)).slice(0,limit);
  return {
    study,status:matches.length?'matches':'no_matches',question:question.trim(),method:'TF-IDF cosine similarity',
    collectionSize:index.recordCount,rawDataAvailable:false,quoteVerified:false,modelCalls:0,
    summaryOnly:true,warnings:[...warnings],
    results:matches.map(({record,score})=>({
      id:record.id,text:record.text,score:Number(score.toFixed(8)),sourceUrl:record.sourceUrl,
      sourceKind:record.sourceKind,recordKind:record.recordKind,evidenceLevel:record.evidenceLevel,
      quoteVerified:false,independentlyVerified:false,locator:{...record.locator}
    }))
  };
}
