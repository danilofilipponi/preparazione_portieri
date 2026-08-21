<?php

if (!defined('ABSPATH')) {
    exit;
}

function keeperlab_register_settings(): void
{
    register_setting('keeperlab_settings_group', KEEPERLAB_OPTION, [
        'type' => 'array',
        'sanitize_callback' => 'keeperlab_sanitize_settings',
        'default' => keeperlab_default_settings(),
    ]);
}

function keeperlab_add_settings_page(): void
{
    add_options_page(
        __('KeeperLab', 'keeperlab'),
        __('KeeperLab', 'keeperlab'),
        'manage_options',
        'keeperlab',
        'keeperlab_render_settings_page'
    );
}

function keeperlab_route_conflict_notice(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }

    $settings = keeperlab_get_settings();
    $conflict = keeperlab_slug_conflict((string) $settings['slug']);
    if ($conflict) {
        printf('<div class="notice notice-error"><p><strong>KeeperLab:</strong> %s</p></div>', esc_html($conflict));
    }
}

function keeperlab_render_settings_page(): void
{
    if (!current_user_can('manage_options')) {
        wp_die(esc_html__('Non hai i permessi necessari.', 'keeperlab'));
    }

    $settings = keeperlab_get_settings();
    $slug = sanitize_title((string) $settings['slug']) ?: 'keeperlab';
    ?>
    <div class="wrap">
        <h1><?php echo esc_html__('KeeperLab', 'keeperlab'); ?></h1>
        <p><?php echo esc_html__('Configura esclusivamente la pagina standalone e le credenziali pubbliche Supabase.', 'keeperlab'); ?></p>
        <?php settings_errors(KEEPERLAB_OPTION); ?>
        <form method="post" action="options.php">
            <?php settings_fields('keeperlab_settings_group'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><?php echo esc_html__('KeeperLab abilitato', 'keeperlab'); ?></th>
                    <td><label><input type="checkbox" name="<?php echo esc_attr(KEEPERLAB_OPTION); ?>[enabled]" value="1" <?php checked(!empty($settings['enabled'])); ?>> <?php echo esc_html__('Rendi disponibile la route standalone.', 'keeperlab'); ?></label></td>
                </tr>
                <tr>
                    <th scope="row"><label for="keeperlab-slug"><?php echo esc_html__('Slug', 'keeperlab'); ?></label></th>
                    <td><input id="keeperlab-slug" class="regular-text" name="<?php echo esc_attr(KEEPERLAB_OPTION); ?>[slug]" value="<?php echo esc_attr($slug); ?>" pattern="[a-z0-9-]+" required><p class="description"><?php echo esc_html(home_url('/' . $slug . '/')); ?> — <?php echo esc_html__('Dopo una modifica dello slug, disattiva e riattiva il plugin per aggiornare le rewrite rules.', 'keeperlab'); ?></p></td>
                </tr>
                <tr>
                    <th scope="row"><label for="keeperlab-supabase-url"><?php echo esc_html__('Supabase URL pubblico', 'keeperlab'); ?></label></th>
                    <td><input id="keeperlab-supabase-url" class="large-text" type="url" name="<?php echo esc_attr(KEEPERLAB_OPTION); ?>[supabase_url]" value="<?php echo esc_attr((string) $settings['supabase_url']); ?>" placeholder="https://project.supabase.co" autocomplete="off"></td>
                </tr>
                <tr>
                    <th scope="row"><label for="keeperlab-supabase-key"><?php echo esc_html__('Supabase anon/public key', 'keeperlab'); ?></label></th>
                    <td><input id="keeperlab-supabase-key" class="large-text code" type="password" name="<?php echo esc_attr(KEEPERLAB_OPTION); ?>[supabase_anon_key]" value="<?php echo esc_attr((string) $settings['supabase_anon_key']); ?>" autocomplete="new-password"><p class="description"><?php echo esc_html__('Non inserire service_role, database password o chiavi segrete.', 'keeperlab'); ?></p></td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

add_action('admin_init', 'keeperlab_register_settings');
add_action('admin_menu', 'keeperlab_add_settings_page');
add_action('admin_notices', 'keeperlab_route_conflict_notice');
