/* Lee 2014 descriptive calculations. No network, model calls, or manuscript edits.
 * Source data: Lee et al. (2014), DOI 10.1038/ncomms6619, Supplementary Data 2.
 * JSON values retain the workbook's IEEE-754 values; no display rounding enters calculations.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PherogentLeeAnalysis = api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const COUNT = 7890;
  const EPSILONS = Object.freeze([0.02, 0.05, 0.1]);
  const SCHEDULES = Object.freeze(['day8', 'common', 'all_available']);
  const SAMPLES = Object.freeze(['2°MEF', 'D2H', 'D5H', 'D8H', 'D11H', 'D16H', 'D18H', 'D16L', 'D21L', 'D21Ø', '1°iPSC', '2°iPSC', 'ESC']);
  const COLUMNS = Object.freeze(['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T']);
  const DAYS = Object.freeze(['0', '2', '5', '8', '11', '16', '18', '21', '~30']);
  const GROUPS = new Set(['DMR_1a', 'DMR_1b', 'DMR_2a', 'DMR_2b', 'DMR_3']);
  const ROUTES = Object.freeze({
    continued_high: [['0', '2°MEF'], ['2', 'D2H'], ['5', 'D5H'], ['8', 'D8H'], ['11', 'D11H'], ['16', 'D16H'], ['18', 'D18H']],
    continued_low: [['0', '2°MEF'], ['2', 'D2H'], ['5', 'D5H'], ['8', 'D8H'], ['16', 'D16L'], ['21', 'D21L']],
    low_withdrawal: [['0', '2°MEF'], ['2', 'D2H'], ['5', 'D5H'], ['8', 'D8H'], ['21', 'D21Ø']],
    high_withdrawal: [['0', '2°MEF'], ['2', 'D2H'], ['5', 'D5H'], ['8', 'D8H'], ['11', 'D11H'], ['16', 'D16H'], ['18', 'D18H'], ['~30', '2°iPSC']],
  });
  const LABELS = Object.freeze({continued_low: 'Continued low', low_withdrawal: 'Low withdrawal'});
  const CLASS_LABELS = Object.freeze(['Near baseline at both phases', 'Delayed departure', 'Return after departure', 'Partial reversal', 'Persistent or further departure', 'Crossed baseline']);
  const FILE = 'sources/ncomms6619-s3.xlsx';
  const SHEET = 'Suppl_Data2';

  function refuse(code, reason) {
    const error = new Error(reason);
    error.name = 'LeeAnalysisError';
    error.code = code;
    throw error;
  }
  function sameArray(actual, expected) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((v, i) => actual[i] === v);
  }
  function validateData(data) {
    if (!data || data.schemaVersion !== 1 || data.study !== 'lee2014') refuse('invalid_dataset', 'This calculator requires the Lee 2014 dataset version 1.');
    if (!sameArray(data.samples, SAMPLES) || !sameArray(data.columns, COLUMNS)) refuse('invalid_samples', 'Source profile order or spreadsheet columns do not match the Lee workbook.');
    if (![data.features, data.groups, data.rows].every(a => Array.isArray(a) && a.length === COUNT)) refuse('incomplete_features', 'All 7,890 source regions and their workbook locators are required; a retrieved subset cannot be analyzed.');
    for (let i = 0; i < COUNT; i++) {
      if (data.features[i] !== 'DMR_' + (i + 1) || data.rows[i] !== i + 4 || !GROUPS.has(data.groups[i])) refuse('invalid_locator', 'A feature identifier, group, or workbook row differs from the source layout.');
    }
    if (!Array.isArray(data.values) || data.values.length !== SAMPLES.length) refuse('invalid_values', 'All 13 source profiles are required.');
    for (const values of data.values) {
      if (!Array.isArray(values) || values.length !== COUNT) refuse('incomplete_values', 'Each profile must include all 7,890 regions.');
      for (const value of values) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) refuse('invalid_fraction', 'Methylation fractions must be finite numbers between 0 and 1; missing values cannot be filled automatically.');
      }
    }
    if (!sameArray(data.routeConfig?.days, DAYS) || !data.routeConfig?.routes || Object.keys(data.routeConfig.routes).length !== 4) refuse('invalid_routes', 'The source route and day layout is missing or changed.');
    for (const [route, expected] of Object.entries(ROUTES)) {
      const visits = data.routeConfig.routes[route];
      if (!Array.isArray(visits) || visits.length !== expected.length || expected.some(([day, sample], i) => visits[i]?.day !== day || visits[i]?.sample_id !== sample)) refuse('invalid_route_assignment', 'Samples must stay on their source-supported route. D16L is not a low-withdrawal observation.');
    }
    return true;
  }
  function validateEpsilon(epsilon) {
    if (!EPSILONS.includes(epsilon)) refuse('invalid_tolerance', 'Choose a declared tolerance: 0.02, 0.05, or 0.10.');
  }
  function source(samples) {
    return {file: FILE, sheet: SHEET, rowStart: 4, rowEnd: 7893, columns: samples.map(sampleId => ({sampleId, column: COLUMNS[SAMPLES.indexOf(sampleId)]}))};
  }
  function valuesFor(data, sample) { return data.values[SAMPLES.indexOf(sample)]; }
  function tally(data, endpoint, intermediates, epsilon) {
    const baseline = valuesFor(data, SAMPLES[0]);
    const end = valuesFor(data, endpoint);
    const middle = intermediates.map(id => valuesFor(data, id));
    let returnCount = 0, endpointNearCount = 0;
    for (let i = 0; i < COUNT; i++) {
      const near = Math.abs(end[i] - baseline[i]) <= epsilon;
      if (near) {
        endpointNearCount++;
        if (middle.some(values => Math.abs(values[i] - baseline[i]) > epsilon)) returnCount++;
      }
    }
    return {returnCount, endpointNearCount, eligibleRegions: COUNT, returnFraction: returnCount / COUNT};
  }
  function analyze(data, options = {}) {
    validateData(data);
    if (!options || typeof options !== 'object' || Array.isArray(options)) refuse('invalid_options', 'Analysis options must specify a tolerance and sampling schedule.');
    const {epsilon = 0.05, schedule = 'common'} = options;
    validateEpsilon(epsilon);
    if (!SCHEDULES.includes(schedule)) refuse('invalid_schedule', 'Choose day8, common, or all_available; unmatched observations cannot be treated as matched.');
    if (Object.keys(options).some(key => !['epsilon', 'schedule'].includes(key))) refuse('invalid_options', 'Only tolerance and sampling schedule can be changed in this descriptive comparison.');
    const routes = ['continued_low', 'low_withdrawal'].map(route => {
      const endpoint = route === 'continued_low' ? 'D21L' : 'D21Ø';
      const intermediates = schedule === 'day8' ? ['D8H'] : ['D2H', 'D5H', 'D8H'];
      if (schedule === 'all_available' && route === 'continued_low') intermediates.push('D16L');
      return {route, label: LABELS[route], endpoint, intermediates,
        ...tally(data, endpoint, intermediates, epsilon), source: source(['2°MEF', ...intermediates, endpoint])};
    });
    return {study: 'lee2014', epsilon, schedule, eligibleRegions: COUNT, baseline: '2°MEF', endpointDay: '21',
      matchedSchedule: schedule !== 'all_available', routes, byRoute: Object.fromEntries(routes.map(row => [row.route, row])),
      calculation: 'browser', aiCalls: 0,
      definition: 'At least one selected intermediate differs from baseline by more than the tolerance, and the endpoint is within the tolerance of baseline.',
      warning: schedule === 'all_available' ? 'The continued-low route has an extra D16L observation. The opportunities to observe a departure are unequal.' : null};
  }
  function inspectRegion(data, featureId) {
    validateData(data);
    if (typeof featureId !== 'string' || !/^DMR_[1-9]\d{0,3}$/.test(featureId)) refuse('invalid_feature', 'Enter a source region ID such as DMR_81.');
    const i = Number(featureId.slice(4)) - 1;
    if (i < 0 || i >= COUNT || data.features[i] !== featureId) refuse('unknown_feature', 'That region is not present in the Lee source workbook.');
    const row = data.rows[i];
    const values = SAMPLES.map((sampleId, k) => ({sampleId, column: COLUMNS[k], cell: COLUMNS[k] + row, value: data.values[k][i]}));
    const get = id => data.values[SAMPLES.indexOf(id)][i];
    const baseline = get('2°MEF');
    return {featureId, group: data.groups[i], source: {file: FILE, sheet: SHEET, row}, values,
      deltas: {day8MinusBaseline: get('D8H') - baseline, lowMinusBaseline: get('D21L') - baseline,
        withdrawalMinusBaseline: get('D21Ø') - baseline, withdrawalMinusLow: get('D21Ø') - get('D21L')}};
  }
  function classifyDay8(data, options = {}) {
    validateData(data);
    if (!options || typeof options !== 'object' || Array.isArray(options)) refuse('invalid_options', 'Classification options must specify a source endpoint and tolerance.');
    const {endpoint, epsilon = 0.05} = options;
    validateEpsilon(epsilon);
    if (!['D16H', 'D16L', 'D21L', 'D21Ø'].includes(endpoint)) refuse('invalid_endpoint', 'This recorded day-8 comparison supports D16H, D16L, D21L, or D21Ø only.');
    if (Object.keys(options).some(key => !['endpoint', 'epsilon'].includes(key))) refuse('invalid_options', 'Only endpoint and tolerance are supported for the day-8 classification.');
    const base = valuesFor(data, '2°MEF'), mid = valuesFor(data, 'D8H'), end = valuesFor(data, endpoint);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < COUNT; i++) {
      const a = mid[i] - base[i], b = end[i] - base[i];
      const code = Math.abs(a) <= epsilon ? (Math.abs(b) <= epsilon ? 0 : 1) :
        Math.abs(b) <= epsilon ? 2 : a * b < 0 ? 5 : Math.abs(b) < Math.abs(a) ? 3 : 4;
      counts[code]++;
    }
    return {endpoint, epsilon, baseline: '2°MEF', intermediate: 'D8H', eligibleRegions: COUNT,
      classes: counts.map((count, id) => ({id, label: CLASS_LABELS[id], count, fraction: count / COUNT})),
      source: source(['2°MEF', 'D8H', endpoint]), aiCalls: 0};
  }
  return Object.freeze({validateData, analyze, inspectRegion, classifyDay8, EPSILONS, SCHEDULES});
});
