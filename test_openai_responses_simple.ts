import { assert, assertEquals, assertExists } from "@std/assert";

// Test configuration with Deno 2.5 environment handling
const PROXY_PORT = parseInt(Deno.env.get("PROXY_PORT") ?? "8000", 10);
const PROXY_HOST = `http://localhost:${PROXY_PORT}`;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!OPENAI_API_KEY) {
  console.error(
    "❌ OPENAI_API_KEY environment variable is required for testing",
  );
  console.error(
    "Set it in your environment: export OPENAI_API_KEY=sk-your-key",
  );
  Deno.exit(1);
}

// Start proxy server for testing with Deno 2.5+ permission sets
async function startProxyServer(): Promise<Deno.ChildProcess> {
  const env = {
    ...Deno.env.toObject(),
    ALLOWED_HOSTS: "api.openai.com",
    PROXY_PORT: PROXY_PORT.toString(),
    PROXY_TIMEOUT_MS: "30000",
    RATE_LIMIT_MAX_REQUESTS: "1000",
    RATE_LIMIT_WINDOW_MS: "60000",
  };

  const process = new Deno.Command("deno", {
    args: ["run", "-P=proxy-server", "main.ts"],
    env,
    stdout: "null",
    stderr: "null",
  }).spawn();

  // Wait for server to start and verify it's responding
  let retries = 30;
  let serverReady = false;

  while (retries > 0 && !serverReady) {
    try {
      const response = await fetch(
        `http://localhost:${PROXY_PORT}/test-host.com/test`,
        { signal: AbortSignal.timeout(2000) },
      );
      await response.text(); // Consume body

      if (response.status === 403) {
        serverReady = true;
        break;
      }
    } catch (error) {
      // Server not ready yet - only log if it's the last attempt
      if (retries === 1) {
        console.warn(`Server startup attempt failed: ${error}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    retries--;
  }

  if (!serverReady) {
    try {
      process.kill("SIGTERM");
      await process.status;
    } catch {
      // Process might already be dead
    }
    throw new Error(`Proxy server failed to start within timeout`);
  }

  console.log("✅ Proxy server started successfully on port", PROXY_PORT);
  return process;
}

// Helper function to make authenticated requests through proxy
async function makeProxyRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
): Promise<Response> {
  const url = `${PROXY_HOST}/api.openai.com${endpoint}`;

  const headers: HeadersInit = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "User-Agent": "deno-proxy-test/1.0.0",
  };

  const requestInit: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    requestInit.body = JSON.stringify(body);
  }

  return await fetch(url, requestInit);
}

// Global test setup using Deno 2.5 test APIs
let proxyProcess: Deno.ChildProcess | undefined;

Deno.test.beforeAll(async () => {
  console.log("🚀 Setting up proxy server for all tests...");
  try {
    proxyProcess = await startProxyServer();
  } catch (error) {
    console.error(
      "❌ Failed to start proxy server:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
});

Deno.test.afterAll(async () => {
  console.log("🛑 Cleaning up proxy server...");
  if (proxyProcess) {
    try {
      proxyProcess.kill("SIGTERM");
      await proxyProcess.status;
    } catch (error) {
      console.warn(
        "Warning: Error stopping proxy server:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
});

Deno.test("OpenAI Proxy Basic Tests", async (t) => {
  await t.step("Test proxy server is running", async () => {
    const response = await fetch(`${PROXY_HOST}/api.openai.com/v1/models`, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    });

    const text = await response.text(); // Consume body

    assert(
      response.status === 200 ||
        response.status === 401 ||
        response.status === 403,
      `Proxy server should be accessible, got ${response.status}`,
    );
  });

  await t.step("Test forbidden host rejection", async () => {
    const response = await fetch(`${PROXY_HOST}/evil-site.com/v1/responses`);
    assertEquals(response.status, 403, "Should reject non-whitelisted hosts");

    const text = await response.text();
    assert(
      text.includes("not in the allowed list"),
      "Should explain why request was blocked",
    );
  });

  await t.step("Test invalid hostname rejection", async () => {
    const response = await fetch(`${PROXY_HOST}/invalid..hostname/test`);
    assertEquals(response.status, 400, "Should reject malformed hostnames");

    const text = await response.text();
    assert(
      text.includes("Invalid host format"),
      "Should explain hostname validation failure",
    );
  });

  await t.step("Test OpenAI API forwarding", async () => {
    const response = await makeProxyRequest("/v1/models");

    // Should forward to OpenAI correctly (200 or 401 is fine)
    assert(
      response.status === 200 || response.status === 401,
      `Expected 200 or 401, got ${response.status}`,
    );

    const text = await response.text();
    assertExists(text, "Response should have content");
  });

  await t.step("Test authentication handling", async () => {
    const response = await fetch(`${PROXY_HOST}/api.openai.com/v1/models`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Should get 401 Unauthorized without API key
    assertEquals(response.status, 401, "Should require authentication");
    await response.text(); // Consume body
  });

  await t.step("Test invalid API key handling", async () => {
    const response = await fetch(`${PROXY_HOST}/api.openai.com/v1/models`, {
      headers: {
        Authorization: "Bearer invalid-key",
        "Content-Type": "application/json",
      },
    });

    // Should get 401 Unauthorized
    assertEquals(response.status, 401);
    await response.text(); // Consume body
  });

  await t.step("Test request headers forwarding", async () => {
    const customHeaders = {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "X-Custom-Header": "test-value",
      "User-Agent": "custom-test-agent",
    };

    const response = await fetch(`${PROXY_HOST}/api.openai.com/v1/models`, {
      headers: customHeaders,
    });

    await response.text(); // Consume body

    // OpenAI should receive the request successfully
    assert(response.status === 200 || response.status === 401);
  });

  await t.step("Test chat completions endpoint", async () => {
    const createPayload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "Say 'Hello from proxy test!' and nothing else.",
        },
      ],
      max_tokens: 20,
      temperature: 0,
    };

    const response = await makeProxyRequest(
      "/v1/chat/completions",
      "POST",
      createPayload,
    );

    // With a fake API key, we expect 401; with real key, expect 200
    assert(response.status === 200 || response.status === 401);

    if (response.status === 200) {
      const responseData = await response.json();
      assertExists(responseData.id);
      assertExists(responseData.choices);
      assert(responseData.choices.length > 0);
    } else {
      await response.text(); // Consume body
      console.log("ℹ️ Got 401 as expected with test API key");
    }
  });

  await t.step("Test error handling for invalid requests", async () => {
    const invalidPayload = {
      model: "invalid-model-name",
      messages: [
        {
          role: "user",
          content: "Test message",
        },
      ],
    };

    const response = await makeProxyRequest(
      "/v1/chat/completions",
      "POST",
      invalidPayload,
    );

    // Should get error response from OpenAI (forwarded through proxy)
    // or 401 with fake API key
    assert(response.status >= 400);

    const text = await response.text();
    assertExists(text);
  });
});
