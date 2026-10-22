# syntax=docker/dockerfile:1
# One image for the web app, the queue worker and the scheduler
# (selected at runtime by CONTAINER_ROLE). Built on a connected machine;
# everything it needs at runtime is inside the image.

########## PHP runtime ##########
FROM php:8.3-fpm-bookworm AS base

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      nginx supervisor curl unzip \
      libzip-dev libpng-dev libjpeg62-turbo-dev libwebp-dev libfreetype6-dev libicu-dev \
 && docker-php-ext-configure gd --with-jpeg --with-webp --with-freetype \
 && docker-php-ext-install -j"$(nproc)" pdo_mysql zip gd intl bcmath pcntl exif opcache \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY docker/app/php.ini /usr/local/etc/php/conf.d/zz-archive.ini
COPY docker/app/php-fpm.conf /usr/local/etc/php-fpm.d/zz-archive.conf
COPY docker/app/nginx.conf /etc/nginx/conf.d/archive.conf
COPY docker/app/supervisord.conf /etc/supervisor/conf.d/archive.conf
COPY docker/app/entrypoint.sh /usr/local/bin/entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint && chmod +x /usr/local/bin/entrypoint

WORKDIR /var/www/html

########## Frontend assets (desktop admin UI) ##########
FROM node:22-bookworm-slim AS assets
WORKDIR /build
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY backend/vite.config.js ./
COPY backend/resources ./resources
RUN npm run build

########## Composer dependencies ##########
FROM base AS vendor
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

########## Production app ##########
FROM base AS app
# Contract with the phone app (manifest schema, box code vectors): base_path('../shared').
COPY shared /var/www/shared
COPY backend/ ./
COPY --from=vendor /var/www/html/vendor ./vendor
COPY --from=assets /build/public/build ./public/build
RUN composer dump-autoload --optimize --classmap-authoritative --no-dev \
 && php artisan package:discover --ansi \
 && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs \
 && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 80
ENTRYPOINT ["entrypoint"]

########## Test image (dev dependencies + test runner) ##########
FROM app AS test
RUN composer install --prefer-dist --no-interaction --no-scripts \
 && composer dump-autoload \
 && touch .env
ENTRYPOINT []
CMD ["php", "artisan", "test"]
