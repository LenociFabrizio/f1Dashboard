/**
 * App.js — UI single-screen
 * ------------------------------------------------------------
 * Unico obiettivo: ricevere la telemetria UDP e inviarla al sito.
 * - inserisci il token (personale o di lega) e conferma l'URL di ingest;
 * - Avvia → foreground service (notifica persistente) + ascolto UDP :20777;
 * - lo stato mostra pacchetti ricevuti, sessione corrente, ultimo invio, coda.
 * ------------------------------------------------------------
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, { AndroidImportance, AndroidForegroundServiceType } from '@notifee/react-native';

import { Collector } from './src/plumbing.js';
import { DEFAULT_INGEST_URL, UDP_PORT, STORAGE_KEYS } from './src/config.js';

const CHANNEL_ID = 'telemetry';

/** Avvia il foreground service (notifica persistente). */
async function startForegroundService() {
  await notifee.requestPermission(); // POST_NOTIFICATIONS su Android 13+
  const channelId = await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Telemetria F1',
    importance: AndroidImportance.LOW,
  });
  await notifee.displayNotification({
    id: 'telemetry-fgs',
    title: 'Telemetria F1 attiva',
    body: `In ascolto UDP sulla porta ${UDP_PORT}`,
    android: {
      channelId,
      asForegroundService: true,
      foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_DATA_SYNC],
      ongoing: true,
      importance: AndroidImportance.LOW,
      pressAction: { id: 'default' },
    },
  });
}

export default function App() {
  const [token, setToken] = useState('');
  const [ingestUrl, setIngestUrl] = useState(DEFAULT_INGEST_URL);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState({
    listening: false,
    address: null,
    packets: 0,
    currentSession: null,
    lastSessionType: null,
    lastSent: null,
    lastError: null,
    queued: 0,
  });

  const collectorRef = useRef(null);

  // Carica le impostazioni salvate.
  useEffect(() => {
    (async () => {
      try {
        const [savedToken, savedUrl] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.token),
          AsyncStorage.getItem(STORAGE_KEYS.ingestUrl),
        ]);
        if (savedToken) setToken(savedToken);
        if (savedUrl) setIngestUrl(savedUrl);
      } catch {
        /* ignora */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const start = useCallback(async () => {
    if (running || busy) return;
    setBusy(true);
    try {
      await AsyncStorage.multiSet([
        [STORAGE_KEYS.token, token.trim()],
        [STORAGE_KEYS.ingestUrl, ingestUrl.trim()],
      ]);

      if (Platform.OS === 'android') {
        await startForegroundService();
      }
      await activateKeepAwakeAsync();

      const collector = new Collector({ ingestUrl: ingestUrl.trim(), token: token.trim() });
      collector.on('status', (s) => setStatus(s));
      collector.start();
      collectorRef.current = collector;
      setRunning(true);
    } catch (err) {
      setStatus((s) => ({ ...s, lastError: err?.message || String(err) }));
    } finally {
      setBusy(false);
    }
  }, [running, busy, token, ingestUrl]);

  const stop = useCallback(async () => {
    if (!running || busy) return;
    setBusy(true);
    try {
      collectorRef.current?.stop();
      collectorRef.current = null;
      deactivateKeepAwake();
      if (Platform.OS === 'android') {
        await notifee.stopForegroundService();
      }
      setRunning(false);
    } catch (err) {
      setStatus((s) => ({ ...s, lastError: err?.message || String(err) }));
    } finally {
      setBusy(false);
    }
  }, [running, busy]);

  if (!loaded) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#e10600" size="large" />
      </View>
    );
  }

  const lastSentText = status.lastSent
    ? `${status.lastSent.deduped ? 'già presente' : 'inviata'} · ${status.lastSessionType ?? ''}`
    : '—';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>F1 Telemetry Relay</Text>
        <Text style={styles.subtitle}>
          Riceve la telemetria UDP di F1 25 e la invia al portale del campionato.
        </Text>

        {/* --- Impostazioni --- */}
        <View style={styles.card}>
          <Text style={styles.label}>Token</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Incolla qui il tuo token"
            placeholderTextColor="#6b7280"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!running}
          />

          <Text style={[styles.label, styles.mt]}>URL di ingest</Text>
          <TextInput
            style={styles.input}
            value={ingestUrl}
            onChangeText={setIngestUrl}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!running}
          />
        </View>

        {/* --- Avvia / Ferma --- */}
        <Pressable
          style={[styles.button, running ? styles.buttonStop : styles.buttonStart, busy && styles.buttonBusy]}
          onPress={running ? stop : start}
          disabled={busy || (!running && !token.trim())}
        >
          <Text style={styles.buttonText}>
            {busy ? 'Attendere…' : running ? 'Ferma' : 'Avvia'}
          </Text>
        </Pressable>
        {!running && !token.trim() ? (
          <Text style={styles.hint}>Inserisci un token per avviare.</Text>
        ) : null}

        {/* --- Stato --- */}
        <View style={styles.card}>
          <Row label="Stato" value={running ? (status.listening ? 'in ascolto' : 'avvio…') : 'fermo'} />
          <Row label="Indirizzo" value={status.address ?? `:${UDP_PORT}`} />
          <Row label="Pacchetti ricevuti" value={String(status.packets)} />
          <Row label="Sessione corrente" value={status.currentSession ?? '—'} />
          <Row label="Ultimo invio" value={lastSentText} />
          <Row label="In coda" value={String(status.queued)} />
          {status.lastError ? <Row label="Errore" value={status.lastError} danger /> : null}
        </View>

        {/* --- Istruzioni --- */}
        <View style={styles.card}>
          <Text style={styles.label}>Come collegare F1 25</Text>
          <Text style={styles.help}>
            Telefono e console sulla stessa rete WiFi (o usa il telefono come hotspot).
            In F1 25 → Impostazioni → Telemetria:
          </Text>
          <Text style={styles.help}>• UDP Telemetry: On</Text>
          <Text style={styles.help}>• UDP IP Address: l'IP di questo telefono nella rete</Text>
          <Text style={styles.help}>• UDP Port: {UDP_PORT}</Text>
          <Text style={styles.help}>
            Per gare lunghe: disattiva l'ottimizzazione batteria per questa app.
          </Text>
          <Pressable onPress={() => Linking.openURL('https://f1-dashboard-eosin.vercel.app/practice.html')}>
            <Text style={styles.link}>Apri "I miei tempi" sul sito →</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, danger }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, danger && styles.rowDanger]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0f' },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingTop: 56, gap: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#9ca3af', fontSize: 13, marginTop: -8 },
  card: { backgroundColor: '#15151c', borderRadius: 14, padding: 16, gap: 6 },
  label: { color: '#e5e7eb', fontSize: 13, fontWeight: '700' },
  mt: { marginTop: 12 },
  input: {
    backgroundColor: '#0b0b0f',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 10,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonStart: { backgroundColor: '#e10600' },
  buttonStop: { backgroundColor: '#374151' },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hint: { color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: -8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  rowLabel: { color: '#9ca3af', fontSize: 13 },
  rowValue: { color: '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  rowDanger: { color: '#f87171' },
  help: { color: '#9ca3af', fontSize: 13, lineHeight: 19 },
  link: { color: '#60a5fa', fontSize: 13, fontWeight: '700', marginTop: 8 },
});
