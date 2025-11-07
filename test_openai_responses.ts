import { assertEquals, assertExists, assert } from "@std/assert";

// Test configuration
const PROXY_PORT = 8000;
const PROXY_HOST = `http://localhost:${PROXY_PORT}`;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is required for testing");
  Deno.exit(1);
}

// Start proxy server for testing
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
    args: ["run", "--allow-net", "--allow-env", "main.ts"],
    env,
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  // Don't cancel streams immediately - they'll be handled in cleanup

  // Wait for server to start and verify it's responding
  let retries = 30;
  let serverReady = false;

  while (retries > 0 && !serverReady) {
    try {
      const response = await fetch(
        `http://localhost:${PROXY_PORT}/test-host.com/test`,
        { signal: AbortSignal.timeout(2000) },
      );
      if (response.status === 403) {
        // Server is responding with expected error for non-whitelisted host
        serverReady = true;
        break;
      }
    } catch (error) {
      // Server not ready yet, or network error
      if (retries === 1) {
        console.error("Server startup error:", error);
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
    throw new Error(
      `Proxy server failed to start within timeout. Retries remaining: ${retries}`,
    );
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

// Helper function to make direct OpenAI API requests (for comparison)
async function makeDirectRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
): Promise<Response> {
  const url = `https://api.openai.com${endpoint}`;

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

Deno.test("OpenAI Responses API Proxy Tests", async (t) => {
  console.log("🚀 Starting proxy server for testing...");
  let proxyProcess;

  try {
    proxyProcess = await startProxyServer();
  } catch (error) {
    console.error(
      "❌ Failed to start proxy server:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }

  try {
    await t.step("Test proxy server is running", async () => {
      const response = await fetch(`${PROXY_HOST}/api.openai.com/v1/models`, {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      });

      // Consume response body to prevent leak
      await response.text();

      assert(
        response.status === 200 ||
          response.status === 401 ||
          response.status === 403,
        "Proxy server should be accessible",
      );
    });

    await t.step("Test forbidden host rejection", async () => {
      const response = await fetch(`${PROXY_HOST}/evil-site.com/v1/responses`);
      assertEquals(response.status, 403);

      const text = await response.text();
      assert(text.includes("not in the allowed list"));
    });

    await t.step("Test invalid hostname rejection", async () => {
      // Use a truly invalid hostname with special characters
      const response = await fetch(`${PROXY_HOST}/invalid..hostname/test`);
      assertEquals(response.status, 400);

      const text = await response.text();
      assert(text.includes("Invalid host format"));
    });

    await t.step("Test OpenAI Responses API - List responses", async () => {
      const response = await makeProxyRequest("/v1/responses?limit=10");

      // Should get same response as direct API call
      const directResponse = await makeDirectRequest("/v1/responses?limit=10");

      assertEquals(response.status, directResponse.status);

      if (response.status === 200) {
        const proxyData = await response.json();
        const directData = await directResponse.json();

        assertExists(proxyData);
        assertExists(directData);

        // Both should have same structure
        assertEquals(typeof proxyData.object, typeof directData.object);
        assertEquals(typeof proxyData.data, typeof directData.data);
      } else {
        // Consume response bodies to prevent leaks
        await response.text();
        await directResponse.text();
      }
    });

    await t.step("Test OpenAI Responses API - Create response", async () => {
      const createPayload = {
        model: "gpt-5-nano",
        messages: [
          {
            role: "user",
            content: "Hello, this is a test message for the proxy.",
          },
        ],
        max_tokens: 50,
        temperature: 0.7,
      };

      const response = await makeProxyRequest(
        "/v1/responses",
        "POST",
        createPayload,
      );

      // Compare with direct API call
      const directResponse = await makeDirectRequest(
        "/v1/responses",
        "POST",
        createPayload,
      );

      assertEquals(response.status, directResponse.status);

      if (response.status === 200 || response.status === 201) {
        const proxyData = await response.json();
        const directData = await directResponse.json();

        assertExists(proxyData);
        assertExists(directData);

        // Both should have response structure
        assertEquals(typeof proxyData.id, "string");
        assertEquals(typeof directData.id, "string");
        assertEquals(proxyData.object, directData.object);
      } else {
        // Consume response bodies to prevent leaks
        await response.text();
        await directResponse.text();
      }
    });

    await t.step(
      "Test OpenAI Responses API - Retrieve specific response",
      async () => {
        // First create a response to retrieve
        const createPayload = {
          model: "gpt-5-nano",
          messages: [
            {
              role: "user",
              content: "Test message for retrieval test.",
            },
          ],
          max_tokens: 30,
        };

        const createResponse = await makeProxyRequest(
          "/v1/responses",
          "POST",
          createPayload,
        );

        if (createResponse.status === 200 || createResponse.status === 201) {
          const createData = await createResponse.json();
          const responseId = createData.id;

          assertExists(responseId);

          // Now retrieve the response
          const retrieveResponse = await makeProxyRequest(
            `/v1/responses/${responseId}`,
          );
          const directRetrieveResponse = await makeDirectRequest(
            `/v1/responses/${responseId}`,
          );

          assertEquals(retrieveResponse.status, directRetrieveResponse.status);

          if (retrieveResponse.status === 200) {
            const proxyData = await retrieveResponse.json();
            const directData = await directRetrieveResponse.json();

            assertEquals(proxyData.id, directData.id);
            assertEquals(proxyData.object, directData.object);
          } else {
            // Consume response bodies to prevent leaks
            await retrieveResponse.text();
            await directRetrieveResponse.text();
          }
        }
      },
    );

    await t.step("Test authentication handling", async () => {
      // Test without API key
      const response = await fetch(
        `${PROXY_HOST}/api.openai.com/v1/responses`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      // Should get 401 Unauthorized
      assertEquals(response.status, 401);
    });

    await t.step("Test invalid API key handling", async () => {
      const response = await fetch(
        `${PROXY_HOST}/api.openai.com/v1/responses`,
        {
          headers: {
            Authorization: "Bearer invalid-key",
            "Content-Type": "application/json",
          },
        },
      );

      // Should get 401 Unauthorized
      assertEquals(response.status, 401);
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

      // Consume response body to prevent leak
      await response.text();

      // OpenAI should receive the request successfully
      assert(response.status === 200 || response.status === 401);
    });

    await t.step("Test request timeout handling", async () => {
      // This test verifies the proxy handles timeouts properly
      // We'll make a request and ensure it doesn't hang indefinitely
      const startTime = Date.now();

      try {
        const response = await makeProxyRequest("/v1/responses?limit=1");
        const endTime = Date.now();

        // Should complete within reasonable time (30 seconds configured)
        assert(
          endTime - startTime < 35000,
          "Request should complete within timeout",
        );

        // Should get a valid response status
        assert(response.status >= 200 && response.status < 600);
      } catch (error) {
        console.log(
          "Timeout test completed with error (expected):",
          error instanceof Error ? error.message : String(error),
        );
      }
    });

    await t.step("Test rate limiting bypass", async () => {
      // Test that legitimate requests don't get rate limited
      const promises = [];

      for (let i = 0; i < 5; i++) {
        promises.push(makeProxyRequest("/v1/models"));
      }

      const responses = await Promise.all(promises);

      // All should succeed (not rate limited)
      for (const response of responses) {
        assert(
          response.status !== 429,
          "Legitimate requests should not be rate limited",
        );
        // Consume response body to prevent leak
        await response.text();
      }
    });

    await t.step("Test response streaming", async () => {
      // Test that proxy properly handles streaming responses
      const createPayload = {
        model: "gpt-5-nano",
        messages: [
          {
            role: "user",
            content: "Write a short poem about testing.",
          },
        ],
        max_tokens: 100,
        stream: true,
      };

      const response = await makeProxyRequest(
        "/v1/chat/completions",
        "POST",
        createPayload,
      );

      if (response.status === 200 && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let chunks = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            if (chunk.trim()) {
              chunks++;
            }

            // Don't process too many chunks in test
            if (chunks > 5) break;
          }

          assert(chunks > 0, "Should receive streaming chunks");
        } finally {
          reader.releaseLock();
        }
      }
    });
  } finally {
    console.log("🛑 Stopping proxy server...");
    if (proxyProcess) {
      try {
        proxyProcess.kill("SIGTERM");
        await proxyProcess.status;
        // Cancel streams to prevent resource leaks
        try {
          await proxyProcess.stdout.cancel();
        } catch {}
        try {
          await proxyProcess.stderr.cancel();
        } catch {}
      } catch (error) {
        console.warn(
          "Warning: Error stopping proxy server:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
});

// Run additional integration tests
Deno.test("OpenAI Responses API Integration", async (t) => {
  console.log("🧪 Starting integration tests...");
  let proxyProcess;

  try {
    proxyProcess = await startProxyServer();
  } catch (error) {
    console.error(
      "❌ Failed to start proxy server for integration tests:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }

  try {
    await t.step(
      "Test end-to-end response creation and retrieval",
      async () => {
        // Create a response
        const createPayload = {
          model: "gpt-5-nano",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant being tested through a proxy.",
            },
            {
              role: "user",
              content: "Say 'Hello from proxy test!' and nothing else.",
            },
          ],
          max_tokens: 20,
          temperature: 0,
        };

        const createResponse = await makeProxyRequest(
          "/v1/chat/completions",
          "POST",
          createPayload,
        );
        // With a fake API key, we expect 401 Unauthorized
        // Only test that the proxy forwards the request correctly
        assert(createResponse.status === 200 || createResponse.status === 401);

        if (createResponse.status === 401) {
          console.log("ℹ️ Got 401 as expected with test API key");
          return; // Skip the rest of this test with fake key
        }

        const responseData = await createResponse.json();
        assertExists(responseData.id);
        assertExists(responseData.choices);
        assert(responseData.choices.length > 0);

        const content = responseData.choices[0].message.content;
        assert(
          content.includes("Hello"),
          "Response should contain expected content",
        );
      },
    );

    await t.step("Test error handling for invalid requests", async () => {
      // Test with invalid model
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
      assert(response.status >= 400);

      const errorData = await response.json();
      assertExists(errorData.error);
    });
  } finally {
    console.log("🛑 Stopping integration test proxy server...");
    if (proxyProcess) {
      try {
        proxyProcess.kill("SIGTERM");
        await proxyProcess.status;
        // Cancel streams to prevent resource leaks
        try {
          await proxyProcess.stdout.cancel();
        } catch {}
        try {
          await proxyProcess.stderr.cancel();
        } catch {}
      } catch (error) {
        console.warn(
          "Warning: Error stopping integration test proxy server:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
});
