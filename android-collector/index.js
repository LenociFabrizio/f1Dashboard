// index.js — entry dell'app Android
// ------------------------------------------------------------
// 1) polyfills (global.Buffer) PRIMA di tutto il resto;
// 2) registra il foreground service di notifee (task che non si risolve mai:
//    tiene vivo il processo/JS/socket finché non fermiamo il servizio);
// 3) registra il componente React radice.
// ------------------------------------------------------------
import './polyfills';

import notifee from '@notifee/react-native';
import { registerRootComponent } from 'expo';

import App from './App';

// Il task del foreground service resta "appeso": non si risolve mai, così il
// servizio (e con lui il runtime JS + il socket UDP) rimane attivo con lo
// schermo spento. Lo fermiamo esplicitamente con notifee.stopForegroundService().
notifee.registerForegroundService(() => new Promise(() => {}));

registerRootComponent(App);
