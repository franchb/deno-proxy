#!/usr/bin/env -S deno run --allow-net --allow-env --allow-run

/**
 * Test Runner for Deno Proxy OpenAI Integration Tests
 *
 * This script sets up the environment and runs comprehensive tests
 * for the Deno proxy against OpenAI's Responses API.
 */

async function main() {
    console.log("🚀 Starting Deno Proxy OpenAI Integration Tests\n");

    // Check for required environment variables
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
        console.error("❌ Error: OPENAI_API_KEY environment variable is required");
        console.error("   Please set your OpenAI API key:");
        console.error("   export OPENAI_API_KEY=your_api_key_here\n");
        Deno.exit(1);
    }

    console.log("✅ OPENAI_API_KEY found");
    console.log(`   Key preview: ${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`);

    // Set test environment variables
    const testEnv = {
        ...Deno.env.toObject(),
        ALLOWED_HOSTS: "api.openai.com",
        PROXY_TIMEOUT_MS: "30000",
        RATE_LIMIT_MAX_REQUESTS: "1000",
        RATE_LIMIT_WINDOW_MS: "60000",
    };

    console.log("\n📋 Test Configuration:");
    console.log(`   ALLOWED_HOSTS: ${testEnv.ALLOWED_HOSTS}`);
    console.log(`   PROXY_TIMEOUT_MS: ${testEnv.PROXY_TIMEOUT_MS}`);
    console.log(`   RATE_LIMIT_MAX_REQUESTS: ${testEnv.RATE_LIMIT_MAX_REQUESTS}`);
    console.log(`   RATE_LIMIT_WINDOW_MS: ${testEnv.RATE_LIMIT_WINDOW_MS}`);

    console.log("\n🧪 Running tests...\n");

    // Run the tests
    const testCommand = new Deno.Command("deno", {
        args: [
            "test",
            "--allow-net",
            "--allow-env",
            "--allow-run",
            "--reporter=pretty",
            "test_openai_responses.ts"
        ],
        env: testEnv,
        stdout: "inherit",
        stderr: "inherit"
    });

    const testProcess = testCommand.spawn();
    const result = await testProcess.status;

    if (result.success) {
        console.log("\n✅ All tests passed!");
        console.log("🎉 Proxy successfully tested against OpenAI Responses API");
    } else {
        console.log("\n❌ Some tests failed");
        console.log("📝 Check the output above for details");
        Deno.exit(1);
    }
}

if (import.meta.main) {
    await main();
}
