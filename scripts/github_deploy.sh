#!/bin/bash

# Planning Poker Bot - GitHub Deployment Script
# Быстрый деплой через GitHub

set -e

# Configuration
PROJECT_NAME="planning-poker-bot"
REPO_URL="https://github.com/your-username/telegram_pb.git"  # Update this URL
BRANCH="main"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if git is available
check_git() {
    if ! command -v git &> /dev/null; then
        error "Git is not installed"
    fi
}

# Check if we're in a git repository
check_repo() {
    if [ ! -d ".git" ]; then
        error "Not in a git repository"
    fi
}

# Check for uncommitted changes
check_changes() {
    if ! git diff --quiet || ! git diff --cached --quiet; then
        warning "Uncommitted changes detected"
        echo "Changes:"
        git status --short
        echo ""
        read -p "Do you want to commit these changes? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git add .
            read -p "Enter commit message: " commit_message
            git commit -m "$commit_message"
        else
            error "Please commit or stash changes before deploying"
        fi
    fi
}

# Push to GitHub
push_to_github() {
    log "Pushing to GitHub..."
    
    # Add remote if not exists
    if ! git remote get-url origin &> /dev/null; then
        git remote add origin "$REPO_URL"
    fi
    
    # Push to main branch
    git push -u origin "$BRANCH"
    
    success "Code pushed to GitHub"
}

# Show deployment instructions
show_instructions() {
    echo ""
    echo "🚀 Deployment Instructions:"
    echo ""
    echo "1. On your server, run:"
    echo "   wget https://raw.githubusercontent.com/your-username/telegram_pb/main/scripts/quick_update.sh"
    echo "   chmod +x quick_update.sh"
    echo "   ./quick_update.sh"
    echo ""
    echo "2. Or use the full deployment script:"
    echo "   wget https://raw.githubusercontent.com/your-username/telegram_pb/main/scripts/deploy.sh"
    echo "   chmod +x deploy.sh"
    echo "   ./deploy.sh deploy"
    echo ""
    echo "3. Check bot status:"
    echo "   systemctl status planning-poker-bot"
    echo "   journalctl -u planning-poker-bot -f"
    echo ""
}

# Main deployment function
deploy() {
    log "Starting GitHub deployment..."
    
    check_git
    check_repo
    check_changes
    push_to_github
    show_instructions
    
    success "Deployment preparation completed!"
}

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --repo-url URL  - Set repository URL"
    echo "  --branch BRANCH - Set branch name (default: main)"
    echo "  --help          - Show this help"
}

# Handle command line arguments
for arg in "$@"; do
    case $arg in
        --repo-url=*)
            REPO_URL="${arg#*=}"
            ;;
        --branch=*)
            BRANCH="${arg#*=}"
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            ;;
    esac
done

deploy
