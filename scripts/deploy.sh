#!/bin/bash

# Planning Poker Bot - Deployment Script
# This script handles deployment to production server

set -e  # Exit on any error

# Configuration
PROJECT_NAME="planning-poker-bot"
SERVICE_NAME="planning-poker-bot"
BOT_USER="pokerbot"
DEPLOY_DIR="/opt/$PROJECT_NAME"
BACKUP_DIR="/opt/backups/$PROJECT_NAME"
LOG_FILE="/var/log/$PROJECT_NAME/deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root or with sudo
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        warning "Running as root. Consider using a dedicated user for better security."
    fi
}

# Create necessary directories
setup_directories() {
    log "Setting up directories..."
    
    sudo mkdir -p "$DEPLOY_DIR"
    sudo mkdir -p "$BACKUP_DIR"
    sudo mkdir -p "/var/log/$PROJECT_NAME"
    sudo mkdir -p "/etc/$PROJECT_NAME"
    
    # Set proper ownership
    sudo chown -R "$BOT_USER:$BOT_USER" "$DEPLOY_DIR"
    sudo chown -R "$BOT_USER:$BOT_USER" "/var/log/$PROJECT_NAME"
    
    success "Directories created"
}

# Backup current deployment
backup_current() {
    if [ -d "$DEPLOY_DIR" ] && [ "$(ls -A $DEPLOY_DIR)" ]; then
        log "Creating backup of current deployment..."
        
        BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
        sudo cp -r "$DEPLOY_DIR" "$BACKUP_DIR/$BACKUP_NAME"
        
        # Keep only last 5 backups
        sudo find "$BACKUP_DIR" -maxdepth 1 -type d -name "backup_*" | sort | head -n -5 | sudo xargs rm -rf
        
        success "Backup created: $BACKUP_NAME"
    else
        log "No existing deployment to backup"
    fi
}

# Stop the bot service
stop_bot() {
    log "Stopping bot service..."
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        sudo systemctl stop "$SERVICE_NAME"
        sleep 2
        
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            warning "Service still running, forcing stop..."
            sudo systemctl kill "$SERVICE_NAME"
            sleep 2
        fi
        
        success "Bot service stopped"
    else
        log "Bot service was not running"
    fi
}

# Update code from git
update_code() {
    log "Updating code from repository..."
    
    cd "$DEPLOY_DIR"
    
    # Pull latest changes
    sudo -u "$BOT_USER" git fetch origin
    sudo -u "$BOT_USER" git reset --hard origin/main
    
    success "Code updated"
}

# Install/update dependencies
install_dependencies() {
    log "Installing dependencies..."
    
    cd "$DEPLOY_DIR"
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        sudo -u "$BOT_USER" python3 -m venv venv
    fi
    
    # Activate virtual environment and install dependencies
    sudo -u "$BOT_USER" bash -c "source venv/bin/activate && pip install --upgrade pip"
    sudo -u "$BOT_USER" bash -c "source venv/bin/activate && pip install -r requirements.txt"
    
    success "Dependencies installed"
}

# Setup environment configuration
setup_environment() {
    log "Setting up environment configuration..."
    
    # Copy example environment file if .env doesn't exist
    if [ ! -f "$DEPLOY_DIR/.env" ]; then
        if [ -f "$DEPLOY_DIR/env.example" ]; then
            sudo -u "$BOT_USER" cp "$DEPLOY_DIR/env.example" "$DEPLOY_DIR/.env"
            warning "Please configure .env file with your settings"
        else
            error "No environment configuration found"
        fi
    fi
    
    # Set proper permissions for .env
    sudo chmod 600 "$DEPLOY_DIR/.env"
    sudo chown "$BOT_USER:$BOT_USER" "$DEPLOY_DIR/.env"
    
    success "Environment configured"
}

# Setup systemd service
setup_service() {
    log "Setting up systemd service..."
    
    # Copy service file
    if [ -f "$DEPLOY_DIR/planning-poker-bot.service" ]; then
        sudo cp "$DEPLOY_DIR/planning-poker-bot.service" "/etc/systemd/system/"
        
        # Update service file with correct paths
        sudo sed -i "s|WorkingDirectory=.*|WorkingDirectory=$DEPLOY_DIR|g" "/etc/systemd/system/$SERVICE_NAME.service"
        sudo sed -i "s|ExecStart=.*|ExecStart=$DEPLOY_DIR/venv/bin/python $DEPLOY_DIR/bot.py|g" "/etc/systemd/system/$SERVICE_NAME.service"
        sudo sed -i "s|User=.*|User=$BOT_USER|g" "/etc/systemd/system/$SERVICE_NAME.service"
        
        sudo systemctl daemon-reload
        sudo systemctl enable "$SERVICE_NAME"
        
        success "Systemd service configured"
    else
        warning "Service file not found, manual setup required"
    fi
}

# Start the bot service
start_bot() {
    log "Starting bot service..."
    
    sudo systemctl start "$SERVICE_NAME"
    sleep 3
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Bot service started successfully"
    else
        error "Failed to start bot service"
    fi
}

# Check bot health
check_health() {
    log "Checking bot health..."
    
    sleep 5
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Bot is running"
        
        # Check logs for errors
        if journalctl -u "$SERVICE_NAME" --since "1 minute ago" | grep -i error; then
            warning "Errors found in logs, check: journalctl -u $SERVICE_NAME"
        fi
    else
        error "Bot is not running"
    fi
}

# Main deployment function
deploy() {
    log "Starting deployment of $PROJECT_NAME..."
    
    check_permissions
    setup_directories
    backup_current
    stop_bot
    update_code
    install_dependencies
    setup_environment
    setup_service
    start_bot
    check_health
    
    success "Deployment completed successfully!"
    log "Bot is running and ready to use"
}

# Rollback function
rollback() {
    log "Rolling back to previous version..."
    
    stop_bot
    
    # Find latest backup
    LATEST_BACKUP=$(sudo find "$BACKUP_DIR" -maxdepth 1 -type d -name "backup_*" | sort | tail -1)
    
    if [ -n "$LATEST_BACKUP" ]; then
        sudo rm -rf "$DEPLOY_DIR"
        sudo cp -r "$LATEST_BACKUP" "$DEPLOY_DIR"
        sudo chown -R "$BOT_USER:$BOT_USER" "$DEPLOY_DIR"
        
        start_bot
        success "Rollback completed"
    else
        error "No backup found for rollback"
    fi
}

# Show status
status() {
    log "Checking bot status..."
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "Bot is running"
        echo "Service status:"
        systemctl status "$SERVICE_NAME" --no-pager
    else
        warning "Bot is not running"
    fi
    
    echo "Recent logs:"
    journalctl -u "$SERVICE_NAME" --since "5 minutes ago" --no-pager
}

# Show help
show_help() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  deploy    - Deploy the bot (default)"
    echo "  rollback  - Rollback to previous version"
    echo "  status    - Show bot status"
    echo "  stop      - Stop the bot"
    echo "  start     - Start the bot"
    echo "  restart   - Restart the bot"
    echo "  logs      - Show recent logs"
    echo "  help      - Show this help"
}

# Handle command line arguments
case "${1:-deploy}" in
    deploy)
        deploy
        ;;
    rollback)
        rollback
        ;;
    status)
        status
        ;;
    stop)
        stop_bot
        ;;
    start)
        start_bot
        ;;
    restart)
        stop_bot
        start_bot
        ;;
    logs)
        journalctl -u "$SERVICE_NAME" -f
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error "Unknown command: $1"
        show_help
        ;;
esac
