/**
 * plugins/withForegroundServiceType.js
 * ------------------------------------------------------------
 * Config plugin Expo: forza `android:foregroundServiceType="dataSync"` sul
 * <service> del foreground service di notifee (`app.notifee.core.ForegroundService`).
 *
 * Perché serve:
 * - Il service NON è nel manifest dell'app: è dichiarato dentro l'AAR di
 *   `notifee-core` e viene unito dal manifest merger a build time. L'AAR lo
 *   dichiara con `foregroundServiceType="shortService"`, che su Android 14+
 *   limita il servizio a ~3 minuti → inutile per una gara intera.
 * - A runtime avviamo il servizio con tipo `dataSync`; su targetSdk 34+ il tipo
 *   passato a startForeground DEVE combaciare con quello dichiarato nel manifest,
 *   altrimenti crash (MissingForegroundServiceTypeException / SecurityException).
 *
 * Non potendo modificare l'AAR, dichiariamo nel manifest dell'app un override
 * dello stesso <service> con `tools:node="merge"` + `tools:replace=...` così il
 * merger sostituisce il tipo con `dataSync`.
 * ------------------------------------------------------------
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const SERVICE_NAME = 'app.notifee.core.ForegroundService';
const SERVICE_TYPE = 'dataSync';

module.exports = function withForegroundServiceType(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // 1) Assicura il namespace xmlns:tools sul <manifest> (serve per tools:replace).
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service || [];

    // 2) Trova un eventuale <service> già presente per notifee, altrimenti crealo.
    let svc = app.service.find((s) => s.$?.['android:name'] === SERVICE_NAME);
    if (!svc) {
      svc = { $: { 'android:name': SERVICE_NAME } };
      app.service.push(svc);
    }

    // 3) Override del tipo + direttive per il manifest merger.
    svc.$['android:foregroundServiceType'] = SERVICE_TYPE;
    svc.$['tools:node'] = 'merge';
    svc.$['tools:replace'] = 'android:foregroundServiceType';

    return cfg;
  });
};
