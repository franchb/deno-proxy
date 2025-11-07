# Deno Multi-Host Proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made with Deno 2.5](https://img.shields.io/badge/Made%20with-Deno%202.5-1f2023?logo=deno)](https://deno.land/)
[![Test OpenAI Proxy](https://github.com/franchb/deno-proxy/actions/workflows/test-proxy.yml/badge.svg)](https://github.com/franchb/deno-proxy/actions/workflows/test-proxy.yml)
[![Security & Quality Scan](https://github.com/franchb/deno-proxy/actions/workflows/security-scan.yml/badge.svg)](https://github.com/franchb/deno-proxy/actions/workflows/security-scan.yml)

Deploy your own version of this example with a couple of clicks

[![Deploy on Deno](https://deno.com/button)](https://app.deno.com/new?clone=https://github.com/franchb/deno-proxy)


A security-hardened, multi-host, reverse proxy server built with [Deno 2.5+](https://deno.land) featuring modern permission sets, enhanced security controls, and comprehensive testing.

This project provides a simple yet powerful proxy that forwards incoming requests to different target hosts based on the URL path. It's designed to be deployed as a standalone service, for example on [Deno Deploy](https://deno.com/deploy).

It's an ideal solution for:
- Bypassing CORS restrictions during development.
- Consolidating multiple API endpoints under a single domain.
- Adding a layer of security (rate limiting, header sanitization) in front of existing services.

## Features

- **Dynamic Host Proxying**: Routes requests like `https://my-proxy.dev/api.example.com/data` to `https://api.example.com/data`.
- **Deno 2.5+ Features**: Modern permission sets, enhanced TCP configuration, and optimized performance.
- **Security First**: Built with a security-focused mindset to be safely exposed to the internet.
- **Whitelist Enforcement**: Only allows proxying to hosts specified in an `ALLOWED_HOSTS` list.
- **Wildcard Support**: Allows flexible whitelisting of subdomains (e.g., `*.github.com`).
- **Path Traversal Prevention**: Enhanced hostname validation with Unicode support.
- **Rate Limiting**: Protects against DoS attacks and abuse by limiting requests per IP.
- **Request Timeouts**: Prevents slowloris-style attacks and resource exhaustion.
- **Header Sanitization**: Strips sensitive headers and adds security headers.
- **Structured Logging**: Enhanced JSON logs with Deno version and stack traces.
- **Permission Sets**: Granular security with Deno 2.5+ permission configurations.
- **Modern Testing**: Comprehensive test suite using latest Deno test APIs.

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

- [Deno 2.5+](https://deno.land/manual/getting_started/installation) (required for modern features)

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
    With Deno 2.5+, you can use modern permission sets for enhanced security:

    ```sh
    # Using permission sets (Deno 2.5+)
    deno task start
    
    # Or with traditional permissions
    deno run -P=proxy-server main.ts
    
    # Or with explicit permissions
    deno run --allow-net --allow-env=ALLOWED_HOSTS,PROXY_TIMEOUT_MS,RATE_LIMIT_MAX_REQUESTS,RATE_LIMIT_WINDOW_MS main.ts
    ```

    The server will start on `http://localhost:8000` with enhanced TCP backlog for better performance.

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
| `PROXY_PORT`              | Port for the proxy server to listen on.                                  | `8000`      | No       |
| `PROXY_TIMEOUT_MS`        | Timeout in milliseconds for requests to the target host.                 | `600000`    | No       |
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
-   **Permission Sets**: Deno 2.5+ permission sets provide granular security. Use `-P=proxy-server` for production with minimal required permissions.
-   **Rate Limiting**: The default rate limits are sensible but should be tuned based on your expected traffic. Note that the in-memory rate limiter will reset with each deployment. For a more persistent solution, an external service (like a Redis-based limiter) would be needed.
-   **Enhanced Security**: Modern hostname validation supports Unicode domains and additional security headers are automatically added.
-   **Logging**: The proxy outputs enhanced structured JSON logs with Deno version info, stack traces, and detailed error context for better monitoring and debugging.

## Continuous Integration

This project uses GitHub Actions for automated testing and security scanning:

### Automated Testing
- **Pull Request Testing**: Every PR is automatically tested against OpenAI's API
- **Merge Testing**: Tests run on every merge to main branch
- **Multiple Deno Versions**: Compatibility tested across Deno versions

### Security Scanning
- **Weekly Security Scans**: Automated vulnerability detection
- **Secret Detection**: Prevents hardcoded API keys and secrets
- **Dependency Analysis**: Monitors for unsafe dependencies
- **Code Quality Checks**: Ensures best practices

### Setting Up CI/CD

To enable automated testing in your fork:

1. **Add OpenAI API Key Secret**:
   ```
   GitHub Repository → Settings → Secrets and variables → Actions
   → New repository secret
   Name: OPENAI_API_KEY
   Value: sk-your-openai-api-key-here
   ```

2. **Enable GitHub Actions**:
   - Actions are enabled by default when you fork
   - Tests will run automatically on PRs and pushes to main

3. **View Test Results**:
   - Check the Actions tab in your GitHub repository
   - Green checkmarks indicate passing tests
   - Red X marks indicate failures with detailed logs

### Manual Testing Commands

Run tests locally before pushing:

```bash
# Set your API key
export OPENAI_API_KEY=sk-your-key-here

# Run basic tests with Deno 2.5+ permission sets (recommended)
deno task test-simple

# Run comprehensive tests
deno task test

# Run type checking
deno task check

# Run linting with modern rules
deno task lint

# Format code
deno task fmt
```

### Deno 2.5+ Features

This project leverages modern Deno 2.5 features:
- **Permission Sets**: Granular security configuration in `deno.json`
- **Enhanced Testing**: Modern test APIs with setup/teardown hooks
- **Lint Rules**: `no-unversioned-import` and `no-import-prefix` for better dependency management
- **TCP Optimization**: Enhanced server performance with configurable backlog
- **Unicode Support**: International domain name support in hostname validation

### CI/CD Workflow Files

- `.github/workflows/test-proxy.yml` - Main test workflow (Deno 2.5+ optimized)
- `.github/workflows/security-scan.yml` - Security and quality analysis with modern checks

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.