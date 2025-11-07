#!/usr/bin/env -S deno run --allow-net --allow-env --allow-run

/**
 * Simple server startup test to debug connection issues
 */

async function testServerStartup() {
    console.log("🔧 Testing proxy server startup...");

    // Set test environment
    const env = {
        ...Deno.env.toObject(),
        ALLOWED_HOSTS: "api.openai.com",
        PROXY_PORT: "8000",
        PROXY_TIMEOUT_MS: "30000",
        RATE_LIMIT_MAX_REQUESTS: "1000",
        RATE_LIMIT_WINDOW_MS: "60000",
    };

    console.log("📋 Environment:", {
        ALLOWED_HOSTS: env.ALLOWED_HOSTS,
        PROXY_PORT: env.PROXY_PORT,
        PROXY_TIMEOUT_MS: env.PROXY_TIMEOUT_MS,
    });

    // Start proxy server
    console.log("🚀 Starting proxy server...");
    const process = new Deno.Command("deno", {
        args: ["run", "--allow-net", "--allow-env", "main.ts"],
        env,
        stdout: "piped",
        stderr: "piped",
    }).spawn();

    // Wait and test connectivity
    console.log("⏳ Waiting for server to start...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test server response
    try {
        console.log("🧪 Testing server connectivity...");
        const response = await fetch("http://localhost:8000/test-host.com/test");
        console.log("✅ Server responded with status:", response.status);
        console.log("📄 Response text:", await response.text());

        if (response.status === 403) {
            console.log("🎉 Server is working correctly (403 for non-whitelisted host)");
        }
    } catch (error) {
        console.error("❌ Connection failed:", error.message);
    }

    // Test with allowed host
    try {
        console.log("🧪 Testing with allowed host...");
        const response = await fetch("http://localhost:8000/api.openai.com/v1/models");
        console.log("✅ Allowed host responded with status:", response.status);

        if (response.status >= 200 && response.status < 500) {
            console.log("🎉 Proxy is forwarding requests correctly");
        }
    } catch (error) {
        console.error("❌ Allowed host test failed:", error.message);
    }

    // Clean up
    console.log("🧹 Cleaning up...");
    process.kill("SIGTERM");
    await process.status;

    console.log("✅ Test completed");
}

if (import.meta.main) {
    await testServerStartup();
}
