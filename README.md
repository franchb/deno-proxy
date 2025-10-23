# Deno Multi-Host Proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made with Deno](https://img.shields.io/badge/Made%20with-Deno-1f2023?logo=deno)](https://deno.land/)

Deploy your own version of this example with a couple of clicks

[![Deploy on Deno](https://deno.com/button)](https://app.deno.com/new?clone=https://github.com/franchb/deno-proxy)


A security-hardened, multi-host, reverse proxy server built with [Deno](https://deno.land).

This project provides a simple yet powerful proxy that forwards incoming requests to different target hosts based on the URL path. It's designed to be deployed as a standalone service, for example on [Deno Deploy](https://deno.com/deploy).

It's an ideal solution for:
- Bypassing CORS restrictions during development.
- Consolidating multiple API endpoints under a single domain.
- Adding a layer of security (rate limiting, header sanitization) in front of existing services.

## Features

- **Dynamic Host Proxying**: Routes requests like `https://my-proxy.dev/api.example.com/data` to `https://api.example.com/data`.
- **Security First**: Built with a security-focused mindset to be safely exposed to the internet.
- **Whitelist Enforcement**: Only allows proxying to hosts specified in an `ALLOWED_HOSTS` list.
- **Wildcard Support**: Allows flexible whitelisting of subdomains (e.g., `*.github.com`).
- **Path Traversal Prevention**: Safely handles hostnames to prevent bypass attacks.
- **Rate Limiting**: Protects against DoS attacks and abuse by limiting requests per IP.
- **Request Timeouts**: Prevents slowloris-style attacks and resource exhaustion.
- **Header Sanitization**: Strips sensitive headers from both incoming and outgoing traffic.
- **Structured Logging**: Outputs logs in JSON format for easy parsing and monitoring.
- **Configurable**: All security parameters are configurable via environment variables.

## How It Works

The proxy extracts the target hostname from the first segment of the URL path.

**Example Request:**
`https://your-proxy-domain.deno.dev/mcp.exa.ai/some/path?query=1`

1.  The proxy receives the request.
2.  It extracts `mcp.exa.ai` as the target host.
3.  It validates that `mcp.exa.ai` is a valid hostname and is present in the `ALLOWED_HOSTS` whitelist.
4.  It reconstructs the target URL: `https://mcp.exa.ai/some/path?query=1`.
5.  It forwards the original request (including method, body, and sanitized headers) to the target URL.
6.  The response from the target is then streamed back to the original client.

## Getting Started

### Prerequisites

- [Deno](https://deno.land/manual/getting_started/installation) (v1.x or later)

### Running Locally

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/franchb/deno-proxy.git
    cd deno-proxy
    ```

2.  **Set Environment Variables:**
    The `ALLOWED_HOSTS` variable is **required**. This is a comma-separated list of host patterns that the proxy is allowed to connect to.

    **On macOS/Linux:**
    ```sh
    export ALLOWED_HOSTS="api.github.com,*.deno.land"
    ```

    **On Windows (Command Prompt):**
    ```cmd
    set ALLOWED_HOSTS=api.github.com,*.deno.land
    ```

3.  **Run the server:**
    The server requires network and environment variable permissions.

    ```sh
    deno run --allow-net --allow-env=ALLOWED_HOSTS,PROXY_TIMEOUT_MS,RATE_LIMIT_MAX_REQUESTS,RATE_LIMIT_WINDOW_MS proxy.ts
    ```

    The server will start on `http://localhost:8000`.

4.  **Test the proxy:**
    ```sh
    # This will be proxied to https://api.github.com/users/denoland
    curl http://localhost:8000/api.github.com/users/denoland

    # This will be blocked with a 403 Forbidden error
    curl http://localhost:8000/google.com
    ```

## Configuration

All configuration is handled through environment variables, making it easy to deploy and manage.

| Variable                  | Description                                                              | Default     | Required |
| ------------------------- | ------------------------------------------------------------------------ | ----------- | -------- |
| `ALLOWED_HOSTS`           | Comma-separated list of whitelisted host patterns. Wildcards (`*`) are supported for a single hostname segment. | `""`        | **Yes**  |
| `PROXY_TIMEOUT_MS`        | Timeout in milliseconds for requests to the target host.                 | `15000`     | No       |
| `RATE_LIMIT_WINDOW_MS`    | The time window for rate limiting, in milliseconds.                      | `60000`     | No       |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum number of requests allowed from a single IP within the window.   | `100`       | No       |

## Deployment (Deno Deploy)

This project is perfectly suited for [Deno Deploy](https://deno.com/deploy).

1.  Fork this repository.
2.  Create a new project on Deno Deploy and link it to your forked repository.
3.  Choose the `proxy.ts` file as the entry point.
4.  In the project settings on Deno Deploy, go to **Settings -> Environment Variables** and add your configuration. At a minimum, you must set `ALLOWED_HOSTS`.

    ![Deno Deploy Environment Variables](https://docs.deno.com/deploy/manual/assets/env_vars_add.png)

## Security Considerations

This proxy has been built with several security measures in place.

-   **Whitelist is Paramount**: The `ALLOWED_HOSTS` list is your primary defense. Keep it as restrictive as possible. Avoid overly permissive patterns like `*` or `*.com`.
-   **Rate Limiting**: The default rate limits are sensible but should be tuned based on your expected traffic. Note that the in-memory rate limiter will reset with each deployment. For a more persistent solution, an external service (like a Redis-based limiter) would be needed.
-   **Logging**: The proxy outputs structured JSON logs for security events (forbidden attempts, timeouts, errors). In a production environment, you should forward these logs to a dedicated logging service for monitoring and alerting.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.