#!/bin/sh
BACKUP_NAME="dev-$(date +%Y-%m-%d_%H%M%S).db"

cp /db/dev.db /backups/$BACKUP_NAME

find /backups -name "dev-*.db" -mtime +7 -delete

echo "Backup created: $BACKUP_NAME"
