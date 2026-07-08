/**
 * live/server.js
 * ------------------------------------------------------------
 * Vista live LOCALE (facoltativa) sul PC di gioco. Espone una pagina
 * che mostra la classifica in tempo reale della sessione corrente,
 * leggendo lo stato dell'aggregatore. Non invia nulla al sito: serve
 * solo al giocatore/admin per controllo immediato.
 * ------------------------------------------------------------
 */
import http from 'node:http';
import { platformName } from '../parser/enums.js';

const PAGE = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>F1 Collector · Live</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;background:#0b0b0f;color:#eee;margin:0;padding:24px}
  h1{font-size:1.1rem;color:#e10600;margin:0 0 4px}
  .sub{color:#888;font-size:.8rem;margin-bottom:16px}
  table{border-collapse:collapse;width:100%;max-width:640px}
  th,td{padding:6px 10px;text-align:left;border-bottom:1px solid #222;font-size:.9rem}
  th{color:#999;font-weight:600;text-transform:uppercase;font-size:.7rem}
  .pos{width:36px;color:#e10600;font-weight:700}
  .dim{color:#777}
</style></head><body>
<h1>🏎️ F1 Collector — Live</h1>
<div class="sub" id="status">In attesa di dati dal gioco…</div>
<table><thead><tr><th class="pos">Pos</th><th>Pilota</th><th>Giro</th><th>Pit</th></tr></thead>
<tbody id="rows"></tbody></table>
<script>
async function tick(){
  try{
    const r = await fetch('/state'); const s = await r.json();
    const st = document.getElementById('status');
    if(!s.active){ st.textContent='Nessuna sessione attiva.'; document.getElementById('rows').innerHTML=''; return; }
    st.textContent = s.sessionType.toUpperCase()+' · '+s.drivers.length+' piloti · UID '+s.sessionUID;
    document.getElementById('rows').innerHTML = s.drivers
      .sort((a,b)=>(a.position||99)-(b.position||99))
      .map(d=>'<tr><td class="pos">'+(d.position||'–')+'</td><td>'+d.name+' <span class="dim">'+d.platform+'</span></td><td>'+(d.lap||'–')+'</td><td>'+(d.pitStops||0)+'</td></tr>').join('');
  }catch(e){ /* collector non pronto */ }
}
setInterval(tick, 1000); tick();
</script></body></html>`;

export class LiveServer {
  /** @param {{aggregator:import('../session/aggregator.js').SessionAggregator, port:number}} opts */
  constructor({ aggregator, port = 4600 }) {
    this.aggregator = aggregator;
    this.port = port;
    this.server = null;
  }

  start() {
    if (this.server) return this;
    this.server = http.createServer((req, res) => {
      if (req.url === '/state') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(this._state()));
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PAGE);
    });
    this.server.listen(this.port);
    return this;
  }

  stop() {
    if (this.server) this.server.close();
    this.server = null;
  }

  /** Istantanea leggibile dello stato corrente per la pagina. */
  _state() {
    const s = this.aggregator.current;
    if (!s || !s.participants) return { active: false };
    const parts = s.participants.participants || [];
    const num = s.participants.numActiveCars ?? parts.length;
    const laps = s.lapData?.cars || [];
    const drivers = parts.slice(0, num).map((p, i) => ({
      name: p.name || `Car ${i}`,
      platform: platformName(p.platform),
      position: laps[i]?.carPosition ?? null,
      lap: laps[i]?.currentLapNum ?? null,
      pitStops: laps[i]?.numPitStops ?? 0,
    }));
    return {
      active: true,
      sessionUID: s.sessionUID,
      sessionType: s.meta ? String(s.meta.sessionType ?? '') : '',
      drivers,
    };
  }
}

export default LiveServer;
