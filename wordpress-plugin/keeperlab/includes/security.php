<?php

if (!defined('ABSPATH')) {
    exit;
}

function keeperlab_default_settings(): array
{
    return [
        'enabled' => true,
        'slug' => 'keeperlab',
        'supabase_url' => '',
        'supabase_anon_key' => '',
    ];
}

function keeperlab_get_settings(): array
{
    return wp_parse_args((array) get_option(KEEPERLAB_OPTION, []), keeperlab_default_settings());
}

function keeperlab_decode_jwt_payload(string $key): ?array
{
    $parts = explode('.', $key);
    if (count($parts) !== 3) {
        return null;
    }

    $payload = strtr($parts[1], '-_', '+/');
    $payload .= str_repeat('=', (4 - strlen($payload) % 4) % 4);
    $decoded = base64_decode($payload, true);
    if ($decoded === false) {
        return null;
    }

    $data = json_decode($decoded, true);
    return is_array($data) ? $data : null;
}

function keeperlab_is_public_supabase_key(string $key): bool
{
    $normalized = strtolower(trim($key));
    if ($normalized === '') {
        return true;
    }

    if (str_starts_with($normalized, 'sb_secret_') || str_contains($normalized, 'service_role')) {
        return false;
    }

    $payload = keeperlab_decode_jwt_payload($key);
    return !$payload || (($payload['role'] ?? 'anon') !== 'service_role');
}

function keeperlab_slug_conflict(string $slug): ?string
{
    $reserved = ['wp-admin', 'wp-login', 'wp-json', 'feed', 'author', 'category', 'tag'];
    if (in_array($slug, $reserved, true)) {
        return __('Lo slug è riservato da WordPress.', 'keeperlab');
    }

    if (get_page_by_path($slug, OBJECT, ['page', 'post'])) {
        return __('Esiste già una pagina o un articolo con questo slug.', 'keeperlab');
    }

    return null;
}

function keeperlab_sanitize_settings(array $input): array
{
    if (!current_user_can('manage_options')) {
        return keeperlab_get_settings();
    }

    $current = keeperlab_get_settings();
    $slug = sanitize_title((string) ($input['slug'] ?? 'keeperlab')) ?: 'keeperlab';
    $conflict = keeperlab_slug_conflict($slug);
    if ($conflict) {
        add_settings_error(KEEPERLAB_OPTION, 'keeperlab_slug_conflict', $conflict);
        $slug = $current['slug'];
    }

    $url = esc_url_raw(trim((string) ($input['supabase_url'] ?? '')));
    if ($url && !str_starts_with(strtolower($url), 'https://')) {
        add_settings_error(KEEPERLAB_OPTION, 'keeperlab_url_https', __('L’URL Supabase deve utilizzare HTTPS.', 'keeperlab'));
        $url = $current['supabase_url'];
    }

    $key = trim(sanitize_text_field((string) ($input['supabase_anon_key'] ?? '')));
    if (!keeperlab_is_public_supabase_key($key)) {
        add_settings_error(KEEPERLAB_OPTION, 'keeperlab_secret_key', __('Chiave rifiutata: inserire esclusivamente la chiave anon/publishable pubblica.', 'keeperlab'));
        $key = $current['supabase_anon_key'];
    }

    return [
        'enabled' => !empty($input['enabled']),
        'slug' => $slug,
        'supabase_url' => untrailingslashit($url),
        'supabase_anon_key' => $key,
    ];
}
