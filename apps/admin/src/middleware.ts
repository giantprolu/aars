import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { cookieName, unseal } from '@/lib/session';

/**
 * Garde du tableau de bord, devant chaque requête :
 *
 * - une politique de contenu stricte, avec un nonce neuf par requête : seuls
 *   les scripts que Next émet pour cette page s'exécutent ;
 * - hors de `/login`, une session complète (mot de passe et passkey) ou rien :
 *   la page renvoie à l'entrée, l'API répond 401 ;
 * - rien ne se met en cache.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${env.development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
    ...(env.secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  const finish = (response: NextResponse): NextResponse => {
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  };

  const path = request.nextUrl.pathname;
  if (path !== '/login') {
    const session = await unseal(request.cookies.get(cookieName('session'))?.value, 'session');
    if (session === null) {
      if (path.startsWith('/api/')) {
        return finish(new NextResponse(null, { status: 401 }));
      }
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      return finish(NextResponse.redirect(url));
    }
  }

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  return finish(NextResponse.next({ request: { headers } }));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
