import { NextRequest, NextResponse } from "next/server";
import { evaluatePrivateAccess, SECURITY_HEADERS } from "@/lib/deployment/private-access";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/internal/sync-jobs/run") {
    return NextResponse.next();
  }
  const decision = evaluatePrivateAccess({
    method: request.method,
    pathname: request.nextUrl.pathname,
    headers: request.headers,
  });
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.message }, { status: decision.status });
  }

  const response = NextResponse.next();
  if (process.env.NODE_ENV === "production") {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
