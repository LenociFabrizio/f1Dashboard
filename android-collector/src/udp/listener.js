/**
 * udp/listener.js  (Android)
 * ------------------------------------------------------------
 * Socket UDP che riceve i pacchetti telemetria di F1 25, versione React
 * Native basata su `react-native-udp` (shim dell'API `dgram` di Node).
 *
 * Emette ogni datagramma grezzo (Buffer) tramite evento 'packet': il parsing
 * avviene a valle. `react-native-udp` decodifica internamente il payload
 * nativo (base64) in un vero Buffer, quindi il parser lo ingoia invariato.
 *
 * Stessa interfaccia del listener PC ('listening'/'packet'/'error'): il
 * cablaggio a valle (plumbing.js) non nota la differenza.
 * ------------------------------------------------------------
 */
import dgram from 'react-native-udp';
import { EventEmitter } from 'events';

export class UdpListener extends EventEmitter {
  /**
   * @param {{port:number, host:string}} opts
   */
  constructor({ port = 20777, host = '0.0.0.0' } = {}) {
    super();
    this.port = port;
    this.host = host;
    this.socket = null;
  }

  start() {
    if (this.socket) return this;
    // reusePort = equivalente di reuseAddr del dgram di Node in react-native-udp.
    const socket = dgram.createSocket({ type: 'udp4', reusePort: true });
    this.socket = socket;

    socket.on('message', (msg /* Buffer */) => this.emit('packet', msg));
    socket.on('error', (err) => this.emit('error', err));
    socket.on('listening', () => {
      let addr;
      try {
        addr = socket.address();
      } catch {
        addr = { address: this.host, port: this.port };
      }
      this.emit('listening', addr);
    });

    // Firma node-compatibile: bind(port, address).
    socket.bind(this.port, this.host);
    return this;
  }

  stop() {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* già chiuso */
      }
      this.socket = null;
    }
  }
}

export default UdpListener;
