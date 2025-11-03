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

        // Directly return the promise from fetch. This supports streaming.
        const responsePromise = fetch(targetUrl.toString(), {
            headers: fwdHeaders,
            method: request.method,
            body: request.body,
            redirect: "follow",
            signal: controller.signal,
        });
        
        // Clear the timeout once the response is received
        responsePromise.then(() => clearTimeout(timeoutId)).catch(() => clearTimeout(timeoutId));
        
        return await responsePromise;

    } catch (error) {
        clearTimeout(timeoutId); 
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
