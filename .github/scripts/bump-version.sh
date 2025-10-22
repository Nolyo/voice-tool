#!/bin/bash
# Automatic version bump script for Voice Tool
#
# Usage:
#   ./bump-version.sh <new_version>
#
# Example:
#   ./bump-version.sh 2.1.0
#
# This script updates the version in:
#   - package.json
#   - src-tauri/Cargo.toml
#   - src-tauri/tauri.conf.json

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Display functions
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check arguments
if [ $# -eq 0 ]; then
    print_error "Usage: $0 <new_version>"
    echo ""
    echo "Example:"
    echo "  $0 2.1.0"
    exit 1
fi

NEW_VERSION=$1

# Validate version format (semver: X.Y.Z)
if ! [[ $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Invalid version format: $NEW_VERSION"
    echo "Format must be: X.Y.Z (e.g., 2.1.0)"
    exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(grep -Po '"version":\s*"\K[^"]*' package.json | head -1)

print_info "Current version: $CURRENT_VERSION"
print_info "New version: $NEW_VERSION"
echo ""

# Ask for confirmation
read -p "Continue with version update? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Cancelled by user"
    exit 0
fi

echo ""
print_info "Updating files..."

# 1. Update package.json
print_info "Updating package.json..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS (BSD sed)
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
else
    # Linux (GNU sed)
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
fi
print_success "package.json updated"

# 2. Update src-tauri/Cargo.toml
print_info "Updating src-tauri/Cargo.toml..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/^version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
else
    sed -i "s/^version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
fi
print_success "src-tauri/Cargo.toml updated"

# 3. Update src-tauri/tauri.conf.json
print_info "Updating src-tauri/tauri.conf.json..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
else
    sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
fi
print_success "src-tauri/tauri.conf.json updated"

# 4. Update Cargo.lock
print_info "Updating Cargo.lock..."
cd src-tauri
cargo check --quiet 2>/dev/null || true
cd ..
print_success "Cargo.lock updated"

echo ""
print_success "All files updated successfully!"
echo ""

# Display summary of changes
print_info "Summary of changes:"
echo ""
git diff --stat package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock 2>/dev/null || true

echo ""
print_info "Next steps:"
echo ""
echo "  1. Review changes with:"
echo "     ${GREEN}git diff${NC}"
echo ""
echo "  2. Update CHANGELOG.md with changes for this version"
echo ""
echo "  3. Commit the changes:"
echo "     ${GREEN}git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock CHANGELOG.md${NC}"
echo "     ${GREEN}git commit -m \"chore: bump version to $NEW_VERSION\"${NC}"
echo ""
echo "  4. Create and push tag:"
echo "     ${GREEN}git tag v$NEW_VERSION${NC}"
echo "     ${GREEN}git push origin main --tags${NC}"
echo ""
echo "  5. GitHub Actions will automatically create the release!"
echo ""
