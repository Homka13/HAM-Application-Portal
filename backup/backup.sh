#!/bin/sh
BACKUP_NAME="dev-$(date +%Y-%m-%d_%H%M%S).db"

cp /db/dev.db /backups/$BACKUP_NAME

find /backups -name "dev-*.db" -mtime +7 -delete

if [ -n "$RCLONE_REMOTE" ]; then
  rclone copy /backups/$BACKUP_NAME $RCLONE_REMOTE 2>/tmp/rclone.err
  RCLONE_EXIT=$?
else
  RCLONE_EXIT=0
fi

if [ -n "$SLACK_WEBHOOK_URL" ]; then
  if [ $RCLONE_EXIT -eq 0 ]; then
    curl -s -X POST -H 'Content-type: application/json' \
      --data "{\"text\":\"✅ Бекап успішний: $BACKUP_NAME\"}" \
      $SLACK_WEBHOOK_URL
  else
    curl -s -X POST -H 'Content-type: application/json' \
      --data "{\"text\":\"❌ ПОМИЛКА бекапу: $BACKUP_NAME\"}" \
      $SLACK_WEBHOOK_URL
  fi
fi

echo "Backup created: $BACKUP_NAME"
