/**
 * In front of the built site on alanbarboza.com (wrangler.jsonc): the portfolio at the root, the owner's blog
 * at /blog, as it was before the portfolio moved in. The blog runs on its own server (nginx + Express, the zone's
 * DNS record), so its paths go straight there: its pages (/blog…), their styles and fonts (/static/…), and the
 * certificate checks that keep its HTTPS valid (/.well-known/acme-challenge/…). Everything else is the portfolio,
 * served from dist/ as before. www, and the site's old address on workers.dev, go to the bare domain.
 */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const HOST = 'alanbarboza.com';
const BLOG = /^\/(blog|static|\.well-known\/acme-challenge)(\/|$)/;

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const url = new URL(request.url);
    if (url.hostname === `www.${HOST}` || url.hostname.endsWith('.workers.dev')) {
      url.protocol = 'https:';
      url.hostname = HOST;
      url.port = '';
      return Response.redirect(url.href, 301);
    }
    // A Worker's request to its own zone skips the Worker and goes to the zone's server: the blog.
    if (url.hostname === HOST && BLOG.test(url.pathname)) return fetch(request);
    return env.ASSETS.fetch(request);
  },
};
