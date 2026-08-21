<?php

if (!defined('ABSPATH')) {
    exit;
}

$entry = keeperlab_entry_asset();
$runtime_config = keeperlab_runtime_config();
$json_flags = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES;
?><!doctype html>
<html lang="it">
<head>
    <meta charset="<?php echo esc_attr(get_bloginfo('charset') ?: 'UTF-8'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#173e32">
    <meta name="robots" content="noindex,nofollow">
    <title><?php echo esc_html__('KeeperLab — Allenamenti portieri', 'keeperlab'); ?></title>
    <?php if (is_readable(KEEPERLAB_PLUGIN_DIR . 'app/icons/icon-192.png')) : ?>
        <link rel="icon" href="<?php echo esc_url(KEEPERLAB_PLUGIN_URL . 'app/icons/icon-192.png'); ?>" sizes="192x192">
    <?php endif; ?>
    <?php foreach ((array) ($entry['css'] ?? []) as $stylesheet) : ?>
        <link rel="stylesheet" href="<?php echo esc_url(KEEPERLAB_PLUGIN_URL . 'app/' . ltrim((string) $stylesheet, '/')); ?>">
    <?php endforeach; ?>
</head>
<body>
    <div id="keeperlab-root"></div>
    <script>window.KEEPERLAB_CONFIG = <?php echo wp_json_encode($runtime_config, $json_flags); ?>;</script>
    <?php if (!empty($entry['file'])) : ?>
        <script type="module" src="<?php echo esc_url(KEEPERLAB_PLUGIN_URL . 'app/' . ltrim((string) $entry['file'], '/')); ?>"></script>
    <?php else : ?>
        <main style="font:16px system-ui;padding:2rem"><h1>KeeperLab</h1><p><?php echo esc_html__('Bundle applicativo non disponibile. Rigenera e reinstalla il plugin.', 'keeperlab'); ?></p></main>
    <?php endif; ?>
</body>
</html>
