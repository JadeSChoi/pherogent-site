'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const directory = path.join(__dirname, '../public/data/lee2014');
const read = name => fs.readFileSync(path.join(directory, name), 'utf8');
const data = JSON.parse(read('data.json'));
const context = {module: {exports: {}}, window: {}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/lee-analysis.js'), 'utf8'), context);
const A = context.module.exports;
const clone = value => JSON.parse(JSON.stringify(value));
const csv = name => {
  // The six frozen numeric reconstruction CSVs contain no quoted commas.
  const [header, ...lines] = read(name).trim().split('\n').map(row => row.split(','));
  return lines.map(row => Object.fromEntries(header.map((key, i) => [key, row[i]])));
};
const throwsCode = (fn, code) => assert.throws(fn, error => error.name === 'LeeAnalysisError' && error.code === code);

test('classic browser global and CommonJS adapter expose the same API without network capabilities', () => {
  assert.equal(A, context.window.PherogentLeeAnalysis);
  assert.equal(A.validateData(data), true);
  assert.equal(data.values.length * data.features.length, 102570);
  assert.equal(data.features.length, 7890);
  // No fetch, process or model mocks are provided to the VM. Real calculations below complete regardless.
});

test('public data, six CSVs and verification files retain their frozen hashes', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const [name, hash] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex'), hash, name);
  }
  assert.equal(manifest.valuesCheckedAgainstWorkbook, 102570);
  assert.equal(manifest.valuesEqualAfterJSONRoundtrip, true);
  const verification = JSON.parse(read('verification.json'));
  for (const [name, hash] of Object.entries(verification.output_sha256)) assert.equal(manifest.files[name], hash, name);
  const proof = JSON.parse(read('reproduction.json'));
  for (const row of proof.files) assert.equal(manifest.files[row.file], row.regenerated_sha256, row.file);
});

test('six archived schedule counts and denominators reproduce from every source row', () => {
  for (const expected of csv('return_schedules.csv')) {
    const result = A.analyze(data, {epsilon: Number(expected.epsilon), schedule: expected.schedule});
    const row = result.byRoute[expected.route];
    assert.equal(row.returnCount, Number(expected.return_count));
    assert.equal(row.endpointNearCount, Number(expected.endpoint_near_count));
    assert.equal(row.eligibleRegions, Number(expected.eligible_regions));
    assert.equal(row.returnFraction, Number(expected.return_fraction));
    assert.equal(row.intermediates.join(';'), expected.intermediates);
    assert.equal(row.source.rowStart, 4);
    assert.equal(row.source.rowEnd, 7893);
    assert.equal(result.aiCalls, 0);
    assert.equal(result.calculation, 'browser');
  }
});

test('all 72 recorded path-class counts reproduce, including all 12 table-4 return counts', () => {
  for (const expected of csv('path_classes.csv')) {
    const result = A.classifyDay8(data, {epsilon: Number(expected.epsilon), endpoint: expected.endpoint});
    assert.equal(result.classes[Number(expected.class_id)].count, Number(expected.count), `${expected.endpoint}/${expected.epsilon}/${expected.class_id}`);
    assert.equal(result.classes.reduce((n, item) => n + item.count, 0), 7890);
  }
});

test('all 18 tolerance/schedule comparisons match a separate direct-workbook audit', () => {
  // Independently calculated from openpyxl source rows by the review task, not from this JS module.
  const expected = [
    [.02, 'day8', 392, 408, 554, 560], [.02, 'common', 497, 514, 554, 560], [.02, 'all_available', 523, 514, 554, 560],
    [.05, 'day8', 524, 665, 1346, 1433], [.05, 'common', 737, 831, 1346, 1433], [.05, 'all_available', 927, 831, 1346, 1433],
    [.1, 'day8', 384, 617, 2645, 2802], [.1, 'common', 446, 675, 2645, 2802], [.1, 'all_available', 828, 675, 2645, 2802],
  ];
  for (const [epsilon, schedule, low, off, nearLow, nearOff] of expected) {
    const result = A.analyze(data, {epsilon, schedule});
    assert.equal(result.routes[0].returnCount, low);
    assert.equal(result.routes[1].returnCount, off);
    assert.equal(result.routes[0].endpointNearCount, nearLow);
    assert.equal(result.routes[1].endpointNearCount, nearOff);
  }
});

test('unequal observation schedules remain explicitly unmatched; no extra withdrawal visit is invented', () => {
  const matched = A.analyze(data, {epsilon: .05, schedule: 'common'});
  assert.equal(matched.matchedSchedule, true);
  assert.equal(matched.warning, null);
  const all = A.analyze(data, {epsilon: .05, schedule: 'all_available'});
  assert.equal(all.matchedSchedule, false);
  assert.match(all.warning, /unequal/);
  assert.equal(all.byRoute.continued_low.intermediates.includes('D16L'), true);
  assert.equal(all.byRoute.low_withdrawal.intermediates.includes('D16L'), false);
  assert.equal(data.routeConfig.routes.low_withdrawal.some(item => item.day === '16'), false);
  assert.equal(Object.values(data.routeConfig.routes).reduce((sum, visits) => sum + visits.length, 0), 26);
  assert.equal(data.routeConfig.days.length, 9);
});

test('source region inspection reproduces all archived example values, differences, and cells', () => {
  for (const expected of csv('examples.csv')) {
    const actual = A.inspectRegion(data, expected.feature_id);
    const get = sample => actual.values.find(row => row.sampleId === sample);
    assert.equal(actual.source.row, Number(expected.source_row));
    assert.equal(actual.source.sheet, expected.source_sheet);
    assert.equal(actual.source.file, expected.source_file);
    for (const [sample, field] of [['2°MEF', 'baseline'], ['D8H', 'day8'], ['D21L', 'continued_low'], ['D21Ø', 'withdrawal']]) {
      assert.equal(get(sample).value, Number(expected[field]));
      assert.equal(get(sample).cell, expected[field + '_cell']);
    }
    for (const [key, field] of [['day8MinusBaseline', 'day8_minus_baseline'], ['lowMinusBaseline', 'low_minus_baseline'], ['withdrawalMinusBaseline', 'withdrawal_minus_baseline'], ['withdrawalMinusLow', 'withdrawal_minus_low']]) {
      assert.equal(actual.deltas[key], Number(expected[field]));
    }
    assert.equal(actual.values.length, 13);
  }
});

test('the rounding discrepancy is disclosed and the original archive is never claimed recovered', () => {
  const actual = A.inspectRegion(data, 'DMR_6652');
  assert.equal(actual.deltas.withdrawalMinusLow.toFixed(4), '0.0563');
  assert.equal(data.metadata.roundingDiscrepancy.expected, 0.0562);
  assert.equal(data.metadata.roundingDiscrepancy.actual, actual.deltas.withdrawalMinusLow);
  assert.equal(data.metadata.originalArchiveAvailable, false);
  assert.equal(data.metadata.reconstruction, true);
  assert.equal(data.metadata.reproduction.outputsByteIdentical, true);
  assert.equal(data.metadata.reproduction.outputFilesChecked, 7);
  assert.equal(data.metadata.reproduction.allReportValuesMatch, false);
  assert.equal(data.metadata.reproduction.reportChecksPassed, 58);
  assert.equal(data.metadata.reproduction.reportChecksTotal, 59);
  assert.equal(data.metadata.observationStructure.independent_biological_units, null);
  assert.match(data.metadata.limitations.join(' '), /not independent biological replicates/);
  assert.match(data.metadata.limitations.join(' '), /not an exact return/);
});

test('the calculator recomputes from supplied source values rather than returning prewritten totals', () => {
  const changed = clone(data);
  // DMR_81 is a qualifying withdrawal return at epsilon .05 in the original data.
  assert.equal(A.analyze(data, {schedule: 'day8'}).byRoute.low_withdrawal.returnCount, 665);
  const i = changed.features.indexOf('DMR_81');
  changed.values[3][i] = changed.values[0][i]; // remove its D8 departure in this isolated test only
  assert.equal(A.analyze(changed, {schedule: 'day8'}).byRoute.low_withdrawal.returnCount, 664);
});

test('partial datasets, source misalignment, missing values and non-finite fractions are refused', () => {
  const cases = [
    [d => d.features.pop(), 'incomplete_features'],
    [d => d.values[0].pop(), 'incomplete_values'],
    [d => d.values.pop(), 'invalid_values'],
    [d => d.samples.reverse(), 'invalid_samples'],
    [d => d.columns[0] = 'A', 'invalid_samples'],
    [d => d.features[0] = 'invented', 'invalid_locator'],
    [d => d.rows[0] = 99, 'invalid_locator'],
    [d => d.groups[0] = 'invented', 'invalid_locator'],
    [d => d.values[0][0] = null, 'invalid_fraction'],
    [d => d.values[0][0] = '0.2', 'invalid_fraction'],
    [d => d.values[0][0] = NaN, 'invalid_fraction'],
    [d => d.values[0][0] = Infinity, 'invalid_fraction'],
    [d => d.values[0][0] = 1.01, 'invalid_fraction'],
    [d => d.values[0][0] = -0.01, 'invalid_fraction'],
  ];
  for (const [mutate, code] of cases) {const changed = clone(data); mutate(changed); throwsCode(() => A.analyze(changed), code);}
});

test('invented D16 withdrawal observations, route reassignment, and missing time slots are refused', () => {
  for (const mutate of [
    d => d.routeConfig.routes.low_withdrawal.splice(4, 0, {day: '16', sample_id: 'D16L'}),
    d => d.routeConfig.routes.continued_low[4].sample_id = 'D16H',
    d => d.routeConfig.routes.continued_high.pop(),
    d => d.routeConfig.routes.high_withdrawal.at(-1).day = '30',
  ]) {const changed = clone(data); mutate(changed); throwsCode(() => A.validateData(changed), 'invalid_route_assignment');}
});

test('unknown tolerances, schedules, regions, or unsupported analysis options are refused', () => {
  for (const epsilon of [0, .03, .051, '0.05', NaN, Infinity, null]) throwsCode(() => A.analyze(data, {epsilon}), 'invalid_tolerance');
  for (const schedule of ['matched', 'invented', null, 1]) throwsCode(() => A.analyze(data, {schedule}), 'invalid_schedule');
  for (const options of [null, [], 1, 'common']) throwsCode(() => A.analyze(data, options), 'invalid_options');
  throwsCode(() => A.analyze(data, {replicates: 7890}), 'invalid_options');
  throwsCode(() => A.analyze(data, {features: ['DMR_81']}), 'invalid_options');
  for (const id of ['DMR_0', 'DMR_081', '<script>', '', 81, null]) throwsCode(() => A.inspectRegion(data, id), 'invalid_feature');
  throwsCode(() => A.inspectRegion(data, 'DMR_7891'), 'unknown_feature');
  throwsCode(() => A.classifyDay8(data, null), 'invalid_options');
  throwsCode(() => A.classifyDay8(data, {endpoint: 'D16Ø'}), 'invalid_endpoint');
});
