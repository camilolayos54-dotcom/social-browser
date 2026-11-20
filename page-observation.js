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
    const amount = Math.max(100, Math.floor(target.clientHeight * 0.8)) * (down ? 1 : -1);
    target.scrollBy({ top: amount, behavior: 'instant' });
    return { moved: target.scrollTop !== before, before, position: target.scrollTop, maximum: target.scrollHeight - target.clientHeight, container: target === document.scrollingElement ? 'documento' : 'área desplazable' };
  }
  return { error: 'Acción desconocida.' };
}
if (typeof module !== 'undefined') module.exports = { pageObservation };
