/** Next.js may normalize request.url to localhost while Host stays 127.0.0.1. */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const incoming = new URL(origin);
    const host = request.headers.get('host') || new URL(request.url).host;
    return ['http:', 'https:'].includes(incoming.protocol) && incoming.host === host;
  } catch {
    return false;
  }
}
