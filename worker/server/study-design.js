/* A deliberately narrow, local prerequisite check, not a scientific verdict.
 * Recognizes explicit assertions in English about the same cells over time.
 * A compatible design does not prove that an outcome occurred. */
const ruleId = 'same-cell-tracking-v1';
const units = '(?:cells?|fibroblasts?|neurons?)';
const identified = '(?:(?:the )?same (?:individual )?|individual(?:ly (?:identified|indexed|labelled|labeled))? |each (?:individual )?)' + units + '(?![- ](?:type|population|lineage|culture|line|batch|sample)s?\\b)\\b';
const cellTerm = new RegExp('\\b' + identified);
const transition = /\b(?:recover\w*|return\w*|revert\w*|restor\w*|regain\w*|rejuvenat\w*|revers\w*|persist\w*|remain\w*|chang\w*|surviv\w*|became|become|transition\w*|track(?:ed|ing)?|follow(?:ed|ing)?|re[- ]?identif\w*|repeatedly|longitudinal\w*|over time|across (?:time|phases)|from .{1,30} to)\b/;
const uncertainClaim = /\b(?:if|whether|unknown|unclear|might|may|could|hypothes\w*|would|should|propos\w*|plan(?:ned)?|cannot|can't|didn't|weren't|wasn't|not|never|without|no (?:direct )?evidence|no (?:way|means) to|fail(?:ed|s)? to)\b/;
const qualifier = /\b(?:might|may|could|would|should|whether|hypothe\w*|unknown|unclear|predict\w*|simulat\w*|propos\w*|in future|future (?:work|studies?)|plan(?:s|ned)? to|previous (?:work|studies?)|other (?:groups|studies)|unlike|instead of|rather than)\b/;
const times = /\b(?:over time|across (?:multiple |several |all |both )?(?:time[- ]?points?|times|visits|days|phases|frames|sessions)|at (?:both |each |multiple |successive |different )time[- ]?points?|between (?:the )?(?:two |multiple )?(?:time[- ]?points?|phases)|longitudinal\w*|time[- ]?lapse|from (?:day|hour|week|baseline|before|pretreatment)\b.{0,35} to (?:day|hour|week|after|follow[- ]?up|withdrawal|recovery)\b|before and after|repeatedly|throughout (?:the )?(?:experiment|observation period|follow[- ]?up)|at baseline and (?:again |after|following|at follow[- ]?up))\b/;
const followed = '(?:tracked|followed|re[- ]?identified|repeatedly (?:imaged|measured)|re[- ]?imaged|monitored)';
const positive = [
  new RegExp('\\b' + followed + ' (?:in real time )?' + identified),
  new RegExp('\\b(?:we )?(?:used|applied|employed) .{1,65}(?:to|for) (?:track(?:ing)?|follow(?:ing)?|re[- ]?identify(?:ing)?) ' + identified),
  new RegExp('\\b' + identified + '.{0,42}\\b(?:were|was|have been|had been) (?:individually |directly |continuously |repeatedly )?' + followed + '\\b'),
  /\b(?:cells|fibroblasts|neurons) were (?:individually (?:tracked|followed)|(?:tracked|followed) individually)\b/
];
const absent = [
  /\b(?:did not|didn't|could not|couldn't|cannot|can't|never) (?:directly |individually )?(?:track|follow|re[- ]?identify) (?:the |these )?(?:same |individual )*(?:cells|fibroblasts|neurons)\b/,
  /\b(?:cells|fibroblasts|neurons) (?:were|was|could) (?:not|never) (?:be )?(?:individually |directly )?(?:tracked|followed|re[- ]?identified)\b/,
  /\b(?:no|without) (?:direct |longitudinal |individual |same[- ]cell )*(?:cell tracking|tracking of (?:the )?(?:same |individual )*cells)\b/,
  /\b(?:destructiv\w* (?:bulk |tissue |cell |single[- ]cell )?(?:sampling|sampled|assays?|measurements?|sequencing)|(?:cells|samples) (?:were )?(?:lysed|destroyed|sacrificed) (?:at|for) (?:each|every) (?:time[- ]?point|phase))\b/,
  /\b(?:different|distinct|separate|new) (?:individual )?(?:cells|fibroblasts|neurons) (?:were (?:sampled|measured|assayed|sequenced|collected) )?(?:at|for|from) (?:each|every|different) (?:time[- ]?point|phase|visit)s?\b/,
  /\b(?:linked|matched|paired) (?:samples )?(?:only (?:at|by) (?:the )?donor|(?:at|by) (?:the )?donor(?: level)? only)\b/,
  /\bbulk (?:rna[- ]?seq(?:uencing)?|methylation(?: (?:profil\w*|measurements?|assays?))?|sequencing|measurements?|assays?|sampling|tissue (?:samples?|profil\w*))\b/
];
const normal = s => typeof s === 'string' ? s.toLowerCase().replace(/[’‘]/g,"'").replace(/[−–—]/g,'-').replace(/[^\S\r\n]+/g,' ').trim() : '';
const clauses = text => text.split(/[.!?;\n]+|\b(?:but|however|whereas)\b/).filter(Boolean);
function inspect(passage) {
  // Do not infer compatibility from a silently truncated passage.
  if (!passage || typeof passage !== 'string' || passage.length > 32000) return 'unknown';
  let yes=false,no=false;
  for(const s of clauses(normal(passage))){
    if(qualifier.test(s.replace(/\bcould not\b/g,'did not')))continue;
    // Merely naming an assay the authors excluded is not evidence of their design.
    const excludedBulk=/\b(?:not|never|without|no) (?:use |using |perform |performing |any |a )?(?:destructive |bulk )|\bbulk [a-z -]{1,40}(?:was|were) (?:not|never) (?:used|performed)\b/.test(s);
    const neg=absent.some((r,i)=>(i<3||!excludedBulk)&&r.test(s));
    if(neg)no=true;
    // Barcodes alone may identify a lineage or clone, not an individual over time.
    // A sentence explicitly documenting direct time-lapse tracking can still qualify.
    const lineageOnly=/\b(?:barcod\w*|clone\w*|lineage\w*|pseudotime|inferen\w*)\b/.test(s)&&!/(?:time[- ]?lapse|live[- ]cell (?:imaging|microscopy))/.test(s);
    if(!lineageOnly && !/\b(?:not|never|no|without|couldn't|didn't|weren't|wasn't)\b/.test(s) && times.test(s) && positive.some(r=>r.test(s)))yes=true;
  }
  return yes&&no?'mixed':yes?'same_cells':no?'bulk':'unknown';
}
function evaluate(input) {
  const {claim,passage,requirement='auto',tracking='auto'}=input||{};
  const result=(status,reason,basis)=>({ruleId,applies:status!=='not_applicable',status,reason,basis});
  const raw=typeof claim==='string'?claim.trim():'';
  if(!raw)return result('not_applicable','Enter a sentence to check.','none');
  if(raw.length>8000)return result('unknown','The sentence exceeds this rule’s reading limit. Check the observation unit manually.','limit');
  const asserted=clauses(normal(raw)).some(s=>cellTerm.test(s)&&transition.test(s)&&!uncertainClaim.test(s));
  if(requirement!=='same_cells'&&!asserted)return result('not_applicable','This narrow rule did not identify a claim that the same individual cells were followed over time. It does not assess other claims.','claim');
  const seen=inspect(passage);
  if(seen==='mixed'||((tracking==='same_cells'||tracking==='bulk')&&seen!=='unknown'&&tracking!==seen))return result('unknown','The design details conflict or describe more than one method. Identify the measurements tied to this claim before drawing a same-cell conclusion.','mixed');
  const author=tracking==='same_cells'||tracking==='bulk';
  const chosen=tracking==='unknown'?'unknown':author?tracking:seen;
  if(chosen==='bulk')return result('incompatible','The described measurements do not link an individual cell across time. A donor- or group-level comparison cannot establish what happened to the same cells.',author?'author':'passage');
  if(chosen==='same_cells')return result('compatible','Individual cells were followed across time according to the supplied design. This meets the tracking prerequisite only; verify the outcome separately.',author?'author':'passage');
  return result('unknown','Not enough information to assess: the supplied design does not establish whether the same individual cells were tracked across time.','unspecified');
}
const api=Object.freeze({evaluate,ruleId});
if (typeof window !== 'undefined') window.PherogentStudyDesign=api;
export {evaluate,ruleId};
export default api;
