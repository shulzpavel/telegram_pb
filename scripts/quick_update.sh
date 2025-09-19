#!/bin/bash

# Planning Poker Bot - Quick Update Script
# For fast updates without full deployment

set -e

# Configuration
PROJECT_NAME="planning-poker-bot"
SERVICE_NAME="planning-poker-bot"
DEPLOY_DIR="/opt/$PROJECT_NAME"
BOT_USER="pokerbot"

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

# Quick update function
quick_update() {
    log "Starting quick update..."
    
    # Stop bot
    log "Stopping bot..."
    sudo systemctl stop "$SERVICE_NAME" || true
    
    # Update code
    log "Updating code..."
    cd "$DEPLOY_DIR"
    sudo -u "$BOT_USER" git pull origin main
    
    # Install any new dependencies
    log "Updating dependencies..."
    sudo -u "$BOT_USER" bash -c "source venv/bin/activate && pip install -r requirements.txt"
    
    # Start bot
    log "Starting bot..."
    sudo systemctl start "$SERVICE_NAME"
    
    # Check status
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Quick update completed!"
    else
        error "Bot failed to start after update"
    fi
}

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --force    - Force update even if there are uncommitted changes"
    echo "  --help     - Show this help"
}

# Handle arguments
FORCE=false
for arg in "$@"; do
    case $arg in
        --force)
            FORCE=true
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            ;;
    esac
done

# Check for uncommitted changes
if [ "$FORCE" = false ]; then
    cd "$DEPLOY_DIR"
    if ! sudo -u "$BOT_USER" git diff --quiet; then
        warning "Uncommitted changes detected. Use --force to proceed."
        exit 1
    fi
fi

quick_update
