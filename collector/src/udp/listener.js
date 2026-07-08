/**
 * udp/listener.js
 * ------------------------------------------------------------
 * Socket UDP che riceve i pacchetti telemetria di F1 25.
 * Emette ogni datagramma grezzo (Buffer) tramite callback: il parsing
 * avviene a valle. È deliberatamente "stupido" e isolato, così è
 * facile testarlo e sostituirlo.
 * ------------------------------------------------------------
 */
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

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
    if (this.socket) return;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;

    socket.on('message', (msg) => this.emit('packet', msg));
    socket.on('error', (err) => this.emit('error', err));
    socket.on('listening', () => {
      const a = socket.address();
      this.emit('listening', a);
    });

    socket.bind(this.port, this.host);
    return this;
  }

  stop() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

export default UdpListener;
