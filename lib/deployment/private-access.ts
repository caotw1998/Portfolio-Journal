const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_DECLARED_BODY_BYTES = 1024 * 1024;

export type PrivateAccessDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403 | 413 | 503; message: string };

type AccessRequest = {
  method: string;
  pathname: string;
  headers: Pick<Headers, "get">;
};

type AccessEnvironment = {
  NODE_ENV?: string;
  PRIVATE_ACCESS_MODE?: string;
  TAILSCALE_ALLOWED_LOGIN?: string;
  APP_ORIGIN?: string;
};

export const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

function isHealthCheck(pathname: string) {
  return pathname === "/api/health";
}

export function evaluatePrivateAccess(request: AccessRequest, environment: AccessEnvironment = process.env): PrivateAccessDecision {
  if (isHealthCheck(request.pathname) || environment.NODE_ENV !== "production") return { allowed: true };
  if (environment.PRIVATE_ACCESS_MODE !== "tailscale") {
    return { allowed: false, status: 503, message: "Private access mode is not configured." };
  }

  const allowedLogin = environment.TAILSCALE_ALLOWED_LOGIN?.trim().toLowerCase();
  const requestLogin = request.headers.get("tailscale-user-login")?.trim().toLowerCase();
  if (!allowedLogin || !environment.APP_ORIGIN) {
    return { allowed: false, status: 503, message: "Private access configuration is incomplete." };
  }
  if (!requestLogin) return { allowed: false, status: 401, message: "Tailscale identity is required." };
  if (requestLogin !== allowedLogin) return { allowed: false, status: 403, message: "This Tailscale identity is not allowed." };

  if (MUTATION_METHODS.has(request.method.toUpperCase())) {
    const origin = request.headers.get("origin");
    let expectedOrigin: string;
    try {
      expectedOrigin = new URL(environment.APP_ORIGIN).origin;
    } catch {
      return { allowed: false, status: 503, message: "APP_ORIGIN is invalid." };
    }
    if (origin !== expectedOrigin) return { allowed: false, status: 403, message: "Request origin is not allowed." };

    const declaredLength = request.headers.get("content-length");
    if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_DECLARED_BODY_BYTES)) {
      return { allowed: false, status: 413, message: "Request body is too large." };
    }
  }
  return { allowed: true };
}
