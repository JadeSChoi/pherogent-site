'use strict';
(() => {
  // Local prototype content only. This module never calls a model or sends data.
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const prepared = 'Prepared example · no AI ran';
  const legacyWelcomeSuffix=' You can save requests and explore a prepared example. No AI is connected to these section conversations.';
  const welcomeSuffix=' Try a prepared example, or send a message to check the AI connection and review the exact context before consenting. AI replies use the shared allowance and require author review.';
  const stages = [
    {id:'organizer',label:'Research organizer',role:'Project agent',description:'Keep the research question, section work and decisions connected.',group:'Project',icon:'spark',prompts:['Map out this paper','What should I work on next?','Review the project scope'],next:'data'},
    {id:'data',label:'Data processing',role:'Data agent',description:'Plan cleaning, quality checks and reproducible analysis.',group:'Research',icon:'database',prompts:['Create a data-checking plan','Define the unit of analysis','Plan an independent validation'],next:'methods'},
    {id:'methods',label:'Methods',role:'Methods agent',description:'Document what was done, and distinguish it from proposed experiments.',group:'Research',icon:'flask',prompts:['Outline the methods','Design a test of the hypothesis','Check controls and reproducibility'],next:'results'},
    {id:'results',label:'Results',role:'Results agent',description:'Connect each finding to its measurement, source and limits.',group:'Research',icon:'chart',prompts:['Separate findings from hypotheses','Organize the results section','Identify missing measurements'],next:'figures'},
    {id:'figures',label:'Figures & tables',role:'Figures agent',description:'Plan figures and captions that make the evidence clear.',group:'Research',icon:'image',prompts:['Plan the main figures','Draft a figure caption','Build an evidence comparison table'],next:'discussion'},
    {id:'title',label:'Title',role:'Title agent',description:'Express the contribution without promising more than the evidence shows.',group:'Writing',icon:'type',prompts:['Suggest a working title','Clarify the main contribution','Check the title for overclaiming'],next:'introduction'},
    {id:'introduction',label:'Introduction',role:'Introduction agent',description:'Develop the context, research gap and central question.',group:'Writing',icon:'book',prompts:['Outline the introduction','Define the research gap','Connect the question to prior work'],next:'discussion'},
    {id:'discussion',label:'Discussion',role:'Discussion agent',description:'Interpret the findings alongside alternatives and limitations.',group:'Writing',icon:'message',prompts:['Compare alternative explanations','Draft the limitations','Identify the next experiment'],next:'abstract'},
    {id:'abstract',label:'Abstract',role:'Abstract agent',description:'Summarize the reviewed manuscript with its limits intact.',group:'Writing',icon:'align',prompts:['Create an abstract outline','Summarize the central question','Check that claims match the results'],next:'references'},
    {id:'references',label:'References',role:'Reference agent',description:'Match claims to papers and inspect the supporting passages.',group:'Writing',icon:'link',prompts:['Map claims to the reading set','Find overclaims that need checking','Plan an evidence-tracing pass'],next:'review'},
    {id:'review',label:'Final review',role:'Review agent',description:'Check consistency, unresolved questions and author decisions.',group:'Writing',icon:'check',prompts:['Build a submission checklist','Check section consistency','List the unresolved evidence gaps'],next:'organizer'}
  ];
  const stageFor = id => stages.find(stage => stage.id === id) || stages[0];
  const isSample = ctx => !!((ctx?.project?.isSample || ctx?.project?.isTutorial) &&
    [ctx?.project?.sampleVersion,ctx?.project?.tutorialVersion].includes('cellular-reversal-v1'));
  const question = ctx => typeof ctx?.research?.question === 'string' ? ctx.research.question.slice(0,2000) : '';
  const sourceIds = ctx => {
    const papers = Array.isArray(ctx?.papers) ? ctx.papers : record(ctx?.papers) ? Object.values(ctx.papers) : [];
    return ['MED:27347753','MED:33268865','MED:32720894'].filter(id => papers.some(paper => paper?.id === id));
  };
  const sampleOutputs = {
    organizer:{title:'Research map',body:'RESEARCH QUESTION\nDoes cellular reversal retrieve a preserved state, or produce a new state that resembles the past?\n\nWORKING DISTINCTION\nKeep three categories separate: published observations, an untested archive hypothesis, and a proposed experiment.\n\nPAPER PLAN\n1. Data processing: define the measurements and the biological unit.\n2. Methods: design the clone-specific baseline comparison and its controls.\n3. Results: describe only the selected published observations; no new experiment has run.\n4. Discussion: compare archive retrieval with activation withdrawal and formation of a similar new state.\n5. Abstract and references: summarize the reviewed scope, then inspect every supporting passage.\n\nNEXT DECISION\nWhich measurement would distinguish recovery toward a clone’s own prior state from recovery toward a population average?\n\nPrepared research map; not an AI analysis.'},
    data:{title:'Data and validation plan',body:'PROPOSED DATA PLAN — NOT EXECUTED\n\nRecord clone identity, biological replicate, sampling time, perturbation, assay and batch before analysis. Keep the clone-specific baseline separate from the population reference.\n\nQUALITY CHECKS\n• Document missing measurements and exclusion criteria.\n• Check batch and lineage effects before comparing states.\n• Separate biological replicates from repeated measurements.\n• Keep related observations together when defining validation splits.\n\nPRIMARY COMPARISON\nCompare movement toward a clone’s own recorded baseline with movement toward an appropriately matched population average. Account for regression to the mean, selection and persistent context.\n\nVALIDATION\nPrespecify the comparison and assess it on held-out biological units. For pooled reconstruction, compare methods with matched measurement budgets.\n\nNo dataset was loaded, cleaned or analyzed by this prototype.'},
    methods:{title:'Methods outline and proposed discriminator',body:'METHODS OUTLINE — PROPOSED WORK\n\nAim\nDistinguish recovery of a recorded clone-specific state from formation of a state that resembles a population baseline.\n\nDesign\nRecord clone-specific baseline patterns. Follow lineages through a defined perturbation and recovery period. Compare recovery toward each clone’s own baseline with recovery toward a population average.\n\nControls to specify\nMatched untreated controls, measurement-repeat controls and a prespecified approach to regression to the mean, cell selection and persistent context. Define the organism or other biological replicate explicitly.\n\nReporting requirements\nRecord inclusion criteria, replicate counts, assay processing, comparison metric and validation split before collecting outcomes. These details have not yet been supplied here.\n\nMechanistic requirement\nAn archive-retrieval interpretation would additionally require evidence for a physical carrier, an access route and causal use.\n\nThis is a prepared planning outline. No experiment or analysis has been performed.'},
    results:{title:'Published observations and open claims',body:'PUBLISHED OBSERVATIONS — PREPARED READING SUMMARY\n\nMooijman et al. (2016)\nSingle-cell 5hmC measurements enabled lineage reconstruction in early mouse embryos. Reconstructing lineage relationships is not recovery of the complete ancestral epigenome.\n\nLu et al. (2020)\nPartial reprogramming improved visual function in mouse models. Functional recovery alone does not demonstrate that a preserved cellular archive was read.\n\nSaiz et al. (2020)\nFGF4-mediated coupling helps coordinate lineage allocation in mouse blastocysts. Coordination is not evidence of a literal blockchain consensus mechanism.\n\nWHAT THIS DOES NOT ESTABLISH\nThese observations do not jointly demonstrate retrieval of a shared historical archive. The proposed archive mechanism remains a hypothesis.\n\nNEW RESULTS\nNone supplied or generated. The proposed clone-baseline comparison has not been performed.\n\nInspect the source passages before adding citations to the manuscript.'},
    figures:{title:'Figure and table storyboard',body:'FIGURE PLAN — NO DATA PLOT GENERATED\n\nFigure 1: Question and competing explanations\nA conceptual diagram separates archive retrieval, activation withdrawal and formation of a new state that resembles the past. Label all three as explanations to test.\n\nTable 1: What each selected study measured\n• Mooijman: early mouse embryo lineage reconstruction from 5hmC measurements.\n• Lu: visual function after partial reprogramming in mice.\n• Saiz: FGF4-mediated coordination of mouse blastocyst lineage allocation.\nFor each row include population, measured outcome, source and what it cannot establish.\n\nFigure 2: Proposed experimental comparison\nShow clone-specific baseline, perturbation and recovery, alongside the population reference and matched controls. Use a schematic, not simulated result curves.\n\nCAPTION NOTE\n“Proposed design. No experimental results are shown.”\n\nThis output is an editable storyboard; it does not create a scientific figure or analyze a dataset.'},
    title:{title:'Working title options',body:'PREPARED TITLE OPTIONS\n\n1. Cellular reversal: distinguishing historical-state retrieval from reconstruction\n\n2. Testing whether cellular recovery retains a clone-specific history\n\n3. Cellular Blockchain: a framework for testing distributed historical information\n\nSCOPE CHECK\nUse “framework,” “hypothesis” or “testing” while the mechanism remains unverified. A title claiming that cells retrieve a shared archive would exceed the selected evidence.\n\nThese are prepared options for author editing, not AI-generated conclusions.'},
    introduction:{title:'Introduction outline',body:'INTRODUCTION OUTLINE — PREPARED EXAMPLE\n\nContext\nLineage reconstruction, functional recovery and intercellular coordination raise related but distinct questions about biological information.\n\nWhat is known in the reading set\nThe selected studies address early mouse embryo lineage topology, visual recovery in mice and growth-factor-mediated lineage allocation. Their populations and inference targets differ.\n\nResearch gap\nA recovered function or a younger molecular marker does not by itself distinguish retrieval of historical information from the construction of a similar new state.\n\nQuestion\nDoes cellular reversal recover a clone-specific prior state, and what evidence would distinguish that explanation from alternatives?\n\nContribution proposed here\nA conceptual framework and experimental discriminator, not a demonstrated archive mechanism. Introduce “Cellular Blockchain” as an analogy and state its limits.\n\nVerify each factual sentence against the original paper before citation approval.'},
    discussion:{title:'Interpretation, alternatives and limitations',body:'DISCUSSION NOTES — PREPARED EXAMPLE\n\nInterpretation\nThe selected observations motivate a test of historical information retrieval, but they do not establish that mechanism.\n\nAlternative explanations\n• Withdrawal of an activating constraint.\n• Formation of a new state that resembles an earlier one.\n• Selection of cells already closer to the measured reference.\n• Regression to the mean or persistent environmental context.\n\nDiscriminating evidence\nCompare recovery toward a clone’s recorded baseline with recovery toward a matched population reference. Establish a candidate carrier, access route and causal use before attributing an effect to archive retrieval.\n\nLimitations\nThis reading set contains three selected papers, not a systematic review. Short prepared abstract excerpts cannot establish comprehensive support. Mouse findings do not establish effectiveness or safety in living humans.\n\nNext step\nSpecify the biological unit, controls, measurement budget and held-out validation before running the proposed comparison.'},
    abstract:{title:'Abstract working draft',body:'ABSTRACT — PREPARED CONCEPT-PAPER DRAFT\n\nCellular recovery can resemble an earlier biological state without establishing how that state was reached. This conceptual framework distinguishes retrieval of preserved historical information from activation withdrawal and formation of a similar new state. Selected studies of lineage reconstruction, mouse visual recovery and developmental coordination motivate the question but do not demonstrate a shared cellular archive. A proposed discriminator compares recovery toward a clone’s own recorded baseline with recovery toward a population reference while accounting for selection, regression to the mean and persistent context. Establishing archive retrieval would additionally require evidence for a physical carrier, an access route and causal use. No new experiment or dataset analysis is reported here.\n\nAuthor review required. This is a prepared example and has not been reconciled with your edited manuscript.'},
    references:{title:'Claim-to-source review map',body:'REFERENCE REVIEW PLAN — PREPARED EXAMPLE\n\nClaim: Single-cell 5hmC measurements enabled lineage reconstruction in early mouse embryos.\nCandidate: Mooijman et al. (2016).\nCheck: Match the wording to the measured mark, developmental stage and inference target.\n\nClaim: Partial reprogramming improved visual function in mice.\nCandidate: Lu et al. (2020).\nCheck: Keep the population and outcome explicit. Remove the unsupported “by reading a cellular archive” mechanism.\n\nClaim: FGF4-mediated coupling coordinates lineage allocation in mouse blastocysts.\nCandidate: Saiz et al. (2020).\nCheck: Coordination does not establish a blockchain protocol or historical archive retrieval.\n\nUNRESOLVED CLAIM\nThe selected papers do not establish retrieval of a shared historical archive. Keep this as a hypothesis requiring separate evidence.\n\nNEXT ACTION\nOpen Evidence review, inspect the exact source passage and decide whether it supports the sentence. Saving this plan does not approve any citation. No live search or AI assessment occurred.'},
    review:{title:'Author review checklist',body:'AUTHOR REVIEW CHECKLIST — NOT AN AUTOMATED VERDICT\n\n□ Each result identifies its source, population and measured outcome.\n□ Published observations are separated from hypotheses and proposed experiments.\n□ The abstract does not imply that the proposed clone-baseline comparison was completed.\n□ Methods state which procedures were performed and which are plans.\n□ Figures distinguish data from conceptual schematics.\n□ Alternative explanations and limits are stated.\n□ Citation passages have been inspected and individually approved.\n□ Unknown replicate counts, protocols and analysis settings remain explicit gaps.\n□ Title, abstract and discussion make the same level of claim.\n□ An author has reviewed the assembled manuscript before export.\n\nThis list is prepared guidance. No manuscript-wide scientific or submission check has run.'}
  };
  const genericBodies = {
    organizer:'PROJECT MAP\n\nResearch question\n[Define the population, context and outcome.]\n\nWork to connect\nData processing → Methods → Results → Figures → Discussion → Abstract → References → Final review.\n\nAuthor decisions\nRecord the paper’s intended contribution, the available evidence and the main unanswered question.\n\nNext step\nChoose one section and add its input material. Keep plans separate from completed work.',
    data:'DATA PROCESSING TEMPLATE\n\nData inventory\n[Source, license or access conditions, variables and biological or observational unit.]\n\nQuality checks\n[Missingness, duplicates, measurement quality, batch effects and prespecified exclusions.]\n\nAnalysis plan\n[Target, baseline, metric, split and held-out validation. Keep related observations together.]\n\nReproducibility\n[Code version, environment and processing decisions.]\n\nNo dataset has been loaded or analyzed.',
    methods:'METHODS TEMPLATE\n\nStudy design\n[Research question, design and comparison groups.]\n\nMaterials and participants\n[Source, inclusion criteria, biological unit and permissions when applicable.]\n\nProcedure\n[What was actually done, in reproducible order.]\n\nAnalysis\n[Prespecified metrics, controls, exclusions and validation.]\n\nPlanned work\n[Clearly label procedures that have not yet been performed.]\n\nNo experimental procedure has been inferred from your message.',
    results:'RESULTS TEMPLATE\n\nFinding 1\n[Measured outcome, comparison, uncertainty and linked analysis or source.]\n\nFinding 2\n[Independent observation or validation, if supplied.]\n\nNegative or inconclusive results\n[Report without converting absence of evidence into proof.]\n\nEvidence gaps\n[List missing measurements.]\n\nNo results or numerical estimates have been generated.',
    figures:'FIGURE AND TABLE TEMPLATE\n\nFigure 1\n[One message, source data, axes or diagram elements, and caption.]\n\nFigure 2\n[Validation or alternative explanation, where supported.]\n\nTable 1\n[Study or experiment, population, measurement, result and limitation.]\n\nCaption checks\nDefine the sample unit, uncertainty and any exclusions. Mark conceptual diagrams as schematics.\n\nNo figure or data plot has been generated.',
    title:'TITLE WORKSHEET\n\nCentral contribution\n[What does the paper establish or propose?]\n\nScope\n[Population, system or setting.]\n\nWorking title\n[Contribution] in [scope].\n\nClaim-strength check\nUse “association,” “framework” or “proposed” when warranted. Avoid causal or universal language unless the evidence supports it.',
    introduction:'INTRODUCTION TEMPLATE\n\nContext\n[Why the question matters.]\n\nPrior evidence\n[What relevant studies have established, with inspected sources.]\n\nGap\n[What remains uncertain.]\n\nQuestion and contribution\n[State what this paper investigates or proposes.]\n\nNo literature review has been performed.',
    discussion:'DISCUSSION TEMPLATE\n\nMain interpretation\n[Explain only the findings that have been supplied and reviewed.]\n\nAlternatives\n[Competing explanations and what would distinguish them.]\n\nLimitations\n[Design, measurement, sampling, access and generalizability.]\n\nNext study\n[A concrete test with a defined comparison.]\n\nNo causal interpretation has been validated.',
    abstract:'ABSTRACT TEMPLATE\n\nBackground\n[The problem and research gap.]\n\nApproach\n[What was actually done, or clearly describe a conceptual proposal.]\n\nResults\n[Only author-reviewed findings. Leave this blank if no results are available.]\n\nConclusion\n[What follows within the stated scope.]\n\nThis template has not summarized or checked your manuscript.',
    references:'REFERENCE REVIEW TEMPLATE\n\nFor each factual claim\n1. Identify the population, intervention or exposure, and outcome.\n2. Find a candidate paper.\n3. Inspect the actual supporting passage.\n4. Check study type, access limits and strength of inference.\n5. Approve, narrow or flag the sentence yourself.\n\nA DOI or an exact quote is not proof that a source supports a claim.\n\nNo search was run and no citation was approved.',
    review:'FINAL REVIEW TEMPLATE\n\n□ Title and abstract match the reviewed findings.\n□ Methods distinguish completed procedures from proposed work.\n□ Results identify the evidence for every major claim.\n□ Figures and tables have traceable source data.\n□ Uncertainty, alternatives and limitations are visible.\n□ Sources and exact supporting passages were inspected.\n□ Author decisions are recorded.\n□ The manuscript was reviewed before export.\n\nThis checklist is not a scientific validation or submission certification.'
  };
  function demoReply(stageId, prompt, ctx={}) {
    const stage = stageFor(stageId), sample = isSample(ctx);
    const example = sampleOutputs[stage.id];
    const heading = sample ? 'Prepared example for the Cellular Blockchain sample.' : 'Prepared template for this workspace.';
    const prefix = !sample && question(ctx) ? 'YOUR RESEARCH QUESTION (AS ENTERED)\n'+question(ctx)+'\n\n' : '';
    // The prompt is deliberately not used to imply semantic understanding.
    void prompt;
    return {
      text:heading+' This is a prewritten '+stage.label.toLowerCase()+' example, not an AI response to your message. Review and edit the output beside this conversation. Nothing has been added to your manuscript.',
      outputTitle:sample ? example.title : stage.label+' working template',
      outputBody:sample ? example.body : prefix+genericBodies[stage.id]+'\n\nPrepared template · no AI ran. Replace bracketed text with your own reviewed material.',
      sourceIds:sample && ['organizer','results','figures','introduction','discussion','abstract','references'].includes(stage.id) ? sourceIds(ctx) : []
    };
  }
  function newAgent(stage,ctx) {
    const intro = stage.id === 'organizer' ? 'Keep your paper connected here. Choose a section on the left to open its own conversation, inputs and editable output.' : 'This is your '+stage.label.toLowerCase()+' workspace. '+stage.description;
    return {
      messages:[{id:'welcome-'+stage.id,role:'assistant',text:intro+welcomeSuffix,provenance:prepared,at:null}],
      composer:'',output:{title:'',body:'',status:'draft',provenance:'Author',history:[]},inputs:[],tasks:[]
    };
  }
  function create(ctx={}) {
    const result = {version:1,activeStage:'organizer',activeTab:'chat',sideTab:'output',agents:Object.fromEntries(stages.map(stage=>[stage.id,newAgent(stage,ctx)])),tour:{seen:false,step:0}};
    if (isSample(ctx)) {
      const reply = demoReply('organizer','',ctx);
      result.agents.organizer.output = {...result.agents.organizer.output,title:reply.outputTitle,body:reply.outputBody,provenance:prepared};
    }
    return result;
  }
  function normalize(value,ctx={}) {
    const base = create(ctx);
    if (!record(value)) return value == null ? base : {...base,recovery:{original:clone(value)}};
    const result = {...clone(value),...base};
    const recovery = record(value.recovery) ? clone(value.recovery) : {};
    if ('recovery' in value && !record(value.recovery)) recovery.previousRecovery = clone(value.recovery);
    const preserve = (key,item) => {recovery[key] = clone(item);};
    // Preserve extensions at every level; repair only fields the UI consumes.
    for (const [key,item] of Object.entries(value)) if (!(key in base) && key!=='recovery') result[key]=clone(item);
    if ('version' in value && value.version!==1) preserve('version',value.version);
    if (stages.some(stage=>stage.id===value.activeStage)) result.activeStage=value.activeStage;
    else if ('activeStage' in value) preserve('activeStage',value.activeStage);
    if (['chat','inputs','output','activity'].includes(value.activeTab)) result.activeTab=value.activeTab;
    else if ('activeTab' in value) preserve('activeTab',value.activeTab);
    if (['output','context','inputs'].includes(value.sideTab)) result.sideTab=value.sideTab;
    else if ('sideTab' in value) preserve('sideTab',value.sideTab);
    if (record(value.tour)) result.tour={...clone(value.tour),seen:value.tour.seen===true,step:Number.isInteger(value.tour.step)&&value.tour.step>=0&&value.tour.step<=10?value.tour.step:0};
    else if ('tour' in value) preserve('tour',value.tour);
    if (record(value.agents)) {
      result.agents={...clone(value.agents),...base.agents};
      for (const stage of stages) {
        if (!(stage.id in value.agents)) continue;
        const original=value.agents[stage.id],fallback=base.agents[stage.id];
        if (!record(original)) {preserve('agents.'+stage.id,original);continue;}
        let repaired=false;
        const item={...clone(original),...fallback};
        for (const [key,field] of Object.entries(original)) if (!(key in fallback)) item[key]=clone(field);
        const boundedText=(key,max,fallbackValue='')=>{if(typeof original[key]==='string'){if(original[key].length>max)repaired=true;return original[key].slice(0,max);}if(key in original)repaired=true;return fallbackValue;};
        item.composer=boundedText('composer',4000);
        if (Array.isArray(original.messages)) {
          const seen=new Set();
          item.messages=original.messages.filter(message=>{
            const valid=record(message)&&typeof message.id==='string'&&message.id&&['assistant','user','author','system'].includes(message.role)&&typeof message.text==='string'&&!seen.has(message.id);
            if(valid)seen.add(message.id);else repaired=true;
            return valid;
          }).map(message=>{
            if(message.text.length>20000)repaired=true;
            const clean={...clone(message)};
            if('attachments' in clean){
              const originalFiles=clean.attachments;
              clean.attachments=(Array.isArray(originalFiles)?originalFiles:[]).filter(file=>record(file)&&typeof file.name==='string'&&typeof file.text==='string').slice(0,3).map(file=>({id:typeof file.id==='string'?file.id.slice(0,100):'',name:file.name.slice(0,180),text:file.text.slice(0,4200),kind:typeof file.kind==='string'?file.kind.slice(0,20):'Text',note:typeof file.note==='string'?file.note.slice(0,500):'',clipped:file.clipped===true||file.text.length>4200}));
              if(JSON.stringify(originalFiles)!==JSON.stringify(clean.attachments))repaired=true;
            }
            if(message.id==='welcome-'+stage.id&&message.role==='assistant'&&message.provenance===prepared&&message.text===fallback.messages[0].text.replace(welcomeSuffix,legacyWelcomeSuffix))clean.text=fallback.messages[0].text;
            if(clean.suggestedDraft!=null){const d=clean.suggestedDraft;if(!record(d)||typeof d.title!=='string'||typeof d.body!=='string'||d.title.length>180||d.body.length>6000){repaired=true;clean.suggestedDraft=null;}}
            return {...clean,text:clean.text.slice(0,20000),provenance:typeof message.provenance==='string'?message.provenance:message.role==='assistant'?prepared:'Author'};
          }).slice(-100);
          if(original.messages.length!==item.messages.length)repaired=true;
        } else if('messages' in original)repaired=true;
        if(record(original.output)) {
          const out=original.output;
          item.output={...clone(out),title:typeof out.title==='string'?out.title.slice(0,240):'',body:typeof out.body==='string'?out.body.slice(0,20000):'',status:out.status==='reviewed'?'reviewed':'draft',provenance:typeof out.provenance==='string'?out.provenance:'Author',history:Array.isArray(out.history)?out.history.filter(record).map(clone).slice(-20):[]};
          if(typeof out.title!=='string'||typeof out.body!=='string'||out.title.length>240||out.body.length>20000||!['draft','reviewed'].includes(out.status)||!Array.isArray(out.history)||out.history.length!==item.output.history.length)repaired=true;
        } else if('output' in original)repaired=true;
        if(Array.isArray(original.inputs)) {
          const seen=new Set();
          item.inputs=original.inputs.filter(input=>{
            const valid=record(input)&&typeof input.id==='string'&&input.id&&!seen.has(input.id);
            if(valid)seen.add(input.id);else repaired=true;return valid;
          }).map(input=>{
            const clean=clone(input);
            for(const field of ['text','body','content'])if(typeof clean[field]==='string'&&clean[field].length>20000){clean[field]=clean[field].slice(0,20000);repaired=true;}
            return clean;
          }).slice(0,40);
          if(original.inputs.length!==item.inputs.length)repaired=true;
        } else if('inputs' in original)repaired=true;
        if(Array.isArray(original.tasks)) {
          const seen=new Set();
          item.tasks=original.tasks.filter(task=>{
            const valid=record(task)&&typeof task.id==='string'&&task.id&&typeof task.text==='string'&&typeof task.done==='boolean'&&!seen.has(task.id);
            if(valid)seen.add(task.id);else repaired=true;return valid;
          }).map(task=>({...clone(task),text:task.text.slice(0,1000)})).slice(0,100);
          if(original.tasks.length!==item.tasks.length||original.tasks.some(task=>typeof task?.text==='string'&&task.text.length>1000))repaired=true;
        } else if('tasks' in original)repaired=true;
        result.agents[stage.id]=item;
        if(repaired)preserve('agents.'+stage.id,original);
      }
    } else if('agents' in value)preserve('agents',value.agents);
    if(Object.keys(recovery).length)result.recovery=recovery;
    return result;
  }
  window.PherogentStudioData = {stages,stageFor,create,normalize,demoReply,prepared};
})();
