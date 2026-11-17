// PROTOTYPE — round-2 sample data (issue #3). Realistic full content shared by
// directions D and E: a 20-paper library and a manuscript page with evidence
// checks in several states. Throwaway.

export type Paper = {
  id: number;
  authors: string;
  year: number;
  title: string;
  journal: string;
  cited: number; // citations in the manuscript
  checks: { supported: number; caution: number; unsupported: number } | null;
  added: string;
};

export const papers: Paper[] = [
  { id: 1, authors: "Lu, Krishnan, Wang et al.", year: 2020, title: "Reprogramming to recover youthful epigenetic information and restore vision", journal: "Nature", cited: 3, checks: { supported: 1, caution: 1, unsupported: 0 }, added: "2 Nov" },
  { id: 2, authors: "Ocampo, Reddy, Martinez-Redondo et al.", year: 2016, title: "In vivo amelioration of age-associated hallmarks by partial reprogramming", journal: "Cell", cited: 2, checks: { supported: 2, caution: 0, unsupported: 0 }, added: "2 Nov" },
  { id: 3, authors: "Sarkar, Florian, Racine et al.", year: 2020, title: "Transient non-integrative expression of nuclear reprogramming factors promotes multifaceted amelioration of aging in human cells", journal: "Nature Communications", cited: 2, checks: { supported: 1, caution: 0, unsupported: 0 }, added: "3 Nov" },
  { id: 4, authors: "Browder, Reddy, Yamamoto et al.", year: 2022, title: "In vivo partial reprogramming alters age-associated molecular changes during physiological aging in mice", journal: "Nature Aging", cited: 1, checks: { supported: 0, caution: 0, unsupported: 1 }, added: "3 Nov" },
  { id: 5, authors: "Gill, Vrtačnik, Ocampo et al.", year: 2022, title: "Multi-omic rejuvenation of human cells by maturation phase transient reprogramming", journal: "eLife", cited: 1, checks: { supported: 1, caution: 0, unsupported: 0 }, added: "4 Nov" },
  { id: 6, authors: "Yang, Lu, Sinclair et al.", year: 2023, title: "Loss of epigenetic information as a cause of mammalian aging", journal: "Cell", cited: 1, checks: { supported: 1, caution: 0, unsupported: 0 }, added: "4 Nov" },
  { id: 7, authors: "Takahashi & Yamanaka", year: 2006, title: "Induction of pluripotent stem cells from mouse embryonic and adult fibroblast cultures by defined factors", journal: "Cell", cited: 1, checks: null, added: "4 Nov" },
  { id: 8, authors: "Horvath", year: 2013, title: "DNA methylation age of human tissues and cell types", journal: "Genome Biology", cited: 1, checks: null, added: "5 Nov" },
  { id: 9, authors: "Hannum, Guinney, Zhao et al.", year: 2013, title: "Genome-wide methylation profiles reveal quantitative views of human aging rates", journal: "Molecular Cell", cited: 0, checks: null, added: "5 Nov" },
  { id: 10, authors: "Abad, Mosteiro, Pantoja et al.", year: 2013, title: "Reprogramming in vivo produces teratomas and iPS cells with totipotency features", journal: "Nature", cited: 0, checks: null, added: "6 Nov" },
  { id: 11, authors: "Ohnishi, Semi, Yamamoto et al.", year: 2014, title: "Premature termination of reprogramming in vivo leads to cancer development through altered epigenetic regulation", journal: "Cell", cited: 0, checks: null, added: "6 Nov" },
  { id: 12, authors: "Olova, Simpson, Marioni & Chandra", year: 2019, title: "Partial reprogramming induces a steady decline in epigenetic age before loss of somatic identity", journal: "Aging Cell", cited: 1, checks: null, added: "7 Nov" },
  { id: 13, authors: "Petkovich, Podolskiy, Lobanov et al.", year: 2017, title: "Using DNA methylation profiling to evaluate biological age and longevity interventions", journal: "Cell Metabolism", cited: 0, checks: null, added: "7 Nov" },
  { id: 14, authors: "Chondronasiou, Gill, Mosteiro et al.", year: 2022, title: "Multi-omic rejuvenation of naturally aged tissues by a single cycle of transient reprogramming", journal: "Aging Cell", cited: 0, checks: null, added: "8 Nov" },
  { id: 15, authors: "Alle, Palazzo, Guerrero et al.", year: 2022, title: "A single short reprogramming early in life initiates and propagates an epigenetically related mechanism improving fitness and promoting an increased healthy lifespan", journal: "Aging Cell", cited: 0, checks: null, added: "8 Nov" },
  { id: 16, authors: "Hishida, Yamamoto, Hishida-Nozaki et al.", year: 2022, title: "In vivo partial cellular reprogramming enhances liver plasticity and regeneration", journal: "Cell Reports", cited: 0, checks: null, added: "9 Nov" },
  { id: 17, authors: "Roux, Zhang, Paw et al.", year: 2022, title: "Diverse reprogramming codes for neuronal identity reveal transient suppression of cell identity programs", journal: "Cell Systems", cited: 0, checks: null, added: "10 Nov" },
  { id: 18, authors: "Buckley, Sun, Marion et al.", year: 2023, title: "Cell-type-specific aging clocks to quantify aging and rejuvenation in neurogenic regions of the brain", journal: "Nature Aging", cited: 0, checks: null, added: "11 Nov" },
  { id: 19, authors: "Macip, Hasan, Hoznek et al.", year: 2024, title: "Gene therapy-mediated partial reprogramming extends lifespan and reverses age-related changes in aged mice", journal: "Cellular Reprogramming", cited: 0, checks: null, added: "12 Nov" },
  { id: 20, authors: "Kerepesi, Zhang, Lee et al.", year: 2021, title: "Epigenetic clocks reveal a rejuvenation event during embryogenesis followed by aging", journal: "Science Advances", cited: 0, checks: null, added: "13 Nov" },
];

export type CheckState =
  | "supported"
  | "narrower"
  | "unsupported"
  | "unchecked"
  | "resolved";

export type CheckNote = {
  verdict: string;
  detail: string;
  source?: string;
  quote?: string;
  suggestion?: string;
};

export type Sentence = {
  text: string;
  state?: CheckState;
  note?: CheckNote;
  selected?: boolean;
};

export const manuscript = {
  title: "Partial reprogramming and visual recovery",
  project: "Reprogramming & visual recovery",
  words: 412,
  edited: "2 hours ago",
  paragraphs: [
    [
      {
        text: "Ageing is accompanied by a progressive loss of epigenetic information, and partial reprogramming has emerged as a strategy for restoring it.",
        state: "supported",
        note: {
          verdict: "Supported",
          detail: "Matches the central claim of the cited in-vivo reprogramming study.",
          source: "Ocampo et al., Cell, 2016",
          quote: "cyclic induction of reprogramming factors ameliorates hallmarks of ageing",
        },
      },
      {
        text: "Transient expression of reprogramming factors reduces the DNA-methylation age of cultured human fibroblasts without erasing somatic identity.",
        state: "resolved",
        note: {
          verdict: "Decision recorded",
          detail: "Reworded from “resets” to “reduces” on 12 Nov; narrower wording accepted.",
          source: "Sarkar et al., Nature Communications, 2020",
        },
      },
      {
        text: "Partial reprogramming can reverse vision loss in people with glaucoma.",
        state: "narrower",
        selected: true,
        note: {
          verdict: "Needs narrower wording",
          detail: "The study population is mice, not people. Cite this source only after correcting the population in the sentence.",
          source: "Lu et al., Nature, 2020",
          quote: "reverses vision loss in a mouse model of glaucoma and in aged mice",
          suggestion: "Partial reprogramming restored vision in a mouse model of glaucoma.",
        },
      },
    ],
    [
      {
        text: "In aged mice, reprogramming retinal ganglion cells restored axon regeneration after optic-nerve crush injury.",
        state: "supported",
        note: {
          verdict: "Supported",
          detail: "Direct match to the paper's primary finding.",
          source: "Lu et al., Nature, 2020",
        },
      },
      {
        text: "These benefits persist for at least a year after treatment ends.",
        state: "unsupported",
        note: {
          verdict: "Not supported",
          detail: "No source in the library measures durability after treatment stops; Browder et al. report effects only during continuous treatment.",
          source: "Browder et al., Nature Aging, 2022",
        },
      },
      {
        text: "The practical question is therefore not whether reprogramming can restore lost function, but how much restoration survives contact with ageing tissue in vivo.",
      },
    ],
    [
      {
        text: "Safety remains the central obstacle: sustained expression of reprogramming factors drives teratoma formation in vivo.",
        state: "unchecked",
        note: {
          verdict: "Not checked",
          detail: "Two library sources likely speak to this claim.",
        },
      },
      {
        text: "Dose and duration therefore define a narrow therapeutic window, and most recent protocols favour cyclic or single-cycle induction.",
      },
    ],
  ] as Sentence[][],
};

export const libraryCounts = {
  all: papers.length,
  cited: papers.filter((p) => p.cited > 0).length,
  flagged: papers.filter((p) => p.checks && (p.checks.caution > 0 || p.checks.unsupported > 0)).length,
};
