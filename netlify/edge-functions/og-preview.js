export default async (request, context) => {
  const url = new URL(request.url);
  const postId = url.searchParams.get('post');

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';

  if (!postId || !contentType.includes('text/html')) {
    return response;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(postId)) {
    return response;
  }

  const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('VITE_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  try {
    const apiRes = await fetch(
      `${supabaseUrl}/rest/v1/posts?id=eq.${postId}&select=content,created_at`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`
        }
      }
    );

    if (!apiRes.ok) return response;

    const rows = await apiRes.json();
    const post = rows?.[0];
    if (!post?.content) return response;

    const title = 'PUPSRC Freedom Wall';
    const rawSnippet = post.content.replace(/\s+/g, ' ').trim();
    const description =
      rawSnippet.length > 160 ? `${rawSnippet.slice(0, 157)}...` : rawSnippet;

    const escapeAttr = (str) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const ogTags = [
      '<meta property="og:type" content="article">',
      '<meta property="og:site_name" content="PUPSRC Freedom Wall">',
      `<meta property="og:title" content="${escapeAttr(title)}">`,
      `<meta property="og:description" content="${escapeAttr(description)}">`,
      `<meta property="og:url" content="${escapeAttr(url.toString())}">`,
      '<meta name="twitter:card" content="summary">',
      `<meta name="twitter:title" content="${escapeAttr(title)}">`,
      `<meta name="twitter:description" content="${escapeAttr(description)}">`
    ].join('\n  ');

    let html = await response.text();

    // Remove default og/twitter tags from index.html so there are no duplicates
    html = html.replace(/\s*<meta\s+(?:property="og:[^"]*"|name="twitter:[^"]*")\s+content="[^"]*"\s*\/?>/gi, '');
    html = html.replace('</head>', `  ${ogTags}\n</head>`);

    const headers = new Headers(response.headers);
    headers.delete('content-length');

    return new Response(html, {
      status: response.status,
      headers
    });
  } catch (err) {
    console.error('OG Edge Function error:', err);
    return response;
  }
};

export const config = {
  path: '/*'
};