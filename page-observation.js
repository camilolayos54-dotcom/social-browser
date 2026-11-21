// This function runs in the selected web page and only reads or scrolls it.
function pageObservation(operation, options) {
  const inViewport = (element, suppliedRect) => {
    if (!element || element.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const rect = suppliedRect || element.getBoundingClientRect();
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    for (let parent = element; parent && right > left && bottom > top; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || Number(parentStyle.opacity) === 0) return false;
      const clipX = /^(auto|scroll|hidden|clip)$/.test(parentStyle.overflowX);
      const clipY = /^(auto|scroll|hidden|clip)$/.test(parentStyle.overflowY);
      if (clipX || clipY) {
        const bounds = parent.getBoundingClientRect();
        if (clipX) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        if (clipY) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      }
    }
    return right > left && bottom > top;
  };
  if (operation === 'read') {
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const pieces = [];
    let length = 0, examined = 0, node;
    while ((node = walker.nextNode()) && examined++ < 15000 && length < 12000) {
      const parent = node.parentElement;
      const text = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (!text || !parent || parent.closest('script, style, noscript, template, textarea, select')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const bounds = range.getBoundingClientRect();
      if (!inViewport(parent, bounds)) continue;
      const part = text.slice(0, 12000 - length);
      pieces.push(part);
      length += part.length + 1;
    }
    const links = [];
    for (const anchor of document.querySelectorAll('a[href]')) {
      if (links.length >= 50) break;
      const text = (anchor.innerText || '').trim().slice(0, 200);
      if (text && (anchor.href.startsWith('https://') || anchor.href.startsWith('http://')) && inViewport(anchor)) links.push({ text, url: anchor.href });
    }
    const articles = [];
    for (const article of document.querySelectorAll('article, [role="article"]')) {
      if (articles.length >= 12) break;
      if (article.parentElement?.closest('article, [role="article"]') || !inViewport(article)) continue;
      const text = (article.innerText || '').trim().slice(0, 1200);
      if (!text) continue;
      const articleLinks = [];
      for (const anchor of article.querySelectorAll('a[href]')) {
        if (articleLinks.length >= 10) break;
        if (!anchor.getClientRects().length || anchor.closest('[hidden], [aria-hidden="true"]')) continue;
        if (!anchor.href.startsWith('https://') && !anchor.href.startsWith('http://')) continue;
        articleLinks.push({ text: (anchor.innerText || '').trim().slice(0, 200), url: anchor.href });
      }
      const date = article.querySelector('time[datetime]')?.getAttribute('datetime') || '';
      articles.push({ text, links: articleLinks, date });
    }
    return { title: document.title, url: location.href, text: pieces.join('\n').slice(0, 12000), links, articles, truncated: length >= 12000 || examined >= 15000 };
  }
  if (operation === 'scan_matches') {
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    const matchesTerm = (haystack, term) => haystack.includes(term) || (term.length > 4 && term.endsWith('s') && haystack.includes(term.slice(0, -1)));
    const uiNoisePatterns = ['se incluyen los resultados para', 'en su lugar, buscar', 'showing results for', 'search instead for', 'no encontramos resultados', 'fin de los resultados'];
    const clientSignals = ['necesito', 'busco', 'alguien recomienda', 'recomiendan', 'quien hace', 'alguien sabe', 'cotizacion', 'cotizar', 'urgente', 'cuanto cuesta', 'quien me ayuda', 'para hoy', 'para manana', 'requiero'];
    const adSignals = ['ofrecemos', 'contamos con', 'servicio de trasteo', 'servicio de mudanza', 'llamanos', 'comunicate al', 'cotiza con nosotros', 'somos empresa', 'disponibilidad inmediata'];
    const terms = String(options.phrase || '').split(',').map(normalize).filter(Boolean);
    const locations = String(options.location || '').split(',').map(normalize).filter(Boolean);
    const exclusions = String(options.exclude || '').split(',').map(normalize).filter(Boolean);
    const since = options.since ? Date.parse(`${options.since}T00:00:00`) : null;
    const onlyClients = Boolean(options.onlyClients);
    if (!terms.length || terms.some(term => term.length > 120) || locations.length > 20 || locations.some(location => location.length > 100) || exclusions.length > 20 || (options.since && Number.isNaN(since))) return { error: 'Filtros inválidos.' };
    // Auto-expand "Ver más" / "See more" buttons on visible posts so hidden keywords are exposed
    for (const btn of document.querySelectorAll('[role="button"], button')) {
      const label = normalize(btn.textContent || '');
      if ((label === 'ver mas' || label === 'see more') && inViewport(btn)) {
        try { btn.click(); } catch {}
      }
    }
    // Discover posts across standard articles AND modern Facebook Search/Feed containers
    const rawCandidates = [
      ...document.querySelectorAll('article, [role="article"]'),
      ...document.querySelectorAll('[role="feed"] > div, [data-pagelet*="FeedUnit"], [role="main"] [role="list"] > [role="listitem"]')
    ];
    const candidates = [];
    for (const el of rawCandidates) {
      if (!el || !inViewport(el)) continue;
      if (el.parentElement?.closest('article, [role="article"]')) continue;
      if (candidates.some(existing => existing === el || existing.contains(el) || el.contains(existing))) continue;
      candidates.push(el);
    }
    const matches = [], ranges = [];
    let scanned = 0;
    for (const article of candidates) {
      if (matches.length >= 50) break;
      scanned++;
      const beforeRanges = ranges.length;
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      const parts = []; let examined = 0, node;
      while ((node = walker.nextNode()) && examined++ < 2500) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script,style,textarea,input,[hidden],[aria-hidden="true"]')) continue;
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
        const text = node.nodeValue.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        parts.push(text);
        if (terms.some(term => matchesTerm(normalize(text), term))) {
          const range = document.createRange(); range.selectNodeContents(node);
          if (inViewport(parent, range.getBoundingClientRect())) ranges.push(range);
        }
      }
      // Also inspect Facebook's auto-OCR image alt text (e.g. "Puede ser una imagen de texto que dice '...'")
      for (const img of article.querySelectorAll('img[alt]')) {
        const alt = (img.getAttribute('alt') || '').replace(/\s+/g, ' ').trim();
        if (alt.length > 12 && !/^(foto del perfil|profile photo|emoji)/i.test(alt)) parts.push(`[Imagen] ${alt}`);
      }
      const text = parts.join(' ').slice(0, 1200);
      const normalizedText = normalize(text);
      if (!normalizedText || uiNoisePatterns.some(noise => normalizedText.includes(noise))) { ranges.length = beforeRanges; continue; }
      const date = article.querySelector('time[datetime]')?.getAttribute('datetime') || '';
      const dateValue = date ? Date.parse(date) : NaN;
      if (!terms.some(term => matchesTerm(normalizedText, term)) || (locations.length && !locations.some(location => normalizedText.includes(location))) || exclusions.some(term => matchesTerm(normalizedText, term)) || (since !== null && (!Number.isFinite(dateValue) || dateValue < since))) { ranges.length = beforeRanges; continue; }
      const hasClient = clientSignals.some(sig => normalizedText.includes(sig));
      const hasAd = adSignals.some(sig => normalizedText.includes(sig));
      const intent = hasClient && !hasAd ? 'client' : hasAd && !hasClient ? 'ad' : 'neutral';
      if (onlyClients && intent === 'ad') { ranges.length = beforeRanges; continue; }
      if (ranges.length === beforeRanges) { const range = document.createRange(); range.selectNodeContents(article); ranges.push(range); }
      const links = Array.from(article.querySelectorAll('a[href]')).map(a => a.href).filter(href => {
        try {
          const url = new URL(href);
          if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return false;
          return /\/(posts|permalink|photo|videos?|reel)\b/i.test(url.pathname) || (/\/(story|permalink)\.php$/i.test(url.pathname) && url.searchParams.has('story_fbid')) || url.searchParams.has('fbid') || url.searchParams.has('multi_permalinks') || /pfbid/i.test(url.pathname);
        } catch { return false; }
      });
      matches.push({ text, url: links[0] || '', date, intent });
    }
    if (globalThis.CSS?.highlights && typeof Highlight !== 'undefined') {
      if (!document.getElementById('social-scan-highlight-style')) { const style = document.createElement('style'); style.id = 'social-scan-highlight-style'; style.textContent = '::highlight(social-scan-match) { background-color: #fff176; color: #171717; }'; document.head?.append(style); }
      CSS.highlights.set('social-scan-match', new Highlight(...ranges));
    }
    return { matches, highlighted: ranges.length, scanned };
  }
  if (operation === 'scroll') {
    const down = options.direction === 'down';
    const canMove = element => element && element.scrollHeight > element.clientHeight + 1 && (down ? element.scrollTop + element.clientHeight < element.scrollHeight - 1 : element.scrollTop > 0);
    const scrollable = element => {
      if (!element || element === document.documentElement || element === document.body) return false;
      return /^(auto|scroll|overlay)$/.test(getComputedStyle(element).overflowY) && canMove(element);
    };
    let target = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    while (target && !scrollable(target)) target = target.parentElement;
    if (!target) {
      const root = document.scrollingElement;
      if (canMove(root)) target = root;
      else {
        target = Array.from(document.querySelectorAll('main, [role="main"], div, section')).find(element => {
          const rect = element.getBoundingClientRect();
          return rect.width >= innerWidth * 0.25 && rect.height >= innerHeight * 0.3 && inViewport(element) && scrollable(element);
        });
      }
    }
    if (!target) return { moved: false, reason: 'No hay más contenido desplazable en esa dirección.' };
    const before = target.scrollTop;
    const amount = Math.max(220, Math.floor(target.clientHeight * 0.92)) * (down ? 1 : -1);
    target.scrollBy({ top: amount, behavior: 'instant' });
    return { moved: target.scrollTop !== before, before, position: target.scrollTop, maximum: target.scrollHeight - target.clientHeight, container: target === document.scrollingElement ? 'documento' : 'área desplazable' };
  }
  return { error: 'Acción desconocida.' };
}
if (typeof module !== 'undefined') module.exports = { pageObservation };
