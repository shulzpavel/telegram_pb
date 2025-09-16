#!/usr/bin/env python3
"""
Backup script for Planning Poker Bot data
"""

import json
import os
import shutil
from datetime import datetime
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def backup_data(data_dir: str = "data", backup_dir: str = "backups") -> str:
    """Create backup of all data files"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(backup_dir, f"backup_{timestamp}")
    
    os.makedirs(backup_path, exist_ok=True)
    
    # Copy all data files
    for file_name in ["sessions.json", "group_configs.json", "tokens.json", "bot.log"]:
        src_path = os.path.join(data_dir, file_name)
        if os.path.exists(src_path):
            dst_path = os.path.join(backup_path, file_name)
            shutil.copy2(src_path, dst_path)
            logger.info(f"Backed up {file_name}")
    
    logger.info(f"Backup created: {backup_path}")
    return backup_path

def restore_data(backup_path: str, data_dir: str = "data") -> None:
    """Restore data from backup"""
    os.makedirs(data_dir, exist_ok=True)
    
    for file_name in ["sessions.json", "group_configs.json", "tokens.json"]:
        src_path = os.path.join(backup_path, file_name)
        if os.path.exists(src_path):
            dst_path = os.path.join(data_dir, file_name)
            shutil.copy2(src_path, dst_path)
            logger.info(f"Restored {file_name}")
    
    logger.info(f"Data restored from {backup_path}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "restore":
        if len(sys.argv) < 3:
            print("Usage: python backup_data.py restore <backup_path>")
            sys.exit(1)
        restore_data(sys.argv[2])
    else:
        backup_data()
