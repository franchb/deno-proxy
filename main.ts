// ===================================================================
// 1. CONFIGURATION (Deno 2.5+ Environment Variables)
// ===================================================================
// Server port configuration with Deno 2.5 defaults
const PROXY_PORT = parseInt(Deno.env.get("PROXY_PORT") ?? "8000", 10);

// Whitelist of allowed hosts (e.g., "api.openai.com,*.github.com,deno.land")
const allowedHostsVar = Deno.env.get("ALLOWED_HOSTS") ?? "";
const ALLOWED_HOST_PATTERNS = allowedHostsVar
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

// Request timeout in milliseconds (default 10 minutes)
const PROXY_TIMEOUT_MS = parseInt(
  Deno.env.get("PROXY_TIMEOUT_MS") ?? "600000",
  10,
);

// Rate limiting settings with Deno 2.5 optimized defaults
const RATE_LIMIT_WINDOW_MS = parseInt(
  Deno.env.get("RATE_LIMIT_WINDOW_MS") ?? "60000",
  10,
); // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = parseInt(
  Deno.env.get("RATE_LIMIT_MAX_REQUESTS") ?? "1000",
  10,
); // 1000 requests per minute

// ===================================================================
// 2. SECURITY PRE-COMPILATION & STATE
// ===================================================================

// --- Whitelist Regex Pre-compilation (Deno 2.5 optimized) ---
function patternToRegExp(pattern: string): RegExp {
   // Limit wildcards to prevent ReDoS
  const wildcardCount = (pattern.match(/\*/g) || []).length;
 if (wildcardCount > 3) {
   throw new Error(`Pattern "${pattern}" has too many wildcards (max 3)`);
  };
  const regexString = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^.]+");
  return new RegExp(`^${regexString}$`, "i"); // Case-insensitive for better compatibility
}
const ALLOWED_HOST_REGEXPS = ALLOWED_HOST_PATTERNS.map(patternToRegExp);

// --- Enhanced Hostname Validation (Deno 2.5+ with Unicode support) ---
const IS_VALID_HOSTNAME = new RegExp(
  "^(([a-zA-Z0-9\\u00a1-\\uffff]|[a-zA-Z0-9\\u00a1-\\uffff][a-zA-Z0-9\\u00a1-\\uffff-]*[a-zA-Z0-9\\u00a1-\\uffff])\\.)*" +
    "([A-Za-z0-9\\u00a1-\\uffff]|[A-Za-z0-9\\u00a1-\\uffff][A-Za-z0-9\\u00a1-\\uffff-]*[A-Za-z0-9\\u00a1-\\uffff])$",
);

// --- Rate Limiting State (In-memory with Deno 2.5 optimizations) ---
const requestTimestamps = new Map<string, number[]>();

// ===================================================================
// 3. MAIN SERVER LOGIC
// ===================================================================

// Structured logging with Deno 2.5+ features
console.log(
  JSON.stringify({
    level: "INFO",
    timestamp: new Date().toISOString(),
    message: "Starting Deno 2.5+ proxy server",
    port: PROXY_PORT,
    allowedHosts: ALLOWED_HOST_PATTERNS,
    denoVersion: Deno.version.deno,
    v8Version: Deno.version.v8,
    features: {
      permissions: "granular",
      rateLimit: RATE_LIMIT_MAX_REQUESTS,
      timeout: PROXY_TIMEOUT_MS,
    },
  }),
);

// Deno 2.5+ serve with enhanced TCP configuration
Deno.serve(
  {
    port: PROXY_PORT,
    // Deno 2.5+ TCP backlog optimization for high traffic
    tcpBacklog: 511,
  },
  async (request: Request, info: Deno.ServeHandlerInfo) => {
    const url = new URL(request.url);
    // Enhanced client IP detection for Deno 2.5+
    const clientIp = (() => {
      if (info.remoteAddr.transport === "tcp") {
        return info.remoteAddr.hostname;
      } else if (info.remoteAddr.transport === "unix") {
        return `unix:${info.remoteAddr.path}`;
      }
      return "unknown";
    })();

    // --- Layer 1: Rate Limiting ---
    const now = Date.now();
    const userTimestamps = requestTimestamps.get(clientIp) || [];
    const recentTimestamps = userTimestamps.filter(
      (ts) => now - ts < RATE_LIMIT_WINDOW_MS,
    );

    if (recentTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      console.warn(
        JSON.stringify({
          level: "WARN",
          timestamp: new Date().toISOString(),
          message: "Rate limit exceeded",
          clientIp,
        }),
      );
      return new Response("Too Many Requests", { status: 429 });
    }
    requestTimestamps.set(clientIp, [...recentTimestamps, now]);

    // --- Layer 2: Path Parsing and Host Extraction ---
    const pathSegments = url.pathname.split("/").filter((segment) => segment);
    if (pathSegments.length < 1) {
      return new Response(
        "Bad Request: The first path segment must be the target host.",
        { status: 400 },
      );
    }
    const targetHost = pathSegments.shift()!;

    // --- Layer 3: Hostname Validation (Prevent Path Traversal) ---
    if (!IS_VALID_HOSTNAME.test(targetHost)) {
      console.warn(
        JSON.stringify({
          level: "WARN",
          timestamp: new Date().toISOString(),
          message: "Invalid hostname format detected",
          clientIp,
          targetHost,
          userAgent: request.headers.get("user-agent"),
        }),
      );
      return new Response("Bad Request: Invalid host format provided.", {
        status: 400,
      });
    }

    // --- Layer 4: Whitelist Enforcement ---
    const isAllowed = ALLOWED_HOST_REGEXPS.some(
      (regex: { test: (arg0: string) => any }) => regex.test(targetHost),
    );
    if (!isAllowed) {
      console.warn(
        JSON.stringify({
          level: "WARN",
          timestamp: new Date().toISOString(),
          message: "Forbidden proxy attempt to non-whitelisted host",
          clientIp,
          targetHost,
          userAgent: request.headers.get("user-agent"),
        }),
      );
      return new Response(
        `Forbidden: Host '${targetHost}' is not in the allowed list.`,
        { status: 403 },
      );
    }

    // --- Layer 5: Header Sanitization & Forwarding Information ---
    const fwdHeaders = new Headers(request.headers);
    const hopByHopHeaders = [
      "connection",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailers",
      "transfer-encoding",
      "upgrade",
    ];
    hopByHopHeaders.forEach((h) => fwdHeaders.delete(h));

    fwdHeaders.delete("x-forwarded-for");
    fwdHeaders.set("x-forwarded-host", url.host);
    fwdHeaders.set("x-forwarded-proto", url.protocol.slice(0, -1));

    // --- Layer 6: Request Timeout ---
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    // --- Layer 7: Safe Fetching with Deno 2.5+ optimizations ---
    try {
      const targetUrl = new URL(request.url);
      targetUrl.protocol = "https:";
      targetUrl.host = targetHost;
      targetUrl.port = "";
      targetUrl.pathname = "/" + pathSegments.join("/");

      // Enhanced fetch with Deno 2.5+ features
      let upstreamResponse: Response;
      try {
        upstreamResponse = await fetch(targetUrl.toString(), {
          headers: fwdHeaders,
          method: request.method,
          body: request.body,
          redirect: "follow",
          signal: controller.signal,
          // Deno 2.5+ performance optimizations
          keepalive: true,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Enhanced header sanitization for Deno 2.5+
      const sanitizedHeaders = new Headers(upstreamResponse.headers);
      const blockedResponseHeaders = [
        "set-cookie",
        "proxy-authenticate",
        "www-authenticate",
        "server",
        "x-powered-by",
        "x-frame-options", // Additional security headers
        "x-content-type-options",
      ];
      blockedResponseHeaders.forEach((header) =>
        sanitizedHeaders.delete(header),
      );

      // Add security headers for Deno 2.5+
      sanitizedHeaders.set("x-proxied-by", "deno-proxy/2.5");

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: sanitizedHeaders,
      });
    } catch (error) {
      // Enhanced error handling with Deno 2.5+ structured logging
      const errPayload = {
        level: "ERROR",
        timestamp: new Date().toISOString(),
        message: "Error fetching target host",
        clientIp,
        targetHost,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        denoVersion: Deno.version.deno,
      };

      if (error instanceof Error && error.name === "AbortError") {
        errPayload.message = `Gateway Timeout: Request to '${targetHost}' exceeded ${PROXY_TIMEOUT_MS}ms.`;
        console.error(JSON.stringify(errPayload));
        return new Response(errPayload.message, {
          status: 504,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      console.error(JSON.stringify(errPayload));
      return new Response(
        `Bad Gateway: Could not reach target host '${targetHost}'.`,
        {
          status: 502,
          headers: { "content-type": "text/plain; charset=utf-8" },
        },
      );
    }
  },
);
