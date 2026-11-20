async function searchRecentPosts({ query, token, signal, onPage, fetchImpl = fetch, maxResults = 100 }) {
  if (typeof query !== 'string' || !query.trim() || query.length > 500) throw new Error('Escribe una búsqueda de hasta 500 caracteres.');
  if (!token) throw new Error('Configura la clave de X en la aplicación o en X_BEARER_TOKEN.');
  const seen = new Set();
  const tokens = new Set();
  let nextToken;
  while (seen.size < maxResults) {
    const params = new URLSearchParams({ query: query.trim(), max_results: '100', 'tweet.fields': 'created_at,author_id' });
    if (nextToken) params.set('next_token', nextToken);
    const response = await fetchImpl(`https://api.x.com/2/tweets/search/recent?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!response.ok) {
      const raw = await response.text();
      let detail = raw.slice(0, 300);
      try { const error = JSON.parse(raw); detail = error.detail || error.title || detail; } catch {}
      throw new Error(`X respondió ${response.status}: ${detail}`);
    }
    const body = await response.json();
    const posts = [];
    for (const post of body.data || []) {
      if (seen.size >= maxResults) break;
      if (typeof post.id !== 'string' || !/^\d+$/.test(post.id) || seen.has(post.id)) continue;
      seen.add(post.id);
      posts.push({ id: post.id, text: String(post.text || ''), date: post.created_at || '', url: `https://x.com/i/web/status/${post.id}` });
    }
    onPage(posts);
    nextToken = body.meta?.next_token;
    if (typeof nextToken !== 'string' || !nextToken || tokens.has(nextToken)) break;
    tokens.add(nextToken);
  }
  return seen.size;
}
module.exports = { searchRecentPosts };
