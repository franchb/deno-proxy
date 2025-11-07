# OpenAI Responses API Proxy Testing

This directory contains comprehensive tests for the Deno proxy server specifically designed to test integration with OpenAI's Responses API endpoint.

## Overview

The test suite validates that the proxy correctly:

- Forwards requests to OpenAI's API endpoints
- Handles authentication properly
- Maintains request/response integrity
- Implements security controls (host whitelisting, rate limiting)
- Properly streams responses
- Handles errors gracefully

## Prerequisites

1. **Deno Runtime**: Ensure you have Deno installed (v1.x or later)
2. **OpenAI API Key**: You must have a valid OpenAI API key set as an environment variable

## Setup

### 1. Set Environment Variables

```bash
# Required: Your OpenAI API key
export OPENAI_API_KEY=sk-your-api-key-here

# Optional: Additional proxy configuration (defaults are provided)
export PROXY_TIMEOUT_MS=30000
export RATE_LIMIT_MAX_REQUESTS=1000
export RATE_LIMIT_WINDOW_MS=60000
```

### 2. Install Dependencies

```bash
# Dependencies are handled automatically by Deno
# But you can cache them with:
deno cache test_openai_responses.ts
```

## Running Tests

### Option 1: Using the Test Runner (Recommended)

```bash
# Make the runner executable and run
chmod +x run_tests.ts
./run_tests.ts
```

Or:

```bash
deno run --allow-net --allow-env --allow-run run_tests.ts
```

### Option 2: Direct Test Execution

```bash
# Run with required permissions
deno test --allow-net --allow-env --allow-run test_openai_responses.ts
```

### Option 3: Using Deno Task

```bash
deno task test
```

## Test Coverage

### Security Tests

- ✅ **Host Whitelisting**: Verifies only `api.openai.com` is allowed
- ✅ **Invalid Host Rejection**: Confirms malicious hostnames are blocked
- ✅ **Rate Limiting**: Tests legitimate requests aren't throttled
- ✅ **Authentication Handling**: Validates API key forwarding

### API Integration Tests

- ✅ **List Responses**: Tests `GET /v1/responses`
- ✅ **Create Response**: Tests `POST /v1/responses`
- ✅ **Retrieve Response**: Tests `GET /v1/responses/{id}`
- ✅ **Chat Completions**: Tests `POST /v1/chat/completions`
- ✅ **Models Endpoint**: Tests `GET /v1/models`

### Proxy Functionality Tests

- ✅ **Request Forwarding**: Ensures requests reach OpenAI correctly
- ✅ **Response Streaming**: Validates streaming response handling
- ✅ **Header Processing**: Tests custom header forwarding
- ✅ **Timeout Handling**: Confirms timeout configuration works
- ✅ **Error Propagation**: Verifies OpenAI errors are properly forwarded

### Comparison Tests

- ✅ **Direct vs Proxy**: Compares responses from direct API calls vs proxy calls
- ✅ **Response Integrity**: Ensures proxy doesn't modify response data
- ✅ **Status Code Mapping**: Confirms HTTP status codes are preserved

## Test Structure

### Main Test Files

- `test_openai_responses.ts` - Main test suite with comprehensive coverage
- `run_tests.ts` - Test runner with environment validation

### Test Flow

1. **Setup Phase**: Starts proxy server with test configuration
2. **Security Tests**: Validates security controls are working
3. **API Tests**: Tests actual OpenAI API endpoints through proxy
4. **Integration Tests**: End-to-end workflow validation
5. **Cleanup Phase**: Stops proxy server and cleans up resources

## Configuration

The tests use these environment variables:

| Variable                  | Purpose                        | Test Default     |
| ------------------------- | ------------------------------ | ---------------- |
| `OPENAI_API_KEY`          | Authentication with OpenAI API | **Required**     |
| `ALLOWED_HOSTS`           | Proxy host whitelist           | `api.openai.com` |
| `PROXY_TIMEOUT_MS`        | Request timeout                | `30000` (30s)    |
| `RATE_LIMIT_MAX_REQUESTS` | Rate limit threshold           | `1000`           |
| `RATE_LIMIT_WINDOW_MS`    | Rate limit window              | `60000` (1min)   |

## Expected Results

### Successful Test Run

```
OpenAI Responses API Proxy Tests
  ✅ Test proxy server is running
  ✅ Test forbidden host rejection
  ✅ Test invalid hostname rejection
  ✅ Test OpenAI Responses API - List responses
  ✅ Test OpenAI Responses API - Create response
  ✅ Test OpenAI Responses API - Retrieve specific response
  ✅ Test authentication handling
  ✅ Test invalid API key handling
  ✅ Test request headers forwarding
  ✅ Test request timeout handling
  ✅ Test rate limiting bypass
  ✅ Test response streaming

OpenAI Responses API Integration
  ✅ Test end-to-end response creation and retrieval
  ✅ Test error handling for invalid requests

All tests passed!
```

## Troubleshooting

### Common Issues

**"OPENAI_API_KEY environment variable is required"**

- Solution: Set your OpenAI API key: `export OPENAI_API_KEY=sk-your-key`

**"Connection refused" or "Server not starting"**

- Solution: Ensure port 8001 is available, or modify `PROXY_PORT` in test file

**"403 Forbidden" from OpenAI**

- Solution: Verify your API key is valid and has necessary permissions

**"Rate limit exceeded"**

- Solution: Wait a moment and retry, or check your OpenAI account usage

**"Tests timing out"**

- Solution: Increase `PROXY_TIMEOUT_MS` or check network connectivity

### Debug Mode

For more verbose output, run with debug logging:

```bash
DENO_LOG=debug deno test --allow-net --allow-env --allow-run test_openai_responses.ts
```

## Security Considerations

- Tests use real API keys and make actual API calls to OpenAI
- Ensure your API key has appropriate usage limits set
- Tests are designed to minimize API usage while providing comprehensive coverage
- All test data uses minimal token counts to reduce costs

## Contributing

When adding new tests:

1. Follow the existing test structure and naming conventions
2. Ensure tests clean up any resources they create
3. Add both positive and negative test cases
4. Document any new environment variables needed
5. Update this README with new test descriptions

## API Cost Estimation

The test suite makes approximately:

- 10-15 API calls to OpenAI endpoints
- Uses minimal tokens (20-100 per request)
- Estimated cost: $0.01-0.05 per full test run

Monitor your OpenAI usage dashboard to track actual costs.
