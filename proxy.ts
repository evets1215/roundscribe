/**
 * Next.js 16 route proxy (replaces middleware.ts).
 * Runs in Node.js runtime — full Auth.js session check is safe here.
 *
 * The `authorized` callback in src/auth.ts handles all redirect logic:
 *   - Unauthenticated → /login
 *   - Logged-in visiting /login → /
 */
export { auth as proxy } from "@/auth";

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static assets
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
