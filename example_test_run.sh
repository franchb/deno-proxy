#!/bin/bash

# OpenAI Responses API Proxy Test Runner
# This script demonstrates how to run the comprehensive test suite

set -e  # Exit on any error

echo "🚀 OpenAI Responses API Proxy Test Runner"
echo "=========================================="

# Check if OpenAI API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ Error: OPENAI_API_KEY environment variable is not set"
    echo ""
    echo "Please set your OpenAI API key:"
    echo "  export OPENAI_API_KEY=sk-your-api-key-here"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ OPENAI_API_KEY is set"

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    echo "❌ Error: Deno is not installed"
    echo ""
    echo "Please install Deno from https://deno.land/"
    exit 1
fi

echo "✅ Deno is installed: $(deno --version | head -n 1)"

# Set test configuration
export ALLOWED_HOSTS="api.openai.com"
export PROXY_TIMEOUT_MS="30000"
export RATE_LIMIT_MAX_REQUESTS="1000"
export RATE_LIMIT_WINDOW_MS="60000"

echo ""
echo "📋 Test Configuration:"
echo "  ALLOWED_HOSTS: $ALLOWED_HOSTS"
echo "  PROXY_TIMEOUT_MS: $PROXY_TIMEOUT_MS"
echo "  RATE_LIMIT_MAX_REQUESTS: $RATE_LIMIT_MAX_REQUESTS"
echo "  RATE_LIMIT_WINDOW_MS: $RATE_LIMIT_WINDOW_MS"

echo ""
echo "🧪 Running comprehensive test suite..."
echo ""

# Run the simplified tests with proper permissions
deno test \
    --allow-net \
    --allow-env \
    --allow-run \
    --no-check \
    --reporter=pretty \
    test_openai_responses_simple.ts

TEST_EXIT_CODE=$?

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed successfully!"
    echo "🎉 Your proxy is working correctly with OpenAI's API"
    echo ""
    echo "You can now:"
    echo "  1. Deploy your proxy to production"
    echo "  2. Start using it with: http://your-proxy/api.openai.com/v1/..."
    echo "  3. Monitor the logs for security events"
else
    echo "❌ Some tests failed (exit code: $TEST_EXIT_CODE)"
    echo ""
    echo "Common issues and solutions:"
    echo "  - Invalid API key: Check your OPENAI_API_KEY"
    echo "  - Network issues: Check your internet connection"
    echo "  - Port conflicts: Make sure port 8001 is available"
    echo "  - Rate limits: Wait a few minutes and try again"
fi

echo ""
echo "📊 Test Summary:"
echo "  - Security tests: Whitelist and hostname validation"
echo "  - API tests: OpenAI API request forwarding"
echo "  - Authentication: API key handling and validation"
echo "  - Error handling: Invalid requests and proper error propagation"
echo "  - Headers: Custom header forwarding verification"

exit $TEST_EXIT_CODE
