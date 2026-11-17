/* Public Europe PMC discovery. No model calls or automatic scientific judgments. */
(function () {
  'use strict';
  const ENDPOINT = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
  const TIMEOUT_MS = 12000;
  const ID_PATTERN = /^([A-Z][A-Z0-9_]{0,11}):([A-Za-z0-9][A-Za-z0-9._-]{0,79})$/;

  function stripMarkup(value) {
    if (typeof value !== 'string') return '';
    // Keep only inert, attribute-free formatting before the HTML parser sees it.
    // In particular, no image, frame, or external-resource elements are parsed.
    const markup = value.slice(0, 120000)
      .replace(/<(script|style|template|noscript|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?([A-Za-z][\w:-]*)\b[^>]*>/g, (tag, name) => {
        if (!/^(p|br|div|section|h[1-6]|ul|ol|li|b|i|em|strong|sup|sub)$/i.test(name)) return '';
        return '<' + (tag.startsWith('</') ? '/' : '') + name.toLowerCase() + '>';
      });
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    doc.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
    doc.querySelectorAll('p,div,section,h1,h2,h3,h4,h5,h6,li').forEach(node => node.append('\n'));
    return (doc.body.textContent || '').replace(/\u00a0/g, ' ')
      .replace(/[\t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function normalize(record) {
    if (!record || typeof record !== 'object') return null;
    const source = typeof record.source === 'string' ? record.source : '';
    const externalId = typeof record.id === 'string' ? record.id : '';
    const id = source + ':' + externalId;
    if (!ID_PATTERN.test(id)) return null;
    const title = stripMarkup(record.title);
    if (!title) return null;
    const authors = Array.isArray(record.authorList?.author)
      ? record.authorList.author.map(author => stripMarkup(author?.fullName || author?.collectiveName || '')).filter(Boolean)
      : stripMarkup(record.authorString || '').split(/,\s*/).filter(Boolean);
    const doi = typeof record.doi === 'string' && /^10\.\d{4,9}\/\S+$/i.test(record.doi.trim()) ? record.doi.trim() : '';
    const pmid = /^\d+$/.test(String(record.pmid || '')) ? String(record.pmid) : source === 'MED' && /^\d+$/.test(externalId) ? externalId : '';
    const pmcid = /^PMC\d+$/.test(String(record.pmcid || '')) ? String(record.pmcid) : source === 'PMC' && /^PMC\d+$/.test(externalId) ? externalId : '';
    return {
      id, source, title, authors,
      year: /^\d{4}$/.test(String(record.pubYear || '')) ? Number(record.pubYear) : null,
      journal: stripMarkup(record.journalInfo?.journal?.title || record.journalTitle || ''),
      doi, pmid, pmcid,
      url: 'https://europepmc.org/article/' + encodeURIComponent(source) + '/' + encodeURIComponent(externalId),
      abstract: stripMarkup(record.abstractText || ''),
      openAccess: record.isOpenAccess === 'Y'
    };
  }

  function abortedError() {
    const error = new Error('Search cancelled.');
    error.name = 'AbortError';
    return error;
  }

  async function request(query, pageSize, signal) {
    if (signal?.aborted) throw abortedError();
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (signal) signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({ query, format: 'json', resultType: 'core', pageSize: String(pageSize) }).toString();
    try {
      const response = await fetch(url.href, {
        method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        if (response.status === 429) throw new Error('Europe PMC is receiving too many requests. Please try again shortly.');
        throw new Error('Europe PMC could not complete this search (HTTP ' + response.status + '). Try again later.');
      }
      let data;
      try { data = await response.json(); }
      catch (_) { throw new Error('Europe PMC returned an unreadable response. Please try again.'); }
      if (!data || !Number.isFinite(data.hitCount) || data.hitCount < 0 || !Array.isArray(data.resultList?.result)) {
        throw new Error('Europe PMC returned an unexpected response. No search results were accepted.');
      }
      const records = data.resultList.result;
      const papers = records.map(normalize).filter(Boolean);
      if (data.hitCount > 0 && !papers.length) {
        throw new Error('Europe PMC returned records without usable paper metadata. Please try another query.');
      }
      return { total: data.hitCount, papers };
    } catch (error) {
      if (signal?.aborted) throw abortedError();
      if (timedOut) throw new Error('Europe PMC took too long to respond. Please try again.');
      if (error instanceof TypeError) throw new Error('Could not reach Europe PMC. Check your connection and try again.');
      throw error;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', cancel);
    }
  }

  async function search(query, options = {}) {
    if (typeof query !== 'string' || !query.trim()) throw new Error('Enter a topic, author, title, or DOI to search.');
    query = query.trim();
    if (query.length > 300) throw new Error('Keep your search to 300 characters or fewer. Use a few specific terms.');
    if (/[\u0000-\u001f\u007f]/.test(query)) throw new Error('Use a single line of text for your search.');
    return request(query, 8, options.signal);
  }

  async function getPaper(id, options = {}) {
    const match = typeof id === 'string' ? id.match(ID_PATTERN) : null;
    if (!match || (match[1] === 'MED' && !/^[1-9]\d{0,15}$/.test(match[2])) ||
        (match[1] === 'PMC' && !/^PMC[1-9]\d{0,15}$/.test(match[2]))) {
      throw new Error('This paper does not have a valid Europe PMC identifier.');
    }
    const [ , source, external ] = match;
    const query = source === 'MED' ? 'EXT_ID:' + external + ' AND SRC:MED' :
      source === 'PMC' ? 'PMCID:' + external : 'EXT_ID:"' + external + '" AND SRC:' + source;
    const result = await request(query, 1, options.signal);
    return result.papers.find(paper => source !== 'PMC' ? paper.id === id :
      paper.pmcid === external && (paper.id === id || /^MED:[1-9]\d{0,15}$/.test(paper.id))) || null;
  }

  window.PherogentLiterature = Object.freeze({ search, getPaper, stripMarkup });
})();
