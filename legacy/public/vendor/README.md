# Attachment reader dependencies

Locally served, unmodified distributions. No file content is sent to a CDN.

- Mozilla PDF.js 6.4.299 (Apache-2.0), legacy minified module and worker, CMaps and standard fonts. https://mozilla.github.io/pdf.js/
- fflate 0.8.3 (MIT), browser ESM. https://github.com/101arrowz/fflate

Reproduce with `node scripts/vendor-attachments.mjs` after installing the pinned dependencies.
