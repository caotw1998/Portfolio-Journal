import { NextRequest, NextResponse } from "next/server";
import { evaluatePrivateAccess, SECURITY_HEADERS } from "@/lib/deployment/private-access";

const INTERNAL_WORKER_PATHS = new Set([
  "/api/internal/sync-jobs/run",
  "/api/internal/benchmark-valuations/sync",
]);

export function isInternalWorkerPath(pathname: string) {
  return INTERNAL_WORKER_PATHS.has(pathname);
}

export function proxy(request: NextRequest) {
  if (isInternalWorkerPath(request.nextUrl.pathname)) {
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
