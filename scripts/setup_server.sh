#!/bin/bash

# Planning Poker Bot - Server Setup Script
# Initial server configuration for production deployment

set -e

# Configuration
PROJECT_NAME="planning-poker-bot"
SERVICE_NAME="planning-poker-bot"
BOT_USER="pokerbot"
DEPLOY_DIR="/opt/$PROJECT_NAME"
REPO_URL="https://github.com/your-username/telegram_pb.git"  # Update this URL

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
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

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
    fi
}

# Update system packages
update_system() {
    log "Updating system packages..."
    
    apt update
    apt upgrade -y
    
    success "System updated"
}

# Install required packages
install_packages() {
    log "Installing required packages..."
    
    apt install -y \
        python3 \
        python3-pip \
        python3-venv \
        git \
        curl \
        wget \
        htop \
        nano \
        systemd \
        ufw \
        fail2ban \
        logrotate
    
    success "Packages installed"
}

# Create bot user
create_bot_user() {
    log "Creating bot user..."
    
    if id "$BOT_USER" &>/dev/null; then
        warning "User $BOT_USER already exists"
    else
        useradd -m -s /bin/bash "$BOT_USER"
        usermod -aG sudo "$BOT_USER"
        success "Bot user created"
    fi
}

# Setup directories
setup_directories() {
    log "Setting up directories..."
    
    mkdir -p "$DEPLOY_DIR"
    mkdir -p "/var/log/$PROJECT_NAME"
    mkdir -p "/etc/$PROJECT_NAME"
    mkdir -p "/opt/backups/$PROJECT_NAME"
    
    chown -R "$BOT_USER:$BOT_USER" "$DEPLOY_DIR"
    chown -R "$BOT_USER:$BOT_USER" "/var/log/$PROJECT_NAME"
    
    success "Directories created"
}

# Clone repository
clone_repository() {
    log "Cloning repository..."
    
    cd /opt
    sudo -u "$BOT_USER" git clone "$REPO_URL" "$PROJECT_NAME"
    
    success "Repository cloned"
}

# Setup Python environment
setup_python() {
    log "Setting up Python environment..."
    
    cd "$DEPLOY_DIR"
    sudo -u "$BOT_USER" python3 -m venv venv
    sudo -u "$BOT_USER" bash -c "source venv/bin/activate && pip install --upgrade pip"
    sudo -u "$BOT_USER" bash -c "source venv/bin/activate && pip install -r requirements.txt"
    
    success "Python environment setup"
}

# Setup systemd service
setup_systemd() {
    log "Setting up systemd service..."
    
    # Copy service file
    cp "$DEPLOY_DIR/planning-poker-bot.service" "/etc/systemd/system/"
    
    # Update service file paths
    sed -i "s|WorkingDirectory=.*|WorkingDirectory=$DEPLOY_DIR|g" "/etc/systemd/system/$SERVICE_NAME.service"
    sed -i "s|ExecStart=.*|ExecStart=$DEPLOY_DIR/venv/bin/python $DEPLOY_DIR/bot.py|g" "/etc/systemd/system/$SERVICE_NAME.service"
    sed -i "s|User=.*|User=$BOT_USER|g" "/etc/systemd/system/$SERVICE_NAME.service"
    
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    success "Systemd service configured"
}

# Setup environment file
setup_environment() {
    log "Setting up environment configuration..."
    
    if [ -f "$DEPLOY_DIR/env.example" ]; then
        cp "$DEPLOY_DIR/env.example" "$DEPLOY_DIR/.env"
        chown "$BOT_USER:$BOT_USER" "$DEPLOY_DIR/.env"
        chmod 600 "$DEPLOY_DIR/.env"
        
        warning "Please configure $DEPLOY_DIR/.env with your settings"
    else
        error "No environment example file found"
    fi
}

# Setup firewall
setup_firewall() {
    log "Setting up firewall..."
    
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    success "Firewall configured"
}

# Setup fail2ban
setup_fail2ban() {
    log "Setting up fail2ban..."
    
    cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
EOF
    
    systemctl enable fail2ban
    systemctl start fail2ban
    
    success "Fail2ban configured"
}

# Setup log rotation
setup_logrotate() {
    log "Setting up log rotation..."
    
    cat > "/etc/logrotate.d/$PROJECT_NAME" << EOF
/var/log/$PROJECT_NAME/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $BOT_USER $BOT_USER
    postrotate
        systemctl reload $SERVICE_NAME
    endscript
}
EOF
    
    success "Log rotation configured"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up basic monitoring..."
    
    # Create health check script
    cat > "/usr/local/bin/check-$PROJECT_NAME.sh" << EOF
#!/bin/bash
if ! systemctl is-active --quiet $SERVICE_NAME; then
    echo "Bot is not running, attempting restart..."
    systemctl start $SERVICE_NAME
fi
EOF
    
    chmod +x "/usr/local/bin/check-$PROJECT_NAME.sh"
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/check-$PROJECT_NAME.sh") | crontab -
    
    success "Monitoring configured"
}

# Main setup function
setup_server() {
    log "Starting server setup for $PROJECT_NAME..."
    
    check_root
    update_system
    install_packages
    create_bot_user
    setup_directories
    clone_repository
    setup_python
    setup_systemd
    setup_environment
    setup_firewall
    setup_fail2ban
    setup_logrotate
    setup_monitoring
    
    success "Server setup completed!"
    
    echo ""
    echo "Next steps:"
    echo "1. Configure $DEPLOY_DIR/.env with your bot settings"
    echo "2. Run: systemctl start $SERVICE_NAME"
    echo "3. Check status: systemctl status $SERVICE_NAME"
    echo "4. View logs: journalctl -u $SERVICE_NAME -f"
    echo ""
    echo "For updates, use: $DEPLOY_DIR/scripts/quick_update.sh"
}

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --repo-url URL  - Set repository URL (default: $REPO_URL)"
    echo "  --help          - Show this help"
}

# Handle command line arguments
REPO_URL_OVERRIDE=""
for arg in "$@"; do
    case $arg in
        --repo-url=*)
            REPO_URL_OVERRIDE="${arg#*=}"
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            ;;
    esac
done

if [ -n "$REPO_URL_OVERRIDE" ]; then
    REPO_URL="$REPO_URL_OVERRIDE"
fi

setup_server
