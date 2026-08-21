=== KeeperLab ===
Contributors: keeperlab
Tags: goalkeeper, football, training, supabase
Requires at least: 6.4
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later

KeeperLab standalone per la gestione degli allenamenti e delle valutazioni dei portieri.

== Installation ==

1. Caricare keeperlab.zip da Plugin > Aggiungi nuovo > Carica plugin.
2. Attivare KeeperLab.
3. Aprire Impostazioni > KeeperLab.
4. Inserire URL e chiave anon/publishable pubblica Supabase.
5. Aprire /keeperlab/.

Se modifichi lo slug, disattiva e riattiva il plugin una volta per aggiornare le rewrite rules. Il flush non viene eseguito durante le normali richieste.

== Security ==

Non inserire service_role, password del database o chiavi Supabase segrete.
La route pubblica mostra il login KeeperLab; dati e operazioni restano protetti da Supabase Auth e RLS.

== Uninstall ==

La disinstallazione elimina solo le opzioni WordPress del plugin. Nessun dato Supabase viene modificato.
