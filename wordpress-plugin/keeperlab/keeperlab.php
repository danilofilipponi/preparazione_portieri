<?php
/**
 * Plugin Name: KeeperLab
 * Plugin URI: https://keeperlab.app/
 * Description: KeeperLab standalone per la gestione degli allenamenti e delle valutazioni dei portieri.
 * Version: 1.0.0
 * Requires at least: 6.4
 * Requires PHP: 8.0
 * Author: KeeperLab
 * License: GPL-2.0-or-later
 * Text Domain: keeperlab
 */

if (!defined('ABSPATH')) {
    exit;
}

define('KEEPERLAB_VERSION', '1.0.0');
define('KEEPERLAB_PLUGIN_FILE', __FILE__);
define('KEEPERLAB_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('KEEPERLAB_PLUGIN_URL', plugin_dir_url(__FILE__));
define('KEEPERLAB_OPTION', 'keeperlab_settings');

require_once KEEPERLAB_PLUGIN_DIR . 'includes/security.php';
require_once KEEPERLAB_PLUGIN_DIR . 'includes/routing.php';
require_once KEEPERLAB_PLUGIN_DIR . 'includes/template.php';
require_once KEEPERLAB_PLUGIN_DIR . 'includes/settings.php';

function keeperlab_activate(): void
{
    if (!get_option(KEEPERLAB_OPTION, false)) {
        add_option(KEEPERLAB_OPTION, keeperlab_default_settings(), '', false);
    }

    keeperlab_register_rewrite_rule();
    flush_rewrite_rules();
}

function keeperlab_deactivate(): void
{
    flush_rewrite_rules();
}

register_activation_hook(__FILE__, 'keeperlab_activate');
register_deactivation_hook(__FILE__, 'keeperlab_deactivate');
