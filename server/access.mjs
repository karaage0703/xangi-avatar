const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Trust local processes and an explicitly configured Tailscale Serve on this host.
// Never use forwarded client IPs to decide whether a request is local.
export function createAvatarAccess({ publicUrl = process.env.AVATAR_PUBLIC_URL || '', login = process.env.AVATAR_TRUSTED_TAILSCALE_LOGIN || '' } = {}) {
  let publicOrigin = '';
  if (publicUrl) {
    const url = new URL(publicUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('AVATAR_PUBLIC_URL must be an HTTPS origin without credentials, path, query or fragment');
    }
    publicOrigin = url.origin;
  }
  if (login && !publicOrigin) throw new Error('AVATAR_TRUSTED_TAILSCALE_LOGIN requires AVATAR_PUBLIC_URL');
  return function allow(request, response) {
    const deny = (status, error) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error }));
      return false;
    };
    if (!LOOPBACK.has(request.socket.remoteAddress)) return deny(403, 'Use localhost or the configured Tailscale Serve URL');
    const host = request.headers.host;
    const port = request.socket.localPort;
    const localHosts = ['localhost', '127.0.0.1', '[::1]'].map(name => `${name}:${port}`);
    const forwarded = Object.keys(request.headers).some(name => name === 'forwarded' || name.startsWith('x-forwarded-') || name.startsWith('tailscale-'));
    let origin;
    if (localHosts.includes(host) && !forwarded) {
      origin = `http://${host}`;
    } else if (publicOrigin && host === new URL(publicOrigin).host && login && request.headers['tailscale-user-login'] === login) {
      origin = publicOrigin;
    } else {
      return deny(401, 'Avatar access is not authorized');
    }
    let pathname;
    try { pathname = new URL(request.url || '/', 'http://avatar.local').pathname; }
    catch { return deny(400, 'Invalid request URL'); }
    const api = pathname.startsWith('/api/');
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if ((request.headers.origin && request.headers.origin !== origin) ||
        (api && ['cross-site', 'same-site'].includes(request.headers['sec-fetch-site'])) ||
        (unsafe && request.headers.origin !== origin)) {
      return deny(403, 'Open Avatar at its configured URL before making this request');
    }
    return true;
  };
}
