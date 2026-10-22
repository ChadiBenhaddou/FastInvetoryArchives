#!/bin/sh
# Starts the container in one of three roles: app (nginx + php-fpm),
# queue (job worker) or scheduler (periodic tasks).
set -e

cd /var/www/html
ROLE="${CONTAINER_ROLE:-app}"
AS_WWW="setpriv --reuid=www-data --regid=www-data --init-groups"

# The storage volume persists across image updates, so recreate its layout.
mkdir -p storage/app storage/framework/cache/data storage/framework/sessions \
         storage/framework/views storage/logs
mkdir -p "$ARCHIVE_ROOT/import" "$ARCHIVE_ROOT/processing" "$ARCHIVE_ROOT/imported" \
         "$ARCHIVE_ROOT/failed" "$ARCHIVE_ROOT/storage" "$ARCHIVE_ROOT/backups"
chown -R www-data:www-data storage bootstrap/cache
chown www-data:www-data "$ARCHIVE_ROOT" "$ARCHIVE_ROOT"/* 2>/dev/null || true

$AS_WWW php artisan optimize --quiet

case "$ROLE" in
  app)
    echo "Waiting for the database..."
    i=0
    until php -r 'new PDO("mysql:host=".getenv("DB_HOST").";port=".getenv("DB_PORT"), getenv("DB_USERNAME"), getenv("DB_PASSWORD"));' >/dev/null 2>&1; do
      i=$((i + 1))
      [ "$i" -ge 60 ] && { echo "Database not reachable" >&2; exit 1; }
      sleep 2
    done
    # Applying migrations on start keeps install and update the same path:
    # a new image + restart is all an update needs.
    $AS_WWW php artisan migrate --force
    exec supervisord -c /etc/supervisor/supervisord.conf
    ;;
  queue)
    exec $AS_WWW php artisan queue:work --queue="${QUEUES:-imports,default}" --sleep=2 --tries=3 --timeout=3700 --max-time=3600
    ;;
  scheduler)
    exec $AS_WWW php artisan schedule:work
    ;;
  *)
    exec "$@"
    ;;
esac
