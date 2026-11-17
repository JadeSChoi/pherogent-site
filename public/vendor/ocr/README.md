# Optional local OCR

Locally served, unmodified pinned distributions. File images never go to a CDN or OCR service.

- Tesseract.js 7.0.0, worker distribution (Apache-2.0). https://github.com/naptha/tesseract.js
- Tesseract.js Core 7.0.0, LSTM WASM-in-JS builds including SIMD and relaxed SIMD (Apache-2.0). https://github.com/naptha/tesseract.js-core
- @tesseract.js-data/eng 1.0.0, compact 4.0.0_best_int English model, package metadata retained. https://github.com/naptha/tessdata

`public/attachment-ocr.js` uses the pinned worker message protocol so it can terminate the worker even while initialization is pending. Changes to this dependency require the actual-worker OCR test and browser QA. Reproduce these assets with `node scripts/vendor-ocr.mjs`.
