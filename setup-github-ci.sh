#!/bin/bash

# GitHub CI/CD Setup Script for Deno OpenAI Proxy
# This script helps configure your GitHub repository for automated testing

set -e

echo "🚀 GitHub CI/CD Setup for Deno OpenAI Proxy"
echo "=============================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Check if we're in the right directory
if [[ ! -f "main.ts" ]] || [[ ! -f "deno.json" ]]; then
    print_error "This script must be run from the deno-proxy project root directory"
    exit 1
fi

print_success "Found deno-proxy project files"

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    print_warning "GitHub CLI (gh) is not installed"
    echo ""
    echo "To install GitHub CLI:"
    echo "  macOS: brew install gh"
    echo "  Ubuntu: sudo apt install gh"
    echo "  Windows: winget install GitHub.cli"
    echo ""
    echo "Alternatively, you can set up secrets manually at:"
    echo "https://github.com/YOUR_USERNAME/deno-proxy/settings/secrets/actions"
    echo ""
    read -p "Continue without GitHub CLI? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    GITHUB_CLI=false
else
    print_success "GitHub CLI found"
    GITHUB_CLI=true
fi

# Check if user is logged in to GitHub CLI
if [[ $GITHUB_CLI == true ]]; then
    if ! gh auth status &> /dev/null; then
        print_warning "Not logged in to GitHub CLI"
        echo ""
        print_info "Logging in to GitHub..."
        gh auth login

        if ! gh auth status &> /dev/null; then
            print_error "GitHub login failed"
            GITHUB_CLI=false
        else
            print_success "Successfully logged in to GitHub"
        fi
    else
        print_success "Already logged in to GitHub"
    fi
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository. Please run 'git init' first."
    exit 1
fi

# Check if remote origin exists
if ! git remote get-url origin &> /dev/null; then
    print_error "No remote 'origin' found. Please add your GitHub repository as origin:"
    echo "  git remote add origin https://github.com/YOUR_USERNAME/deno-proxy.git"
    exit 1
fi

print_success "Git repository configured"

# Get repository information
REPO_URL=$(git remote get-url origin)
if [[ $REPO_URL == *"github.com"* ]]; then
    # Extract owner/repo from URL
    REPO_INFO=$(echo $REPO_URL | sed -E 's/.*github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/\1/')
    print_success "Repository: $REPO_INFO"
else
    print_error "Origin is not a GitHub repository"
    exit 1
fi

echo ""
echo "📋 Pre-Setup Checklist:"
echo "========================"

# Check if workflow files exist
if [[ -f ".github/workflows/test-proxy.yml" ]]; then
    print_success "Test workflow file exists"
else
    print_warning "Test workflow file missing - will be created"
fi

if [[ -f ".github/workflows/security-scan.yml" ]]; then
    print_success "Security scan workflow file exists"
else
    print_warning "Security scan workflow file missing - will be created"
fi

# Check if test files exist
if [[ -f "test_openai_responses_simple.ts" ]]; then
    print_success "Test file exists"
else
    print_error "Test file missing - please ensure test_openai_responses_simple.ts exists"
    exit 1
fi

echo ""
echo "🔑 OpenAI API Key Setup:"
echo "========================="

# Get OpenAI API Key
echo ""
print_info "You need an OpenAI API key to run the automated tests."
print_info "Get one at: https://platform.openai.com/api-keys"
echo ""

if [[ -n "$OPENAI_API_KEY" ]]; then
    print_success "OPENAI_API_KEY environment variable found"
    API_KEY="$OPENAI_API_KEY"
else
    read -p "Enter your OpenAI API key (sk-...): " -s API_KEY
    echo ""
fi

# Validate API key format
if [[ ! $API_KEY =~ ^sk-[a-zA-Z0-9]{48}$ ]]; then
    print_warning "API key format doesn't match expected pattern (sk-...48 chars)"
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Setup cancelled"
        exit 1
    fi
fi

# Set up GitHub secret
if [[ $GITHUB_CLI == true ]]; then
    print_info "Setting up GitHub secret..."

    if echo "$API_KEY" | gh secret set OPENAI_API_KEY; then
        print_success "OPENAI_API_KEY secret created successfully"
    else
        print_error "Failed to create GitHub secret"
        echo ""
        print_info "Please set up the secret manually:"
        echo "1. Go to https://github.com/$REPO_INFO/settings/secrets/actions"
        echo "2. Click 'New repository secret'"
        echo "3. Name: OPENAI_API_KEY"
        echo "4. Value: $API_KEY"
    fi
else
    print_warning "GitHub CLI not available - manual secret setup required"
    echo ""
    print_info "Please set up the secret manually:"
    echo "1. Go to https://github.com/$REPO_INFO/settings/secrets/actions"
    echo "2. Click 'New repository secret'"
    echo "3. Name: OPENAI_API_KEY"
    echo "4. Value: [your API key]"
fi

echo ""
echo "🧪 Testing Local Setup:"
echo "======================="

print_info "Running local tests to verify setup..."

export OPENAI_API_KEY="$API_KEY"

# Test TypeScript compilation
print_info "Checking TypeScript compilation..."
if deno check --config deno.json main.ts; then
    print_success "TypeScript compilation successful"
else
    print_error "TypeScript compilation failed"
    exit 1
fi

# Run a quick test
print_info "Running basic functionality test..."
if timeout 60 deno task test-simple > /dev/null 2>&1; then
    print_success "Local tests passed"
else
    print_warning "Local tests had issues - check with: deno task test-simple"
fi

echo ""
echo "🔄 Pushing Changes:"
echo "=================="

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_info "Found uncommitted changes"
    git status --short
    echo ""
    read -p "Commit and push changes? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "ci: add GitHub Actions workflows for automated testing"

        print_info "Pushing to GitHub..."
        if git push origin HEAD; then
            print_success "Changes pushed successfully"
        else
            print_error "Push failed - please check your GitHub permissions"
        fi
    fi
fi

echo ""
echo "🎉 Setup Complete!"
echo "=================="

print_success "GitHub CI/CD setup is complete!"
echo ""
echo "What happens next:"
echo "1. 🔄 GitHub Actions will run automatically on PRs and pushes to main"
echo "2. 🧪 Tests will validate proxy functionality against OpenAI API"
echo "3. 🔐 Security scans will check for vulnerabilities"
echo "4. 📊 Results will appear in the Actions tab"
echo ""
echo "Useful links:"
echo "📊 Actions: https://github.com/$REPO_INFO/actions"
echo "🔐 Secrets: https://github.com/$REPO_INFO/settings/secrets/actions"
echo "📋 Workflows: https://github.com/$REPO_INFO/tree/main/.github/workflows"
echo ""

if [[ $GITHUB_CLI == true ]]; then
    echo "Quick commands:"
    echo "🔍 View workflow runs: gh run list"
    echo "📋 Trigger workflow: gh workflow run test-proxy.yml"
    echo "📊 View latest run: gh run view"
    echo ""
fi

print_success "Ready for automated testing! 🚀"

echo ""
echo "💡 Next Steps:"
echo "=============="
echo "1. Make a small change to test the CI pipeline"
echo "2. Create a pull request to see tests in action"
echo "3. Monitor the Actions tab for test results"
echo "4. Review security scan findings weekly"
echo ""
print_success "Happy coding!"
