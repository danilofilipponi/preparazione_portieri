<?php

if (!defined('ABSPATH')) {
    exit;
}

function keeperlab_register_rewrite_rule(): void
{
    $settings = keeperlab_get_settings();
    $slug = sanitize_title((string) $settings['slug']) ?: 'keeperlab';
    add_rewrite_tag('%keeperlab_app%', '([01])');
    if (keeperlab_slug_conflict($slug)) {
        return;
    }
    add_rewrite_rule('^' . preg_quote($slug, '/') . '/?$', 'index.php?keeperlab_app=1', 'top');
}

function keeperlab_query_vars(array $vars): array
{
    $vars[] = 'keeperlab_app';
    return $vars;
}

function keeperlab_is_app_request(): bool
{
    return (string) get_query_var('keeperlab_app') === '1';
}

function keeperlab_route_template(): void
{
    if (!keeperlab_is_app_request()) {
        return;
    }

    $settings = keeperlab_get_settings();
    if (empty($settings['enabled'])) {
        status_header(404);
        nocache_headers();
        exit;
    }

    status_header(200);
    nocache_headers();
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    require KEEPERLAB_PLUGIN_DIR . 'templates/keeperlab-app.php';
    exit;
}

add_action('init', 'keeperlab_register_rewrite_rule');
add_filter('query_vars', 'keeperlab_query_vars');
add_action('template_redirect', 'keeperlab_route_template', 0);
