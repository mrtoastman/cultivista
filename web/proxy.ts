import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  let res = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options as CookieOptions)); },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const p = request.nextUrl.pathname;
  if (p.startsWith('/dashboard') && !user) return NextResponse.redirect(new URL('/auth/login', request.url));
  if (p.startsWith('/auth') && user) return NextResponse.redirect(new URL('/dashboard', request.url));
  return res;
}
export const config = { matcher: ['/dashboard/:path*', '/auth/:path*'] };
