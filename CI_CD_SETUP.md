# CI/CD Setup Guide for Deno OpenAI Proxy

This document provides a comprehensive guide for setting up Continuous Integration and Continuous Deployment (CI/CD) for the Deno OpenAI Proxy project.

## Overview

The CI/CD pipeline automatically:

- Tests proxy functionality against OpenAI API on every PR and merge
- Performs security scans and code quality checks
- Validates compatibility across multiple Deno versions
- Generates detailed test reports and security analysis

## 🚀 Quick Setup

### 1. Fork the Repository

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/deno-proxy.git
cd deno-proxy
```

### 2. Add OpenAI API Key Secret

1. Go to your GitHub repository
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **"New repository secret"**
4. Set:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key (starts with `sk-`)

### 3. Enable Actions (if needed)

- GitHub Actions are enabled by default for forks
- Check the **Actions** tab to confirm workflows are active

### 4. Test the Setup

```bash
# Make a small change and push to trigger CI
echo "# Test CI" >> README.md
git add README.md
git commit -m "test: trigger CI pipeline"
git push origin main
```

## 📋 Workflow Details

### Primary Test Workflow (`test-proxy.yml`)

**Triggers**:

- Pull requests to `main` branch
- Pushes to `main` branch
- Manual dispatch via GitHub UI

**What it tests**:

- ✅ Proxy server startup and connectivity
- ✅ Host whitelist enforcement
- ✅ Invalid hostname rejection
- ✅ OpenAI API request forwarding
- ✅ Authentication handling
- ✅ Custom header forwarding
- ✅ Chat completions endpoint
- ✅ Error handling and propagation

**Duration**: ~3-5 minutes

### Security Workflow (`security-scan.yml`)

**Triggers**:

- Pull requests and pushes to `main`
- Weekly scheduled scans (Mondays 2 AM UTC)
- Manual dispatch

**Security checks**:

- 🔐 Hardcoded secret detection
- 🛡️ Input validation verification
- 🚦 Rate limiting implementation
- 📦 Dependency security analysis
- 🌍 Environment configuration validation

**Duration**: ~2-3 minutes

**Performance checks**:
- 📦 Source code size analysis
- 💾 Memory usage patterns
- ⚡ Startup performance metrics

## 🔧 Workflow Configuration

### Environment Variables

The workflows use these environment variables:

```yaml
env:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  ALLOWED_HOSTS: "api.openai.com"
  PROXY_PORT: "8000"
  PROXY_TIMEOUT_MS: "30000"
  RATE_LIMIT_MAX_REQUESTS: "1000"
  RATE_LIMIT_WINDOW_MS: "60000"
```

### Permissions Required

```yaml
permissions:
  contents: read # Read repository content
  security-events: write # Write security scan results
```

## 📊 Understanding Test Results

### ✅ Successful Test Run

```
✅ All Tests Passed!

Your Deno proxy server is working correctly with OpenAI's API:
- 🛡️ Security controls validated
- 🔄 Request forwarding working
- 🔐 Authentication handling correct
- ❌ Error handling validated
- 📡 OpenAI API integration confirmed

🚀 Ready for production deployment!
```

### ❌ Common Failure Scenarios

#### 1. Missing API Key

```
❌ ERROR: OPENAI_API_KEY secret not set in repository
```

**Solution**: Add the secret in repository settings

#### 2. API Key Invalid/Expired

```
❌ Authentication failed: Invalid API key
```

**Solution**: Update the secret with a valid OpenAI API key

#### 3. Network/Connectivity Issues

```
❌ Connection failed: tcp connect error
```

**Solution**: Usually temporary - retry the workflow

#### 4. TypeScript Compilation Error

```
❌ Check failed: Type checking failed
```

**Solution**: Fix TypeScript errors in the code

#### 5. Security Scan Failures

```
❌ Potential hardcoded API key found!
```

**Solution**: Remove hardcoded secrets, use environment variables

## 🔒 Security Best Practices

### Repository Secrets Management

- **Never commit API keys** to the repository
- Use **environment variables** for all sensitive configuration
- **Rotate secrets** regularly
- **Limit secret access** to necessary workflows only

### Code Security

- Enable **TypeScript strict mode**
- Use **input validation** for all user inputs
- Implement **rate limiting** to prevent abuse
- **Sanitize headers** to prevent injection attacks

### Dependency Security

- Use **official Deno standard library** when possible
- **Pin dependency versions** to avoid supply chain attacks
- **Regularly update** dependencies
- **Audit dependencies** for known vulnerabilities

## 🎯 Customizing Workflows

### Adding New Tests

To add custom tests to the workflow:

1. Create test in `test_openai_responses_simple.ts`:

```typescript
await t.step("My custom test", async () => {
  // Your test logic here
});
```

2. Tests will automatically run in CI

### Modifying Security Checks

Edit `.github/workflows/security-scan.yml`:

```yaml
- name: Custom security check
  run: |
    echo "Running my custom security check..."
    # Your security validation logic
```

### Adding Environment-Specific Tests
```yaml
strategy:
  matrix:
    environment: [staging, production]
    deno-version: ['2.5.x', '2.6.x']
```

## 🚨 Troubleshooting

### Workflow Not Running

1. Check if Actions are enabled in repository settings
2. Verify the workflow files are in `.github/workflows/`
3. Ensure proper YAML syntax
4. Check repository permissions

### Tests Timing Out

1. Increase `timeout-minutes` in workflow
2. Check for infinite loops or hanging processes
3. Verify network connectivity in the runner

### Permission Errors

1. Verify repository secrets are set correctly
2. Check workflow permissions configuration
3. Ensure the OpenAI API key has necessary permissions

### Flaky Tests

1. Add retry logic to unstable network calls
2. Increase timeouts for slow operations
3. Add proper cleanup in test teardown

## 📈 Monitoring and Metrics

### GitHub Actions Usage

- Monitor workflow run minutes (2000/month free)
- Check storage usage for artifacts
- Review workflow performance trends

### Test Metrics to Track

- Test execution time trends
- Failure rate by test type
- API response time variations
- Source code size growth over time
- Security scan results over time

### Setting Up Notifications

1. **Email Notifications**:
   - GitHub Settings → Notifications → Actions
   - Enable "Email" for workflow failures

2. **Slack Integration**:

```yaml
- name: Notify Slack on failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: failure
```

## 🔄 Deployment Integration

### Automatic Deployment on Success

```yaml
deploy:
  needs: test-proxy
  if: success() && github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  steps:
    - name: Deploy to production
      run: |
        # Your deployment commands
```

### Environment Promotion

```yaml
strategy:
  matrix:
    environment: [staging, production]
```

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Deno CI/CD Best Practices](https://deno.land/manual/advanced/ci_cd)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Proxy Security Guidelines](https://owasp.org/www-project-web-security-testing-guide/)

## 🆘 Support

If you encounter issues with the CI/CD setup:

1. **Check workflow logs** in the Actions tab
2. **Review this documentation** for common solutions
3. **Open an issue** with detailed error information
4. **Check GitHub Status** for platform-wide issues

---

## Quick Reference Commands

```bash
# Local testing
export OPENAI_API_KEY=sk-your-key
deno task test-simple

# Manual workflow trigger
gh workflow run test-proxy.yml

# View workflow status  
gh run list

# Check workflow logs
gh run view <run-id> --log
```

**🎉 Happy CI/CD-ing!**
