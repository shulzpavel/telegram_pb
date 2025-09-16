#!/usr/bin/env python3
"""
Configuration checker for Planning Poker Bot
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config_parser import ConfigParser
from config import BOT_TOKEN, JIRA_EMAIL, JIRA_TOKEN, JIRA_BASE_URL

def check_config():
    """Check bot configuration"""
    print("🔧 Planning Poker Bot Configuration Check")
    print("=" * 50)
    
    # Check bot token
    if BOT_TOKEN and BOT_TOKEN != "your_bot_token_here":
        print("✅ BOT_TOKEN: Configured")
    else:
        print("❌ BOT_TOKEN: Not configured")
    
    # Check Jira configuration
    if JIRA_EMAIL and JIRA_EMAIL != "your_email@example.com":
        print("✅ JIRA_EMAIL: Configured")
    else:
        print("⚠️  JIRA_EMAIL: Not configured (optional)")
    
    if JIRA_TOKEN and JIRA_TOKEN != "your_jira_api_token_here":
        print("✅ JIRA_TOKEN: Configured")
    else:
        print("⚠️  JIRA_TOKEN: Not configured (optional)")
    
    if JIRA_BASE_URL:
        print(f"✅ JIRA_BASE_URL: {JIRA_BASE_URL}")
    else:
        print("⚠️  JIRA_BASE_URL: Not configured (optional)")
    
    # Check groups configuration
    parser = ConfigParser()
    
    if parser.validate_config():
        print("✅ Groups configuration: Valid")
        parser.print_config()
    else:
        print("❌ Groups configuration: Invalid")
        return False
    
    print("\n🎉 Configuration check completed successfully!")
    return True

if __name__ == "__main__":
    if not check_config():
        sys.exit(1)
