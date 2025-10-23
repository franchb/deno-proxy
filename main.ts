
// ===================================================================
// 1. CONFIGURATION (from Environment Variables)
// ===================================================================
// Whitelist of allowed hosts (e.g., "mcp.exa.ai,*.github.com,deno.land")
const allowedHostsVar = Deno.env.get("ALLOWED_HOSTS") || "";
const ALLOWED_HOST_PATTERNS = allowedHostsVar.split(',').filter(h => h);

// Request timeout in milliseconds
const PROXY_TIMEOUT_MS = parseInt(Deno.env.get("PROXY_TIMEOUT_MS") || "600000", 10);  // 10 minute

// Rate limiting settings
const RATE_LIMIT_WINDOW_MS = parseInt(Deno.env.get("RATE_LIMIT_WINDOW_MS") || "60000", 10); // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(Deno.env.get("RATE_LIMIT_MAX_REQUESTS") || "1000", 10); // 1000 requests per minute

// ===================================================================
// 2. SECURITY PRE-COMPILATION & STATE
// ===================================================================

// --- Whitelist Regex Pre-compilation ---
function patternToRegExp(pattern: string): RegExp {
    const regexString = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^.]+');
    return new RegExp(`^${regexString}$`);
}
const ALLOWED_HOST_REGEXPS = ALLOWED_HOST_PATTERNS.map(patternToRegExp);

// --- Hostname Validation Regex ---
const IS_VALID_HOSTNAME = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;

// --- Rate Limiting State (In-memory) ---
const requestTimestamps = new Map<string, number[]>();

// ===================================================================
// 3. MAIN SERVER LOGIC
// ===================================================================
Deno.serve(async (request: Request, info: Deno.ServeHandlerInfo) => {
    const url = new URL(request.url);
    const clientIp = info.remoteAddr.hostname;

    // --- Layer 1: Rate Limiting ---
    const now = Date.now();
    const userTimestamps = requestTimestamps.get(clientIp) || [];
    const recentTimestamps = userTimestamps.filter(ts => (now - ts) < RATE_LIMIT_WINDOW_MS);

    if (recentTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
        console.warn(JSON.stringify({
            level: "WARN", timestamp: new Date().toISOString(), message: "Rate limit exceeded", clientIp,
        }));
        return new Response("Too Many Requests", { status: 429 });
    }
    requestTimestamps.set(clientIp, [...recentTimestamps, now]);

    // --- Layer 2: Path Parsing and Host Extraction ---
    const pathSegments = url.pathname.split('/').filter(segment => segment);
    if (pathSegments.length < 1) {
        return new Response("Bad Request: The first path segment must be the target host.", { status: 400 });
    }
    const targetHost = pathSegments.shift()!;

    // --- Layer 3: Hostname Validation (Prevent Path Traversal) ---
    if (!IS_VALID_HOSTNAME.test(targetHost)) {
        console.warn(JSON.stringify({
            level: "WARN", timestamp: new Date().toISOString(), message: "Invalid hostname format detected", clientIp, targetHost,
            userAgent: request.headers.get("user-agent"),
        }));
        return new Response("Bad Request: Invalid host format provided.", { status: 400 });
    }

    // --- Layer 4: Whitelist Enforcement ---
    const isAllowed = ALLOWED_HOST_REGEXPS.some(regex => regex.test(targetHost));
    if (!isAllowed) {
        console.warn(JSON.stringify({
            level: "WARN", timestamp: new Date().toISOString(), message: "Forbidden proxy attempt to non-whitelisted host",
            clientIp, targetHost, userAgent: request.headers.get("user-agent"),
        }));
        return new Response(`Forbidden: Host '${targetHost}' is not in the allowed list.`, { status: 403 });
    }

    // --- Layer 5: Header Sanitization & Forwarding Information ---
    const fwdHeaders = new Headers(request.headers);
    const hopByHopHeaders = [
        "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade"
    ];
    hopByHopHeaders.forEach(h => fwdHeaders.delete(h));

    fwdHeaders.delete("x-forwarded-for")
    fwdHeaders.set("x-forwarded-host", url.host);
    fwdHeaders.set("x-forwarded-proto", url.protocol.slice(0, -1));

    // --- Layer 6: Request Timeout ---
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);


    // --- Layer 7: Safe Fetching and Final Response ---
    try {
        const targetUrl = new URL(request.url);
        targetUrl.protocol = 'https:';
        targetUrl.host = targetHost;
        targetUrl.port = '';
        targetUrl.pathname = '/' + pathSegments.join('/');

        console.log(targetUrl.toString())

        const newRequest = new Request(targetUrl.toString(), {
            headers: fwdHeaders,
            method: request.method,
            body: request.body,
            redirect: "follow",
            signal: controller.signal,
        });

        const response = await fetch(newRequest);
        clearTimeout(timeoutId);

        // Sanitize response headers before sending to client
        const responseHeaders = new Headers(response.headers);
        responseHeaders.delete("server"); // Obscure backend server technology
        responseHeaders.delete("x-powered-by");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        });

    } catch (error) {
        clearTimeout(timeoutId); // Ensure timeout is cleared on non-timeout errors too
        const errPayload = {
            level: "ERROR", timestamp: new Date().toISOString(), message: "Error fetching target host",
            clientIp, targetHost, error: error.message
        };

        if (error.name === 'AbortError') {
            errPayload.message = `Gateway Timeout: Request to '${targetHost}' exceeded ${PROXY_TIMEOUT_MS}ms.`;
            console.error(JSON.stringify(errPayload));
            return new Response(errPayload.message, { status: 504 });
        }

        console.error(JSON.stringify(errPayload));
        return new Response(`Bad Gateway: Could not reach target host '${targetHost}'.`, { status: 502 });
    }
});