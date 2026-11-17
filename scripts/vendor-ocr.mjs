import {createRequire} from 'node:module';
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url),out=new URL('../public/vendor/ocr/',import.meta.url);
const pkg=name=>dirname(require.resolve(name+'/package.json'));
const tesseract=pkg('tesseract.js'),core=pkg('tesseract.js-core'),eng=pkg('@tesseract.js-data/eng');
for(const [directory,expected] of [[tesseract,'7.0.0'],[core,'7.0.0'],[eng,'1.0.0']]){
  if(JSON.parse(readFileSync(join(directory,'package.json'))).version!==expected)throw Error('Review and test the pinned OCR worker protocol before upgrading its dependency.');
}
mkdirSync(out,{recursive:true});
copyFileSync(join(tesseract,'dist/worker.min.js'),new URL('worker.min.js',out));
copyFileSync(join(tesseract,'dist/worker.min.js.LICENSE.txt'),new URL('worker.min.js.LICENSE.txt',out));
// These distributions embed their WASM bytes. The worker chooses the supported
// LSTM variant; legacy OCR and legacy language data are deliberately not enabled.
for(const variant of ['lstm','simd-lstm','relaxedsimd-lstm'])copyFileSync(join(core,'tesseract-core-'+variant+'.wasm.js'),new URL('tesseract-core-'+variant+'.wasm.js',out));
copyFileSync(join(eng,'4.0.0_best_int/eng.traineddata.gz'),new URL('eng.traineddata.gz',out));
copyFileSync(join(tesseract,'LICENSE.md'),new URL('tesseract-LICENSE',out));
copyFileSync(join(core,'LICENSE'),new URL('core-LICENSE',out));
copyFileSync(join(eng,'package.json'),new URL('english-package.json',out));
writeFileSync(new URL('README.md',out),'# Optional local OCR\n\nLocally served, unmodified pinned distributions. File images never go to a CDN or OCR service.\n\n- Tesseract.js 7.0.0, worker distribution (Apache-2.0). https://github.com/naptha/tesseract.js\n- Tesseract.js Core 7.0.0, LSTM WASM-in-JS builds including SIMD and relaxed SIMD (Apache-2.0). https://github.com/naptha/tesseract.js-core\n- @tesseract.js-data/eng 1.0.0, compact 4.0.0_best_int English model, package metadata retained. https://github.com/naptha/tessdata\n\n`public/attachment-ocr.js` uses the pinned worker message protocol so it can terminate the worker even while initialization is pending. Changes to this dependency require the actual-worker OCR test and browser QA. Reproduce these assets with `node scripts/vendor-ocr.mjs`.\n');
console.log('Vendored pinned local English OCR assets.');
