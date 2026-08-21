<?php

if (!defined('ABSPATH')) {
    exit;
}

function keeperlab_asset_manifest(): array
{
    $path = KEEPERLAB_PLUGIN_DIR . 'app/manifest.json';
    if (!is_readable($path)) {
        return [];
    }

    $manifest = json_decode((string) file_get_contents($path), true);
    return is_array($manifest) ? $manifest : [];
}

function keeperlab_entry_asset(): array
{
    $manifest = keeperlab_asset_manifest();
    if (isset($manifest['wordpress-src/main.tsx'])) {
        return (array) $manifest['wordpress-src/main.tsx'];
    }

    foreach ($manifest as $asset) {
        if (!empty($asset['isEntry'])) {
            return (array) $asset;
        }
    }

    return [];
}

function keeperlab_runtime_config(): array
{
    $settings = keeperlab_get_settings();
    $slug = sanitize_title((string) $settings['slug']) ?: 'keeperlab';
    return [
        'wordpress' => true,
        'hashRouting' => true,
        'slug' => $slug,
        'baseUrl' => home_url('/' . $slug . '/'),
        'assetUrl' => KEEPERLAB_PLUGIN_URL . 'app/',
        'supabaseUrl' => (string) $settings['supabase_url'],
        'supabaseAnonKey' => (string) $settings['supabase_anon_key'],
    ];
}
