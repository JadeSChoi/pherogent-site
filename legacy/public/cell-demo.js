'use strict';
(() => {
  const D = window.PHEROGENT_DATA;
  const paperIds = ['MED:27347753', 'MED:33268865', 'MED:32720894'];
  const question = 'Does cellular reversal retrieve a preserved state, or produce a new state that resembles the past?';
  // Short teaching adaptation, not a public copy of the source manuscript.
  const attribution = 'Adapted from Cellular Blockchain: A Developmental Model of Distributed Epigenetic Information, v1.1 (Jung In Choi), sections 5, 8 and proposed test E5. This is an illustrative workspace, not the full manuscript or a completed experiment.';
  Object.assign(D.papers, {
    'MED:27347753': {
      title:'Single-cell 5hmC sequencing reveals chromosome-wide cell-to-cell variability and enables lineage reconstruction',
      authors:['Mooijman D','Dey SS','Boisset JC','Crosetto N','van Oudenaarden A'],year:2016,journal:'Nature Biotechnology',
      doi:'10.1038/nbt.3598',pmid:'27347753',url:'https://www.nature.com/articles/nbt.3598',
      evidence_excerpt:'reconstruct lineages of two- and four-cell mouse embryos',evidence_location:'Abstract',
      evidence_scope:'Single-cell 5hmC measurements and mathematical modelling reconstruct early mouse embryo lineages. This does not demonstrate recovery of the original zygote epigenome or an endogenous archive-reading mechanism.',
      reviewed_material:'abstract',metadata_source:'https://pubmed.ncbi.nlm.nih.gov/27347753/',checked_on:'2026-10-24'
    },
    'MED:32720894': {
      title:'Growth-factor-mediated coupling between lineage size and cell fate choice underlies robustness of mammalian development',
      authors:['Saiz N','Mora-Bitria L','Rahman S','George H','Herder JP','Garcia-Ojalvo J','Hadjantonakis AK'],year:2020,journal:'eLife',
      doi:'10.7554/eLife.56079',pmid:'32720894',pmcid:'PMC7513828',url:'https://elifesciences.org/articles/56079',
      evidence_excerpt:'FGF4 couples fate decisions to lineage composition through changes in local growth factor concentration',evidence_location:'Abstract',
      evidence_scope:'Mouse blastocyst lineage allocation and mathematical modelling support growth-factor-mediated coordination. They do not establish blockchain consensus, a universal shared threshold, or retrieval of historical cell states.',
      reviewed_material:'abstract',metadata_source:'https://elifesciences.org/articles/56079',checked_on:'2026-10-24'
    }
  });
  // Append only: existing saved projects refer to scenarios 0–2 by index.
  D.scenarios.push(
    {id:'cell_lineage',title:'A measured finding',claim:'Single-cell 5hmC sequencing enabled lineage reconstruction in two- and four-cell mouse embryos.',
      verdict:'Supported within this study’s scope',status:'supports',short_reason:'Mooijman and colleagues reconstructed lineage relationships from measurements. This is not reconstruction of a complete historical cell state.',
      preferred_paper_id:paperIds[0],revised_claim:null,next_action:'Inspect the abstract excerpt, then approve the citation for this limited claim.',action_label:'Insert citation',
      evidence:[{paper_id:paperIds[0],fit:'supports',explanation:'Matches the measured mark, lineage target and early mouse embryo context.',excerpt_ref:paperIds[0]}],
      takeaway:'Reconstructing who descended from whom is different from recovering every feature of an ancestral cell.'},
    {id:'cell_archive_mechanism',title:'Recovery is not proof of the mechanism',claim:'Partial reprogramming restores vision in mice by reading a preserved cellular archive.',
      verdict:'Needs narrower wording',status:'partial',short_reason:'Lu reports visual recovery in mice. The quoted outcome does not distinguish retrieval of a preserved record from formation of a similar new state.',
      preferred_paper_id:paperIds[1],revised_claim:'Partial reprogramming improved visual function in older mice and in a mouse glaucoma model.',
      next_action:'Remove the unestablished archive-reading mechanism from this evidence claim, then cite the measured mouse outcome.',action_label:'Apply revision & cite',
      evidence:[{paper_id:paperIds[1],fit:'partial',explanation:'Supports functional recovery in mice. This passage does not demonstrate the proposed archive carrier, access route or causal use.',excerpt_ref:paperIds[1]}],
      takeaway:'Keep the measured result in the evidence sentence and the archive mechanism in the hypothesis.'},
    {id:'cell_unproven_archive',title:'A hypothesis still needs a test',claim:'These studies establish that tissues retrieve a shared cellular archive during reprogramming.',
      verdict:'Not established by these sources',status:'unsupported',short_reason:'The selected papers examine lineage reconstruction, visual recovery and cell-fate coordination. They do not jointly establish retrieval of a shared historical archive.',
      preferred_paper_id:null,revised_claim:null,next_action:'Mark this as needing evidence. In the research brief, retain archive retrieval as a proposed explanation to test.',action_label:'Mark as needs evidence',
      evidence:paperIds.map((id,i)=>({paper_id:id,fit:'not_supporting',explanation:[
        'Reconstruction by an investigator does not demonstrate historical information being read by the embryo.',
        'A recovered function alone does not distinguish archive retrieval from a newly formed state.',
        'FGF4-mediated coordination is not evidence that cells run blockchain protocols or retrieve a historical archive.'
      ][i],excerpt_ref:id})),takeaway:'A useful analogy can generate a testable hypothesis without being an established biological mechanism.'}
  );
  window.PHEROGENT_CELL_DEMO = {
    version:'cellular-reversal-v1',question,attribution,paperIds,scenarioIndices:[3,4,5],tutorialScenario:4,tutorialPaper:paperIds[1],
    manuscriptIntro:'## Research question\n\n'+question+'\n\nThis short teaching adaptation separates published observations, an unproven explanation and a proposed test. The review sentences below deliberately include overclaims for practice; they are not quotations from the original paper.\n\n## Evidence sentences to review\n\n',
    manuscriptDiscussion:'## Working hypothesis — untested\n\nArchive retrieval is one proposed explanation for cellular reversal. Alternatives include removing an activating constraint or producing a new state that resembles an earlier one. A blockchain analogy does not establish literal cellular hashes or a consensus protocol.\n\n## Proposed discriminator — not performed\n\nCompare recovery toward a clone’s own recorded baseline with recovery toward a population average. Track lineages and account for regression to the mean, selection and persistent context. An archive claim would also require evidence for a physical carrier, an access route and causal use.\n\n## Scope\n\n'+attribution,
    sampleResearch:{
      question,aim:'Separate what the three selected papers measured from what the Cellular Blockchain framework proposes. Use the distinction to design a test of historical information retrieval.',
      hypothesis:'Untested: some reversal might depend on preserved historical information. Competing explanations are activation withdrawal and formation of a new state resembling an earlier state. “Cellular Blockchain” is a conceptual analogy, not evidence that cells compute hashes.',
      dataNotes:'Prepared reading set: Mooijman (2016), Lu (2020) and Saiz (2020). Record each study’s population, measurement and inference target. Lineage topology, the original zygote state and functional recovery are different targets. No new dataset or experiment has been run.',
      analysisNotes:'PUBLISHED OBSERVATIONS\nMooijman: measured 5hmC patterns permit reconstruction of early mouse embryo lineages.\nLu: partial reprogramming improved visual outcomes in mice.\nSaiz: FGF4-mediated coupling helps coordinate mouse blastocyst fate allocation.\n\nINTERPRETATION\nThese motivate questions about inherited information, recovery and coordination. None of these observations alone establishes archive retrieval. A younger clock or recovered function cannot distinguish the three proposed reversal mechanisms.\n\nPROVENANCE\n'+attribution,
      limitations:'Three selected papers, not a systematic review. The bundled passages are short abstract excerpts. Lineage reconstruction is not recovery of a full ancestral epigenome; coordination is not blockchain consensus. Proposed tests are not results. No claim of clinical efficacy follows.',
      nextExperiment:'Proposed E5 comparison, not performed: record clone-specific baseline patterns, follow lineages through perturbation and recovery, and compare return toward the clone’s own baseline versus a population average. Include matched controls and address regression to the mean, selection and persistent context. Before calling a result archive retrieval, identify a carrier, access route and causal use. For pooled reconstruction, match measurement budgets and validate on held-out embryos.',
      tasks:[
        {id:'sample-task-scope',text:'Separate each measured finding from the archive hypothesis',done:false},
        {id:'sample-task-wording',text:'Remove the unsupported mechanism from the vision sentence',done:false},
        {id:'sample-task-discriminator',text:'Define what would distinguish archive retrieval from a similar new state',done:false}
      ],savedSources:paperIds.slice(),sourceNotes:{
        'MED:27347753':{tag:'useful',note:'Established target: early mouse embryo lineage topology from 5hmC measurements. This is not recovery of the full zygote epigenome or evidence of endogenous archive access.'},
        'MED:33268865':{tag:'useful',note:'Established outcome: visual recovery in mice. The proposed archive-reading mechanism requires separate evidence for its carrier, access route and causal use.'},
        'MED:32720894':{tag:'useful',note:'Established context: growth-factor-mediated coordination in mouse development. Do not interpret coordination as proof of blockchain consensus or archive retrieval.'}
      }
    }
  };
})();
