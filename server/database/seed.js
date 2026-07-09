/**
 * seed.js
 * ------------------------------------------------------------
 * Popola il database con dati demo realistici per F1 25:
 *  - 10 team ufficiali
 *  - calendario circuiti
 *  - 1 stagione attiva
 *  - utenti (1 admin + piloti)
 *  - alcune gare concluse con risultati e qualifiche
 *  - notizie
 *
 * Uso:
 *   npm run seed          → popola (mantiene DB esistente, salta se già popolato)
 *   npm run db:reset      → azzera e ripopola
 *
 * Il DB target è quello configurato (locale file: o Turso via env).
 * ------------------------------------------------------------
 */
import bcrypt from 'bcryptjs';
import db, { initSchema } from './db.js';
import { calculatePoints } from '../utils/constants.js';

const RESET = process.argv.includes('--reset');

async function main() {
  // Assicura che lo schema esista
  await initSchema();

  // --------------------------------------------------------
  // Reset opzionale (ordine figli → padri, FK-safe)
  // --------------------------------------------------------
  if (RESET) {
    console.log('⚠️  Reset database in corso...');
    const tables = [
      'post_tags', 'posts', 'achievements', 'manual_stats', 'news', 'results', 'qualifying',
      'races', 'circuits', 'seasons', 'users', 'teams',
    ];
    for (const t of tables) await db.exec(`DELETE FROM ${t};`);
  }

  // Evita doppie esecuzioni
  const already = (await db.prepare('SELECT COUNT(*) c FROM users').get()).c;
  if (already > 0 && !RESET) {
    console.log('ℹ️  Database già popolato. Usa "npm run db:reset" per rigenerare.');
    return;
  }

  console.log('🌱 Seeding in corso...');

  // --------------------------------------------------------
  // TEAM (F1 25)
  // --------------------------------------------------------
  const teams = [
    ['Red Bull Racing', 'Oracle Red Bull Racing', '#3671C6', 'Milton Keynes, UK', 'Honda RBPT'],
    ['Ferrari', 'Scuderia Ferrari', '#E8002D', 'Maranello, Italy', 'Ferrari'],
    ['Mercedes', 'Mercedes-AMG Petronas', '#27F4D2', 'Brackley, UK', 'Mercedes'],
    ['McLaren', 'McLaren F1 Team', '#FF8000', 'Woking, UK', 'Mercedes'],
    ['Aston Martin', 'Aston Martin Aramco', '#229971', 'Silverstone, UK', 'Mercedes'],
    ['Alpine', 'BWT Alpine F1 Team', '#0093CC', 'Enstone, UK', 'Renault'],
    ['Williams', 'Williams Racing', '#64C4FF', 'Grove, UK', 'Mercedes'],
    ['RB', 'Visa Cash App RB', '#6692FF', 'Faenza, Italy', 'Honda RBPT'],
    ['Kick Sauber', 'Stake F1 Team Kick Sauber', '#52E252', 'Hinwil, Switzerland', 'Ferrari'],
    ['Haas', 'MoneyGram Haas F1 Team', '#B6BABD', 'Kannapolis, USA', 'Ferrari'],
  ];
  const insertTeam = db.prepare(
    `INSERT INTO teams (name, full_name, color, base, power_unit) VALUES (?, ?, ?, ?, ?)`
  );
  const teamIds = {};
  for (const t of teams) {
    const info = await insertTeam.run(...t);
    teamIds[t[0]] = info.lastInsertRowid;
  }

  // --------------------------------------------------------
  // CIRCUITI (selezione del calendario)
  // --------------------------------------------------------
  const circuits = [
    ['Bahrain International Circuit', 'Bahrain', 'BH', 'Sakhir', 5.412, 57],
    ['Jeddah Corniche Circuit', 'Arabia Saudita', 'SA', 'Jeddah', 6.174, 50],
    ['Albert Park Circuit', 'Australia', 'AU', 'Melbourne', 5.278, 58],
    ['Suzuka International', 'Giappone', 'JP', 'Suzuka', 5.807, 53],
    ['Shanghai International', 'Cina', 'CN', 'Shanghai', 5.451, 56],
    ['Miami International', 'USA', 'US', 'Miami', 5.412, 57],
    ['Autodromo di Imola', 'Italia', 'IT', 'Imola', 4.909, 63],
    ['Circuit de Monaco', 'Monaco', 'MC', 'Monte Carlo', 3.337, 78],
    ['Circuit de Barcelona', 'Spagna', 'ES', 'Barcellona', 4.657, 66],
    ['Circuit Gilles Villeneuve', 'Canada', 'CA', 'Montreal', 4.361, 70],
    ['Red Bull Ring', 'Austria', 'AT', 'Spielberg', 4.318, 71],
    ['Silverstone Circuit', 'Gran Bretagna', 'GB', 'Silverstone', 5.891, 52],
    ['Circuit de Spa', 'Belgio', 'BE', 'Spa', 7.004, 44],
    ['Hungaroring', 'Ungheria', 'HU', 'Budapest', 4.381, 70],
    ['Autodromo di Monza', 'Italia', 'IT', 'Monza', 5.793, 53],
    ['Marina Bay', 'Singapore', 'SG', 'Singapore', 4.940, 62],
    ['Circuit Zandvoort', 'Paesi Bassi', 'NL', 'Zandvoort', 4.259, 72],
    ['Baku City Circuit', 'Azerbaigian', 'AZ', 'Baku', 6.003, 51],
    ['Circuit of the Americas', 'USA', 'US', 'Austin', 5.513, 56],
    ['Autódromo Hermanos Rodríguez', 'Messico', 'MX', 'Città del Messico', 4.304, 71],
    ['Autódromo José Carlos Pace', 'Brasile', 'BR', 'San Paolo', 4.309, 71],
    ['Las Vegas Strip Circuit', 'USA', 'US', 'Las Vegas', 6.201, 50],
    ['Lusail International Circuit', 'Qatar', 'QA', 'Lusail', 5.419, 57],
    ['Yas Marina Circuit', 'Emirati Arabi Uniti', 'AE', 'Abu Dhabi', 5.281, 58],
  ];
  const insertCircuit = db.prepare(
    `INSERT INTO circuits (name, country, country_code, city, length_km, laps_default) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const circuitIds = [];
  for (const c of circuits) {
    const info = await insertCircuit.run(...c);
    circuitIds.push(info.lastInsertRowid);
  }

  // --------------------------------------------------------
  // STAGIONE
  // --------------------------------------------------------
  const seasonInfo = await db
    .prepare(`INSERT INTO seasons (name, year, game, description, is_active) VALUES (?, ?, ?, ?, 1)`)
    .run('Stagione 2025', 2025, 'F1 25', 'Il campionato ufficiale della lega. 16 gran premi, tanta gloria.');
  const seasonId = seasonInfo.lastInsertRowid;

  // --------------------------------------------------------
  // UTENTI (admin + piloti)
  // --------------------------------------------------------
  const pwd = bcrypt.hashSync('password123', 10);
  const adminPwd = bcrypt.hashSync('admin123', 10);

  const insertUser = db.prepare(
    `INSERT INTO users (username, display_name, first_name, last_name, email, password_hash, role, team_id, favorite_number, nationality, favorite_driver, biography, avatar)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // [username, display, email, role, team, number, nat, favDriver, bio]
  const drivers = [
    ['admin', 'Race Director', 'admin@f1league.it', 'admin', 'Ferrari', 0, 'IT', 'Charles Leclerc', 'Direttore di gara e fondatore della lega.'],
    ['maxpower', 'Max Power', 'max@f1league.it', 'pilota', 'Red Bull Racing', 1, 'NL', 'Max Verstappen', 'Aggressivo in staccata, imbattibile sotto la pioggia.'],
    ['leclerc16', 'Il Predestinato', 'leo@f1league.it', 'pilota', 'Ferrari', 16, 'MC', 'Charles Leclerc', 'Un giro secco da paura. La gara è un\'altra storia.'],
    ['lewis44', 'Sir Lewis', 'lewis@f1league.it', 'pilota', 'Mercedes', 44, 'GB', 'Lewis Hamilton', 'Esperienza e sangue freddo. Il re delle rimonte.'],
    ['norris4', 'Lando Smiles', 'lando@f1league.it', 'pilota', 'McLaren', 4, 'GB', 'Lando Norris', 'Veloce e simpatico. La costanza è il suo mantra.'],
    ['piastri81', 'The Rookie', 'oscar@f1league.it', 'pilota', 'McLaren', 81, 'AU', 'Oscar Piastri', 'Freddo come il ghiaccio, sorprende tutti.'],
    ['alonso14', 'El Plan', 'nando@f1league.it', 'pilota', 'Aston Martin', 14, 'ES', 'Fernando Alonso', 'Il vecchio leone non molla mai un centimetro.'],
    ['russell63', 'Mr. Saturday', 'george@f1league.it', 'pilota', 'Mercedes', 63, 'GB', 'George Russell', 'In qualifica vola. Punta al primo titolo.'],
    ['sainz55', 'Smooth Operator', 'carlos@f1league.it', 'pilota', 'Williams', 55, 'ES', 'Carlos Sainz', 'Gestione gomme da manuale.'],
    ['perez11', 'Checo', 'sergio@f1league.it', 'pilota', 'Red Bull Racing', 11, 'MX', 'Sergio Perez', 'Specialista dei circuiti cittadini.'],
    ['gasly10', 'Pierre', 'pierre@f1league.it', 'pilota', 'Alpine', 10, 'FR', 'Pierre Gasly', 'Combattente nel centro gruppo.'],
    ['hulk27', 'The Hulk', 'nico@f1league.it', 'pilota', 'Kick Sauber', 27, 'DE', 'Nico Hulkenberg', 'Punti pesanti quando meno te lo aspetti.'],
  ];

  const userIds = {};
  for (const d of drivers) {
    const [username, display, email, role, team, num, nat, fav, bio] = d;
    const sp = display.indexOf(' ');
    const firstName = sp === -1 ? display : display.slice(0, sp);
    const lastName = sp === -1 ? '' : display.slice(sp + 1);
    const info = await insertUser.run(
      username, display, firstName, lastName, email,
      role === 'admin' ? adminPwd : pwd,
      role, teamIds[team], num, nat, fav, bio,
      `/images/avatars/default.svg`
    );
    userIds[username] = info.lastInsertRowid;
  }

  // Alcuni piloti hanno un pilota di riserva (bot) assegnato
  const reserves = {
    leclerc16: 'Antonio Fuoco',
    perez11: 'Liam Lawson',
    norris4: 'Pato O\'Ward',
  };
  for (const [username, reserve] of Object.entries(reserves)) {
    await db.prepare('UPDATE users SET reserve_driver = ? WHERE id = ?').run(reserve, userIds[username]);
  }

  // Pool di piloti (include admin: può correre)
  const racingUsers = drivers
    .filter((d) => d[0] !== 'admin')
    .map((d) => ({ id: userIds[d[0]], team: teamIds[d[4]] })); // d[4] = nome team

  // --------------------------------------------------------
  // GARE + RISULTATI + QUALIFICHE
  // --------------------------------------------------------
  const insertRace = db.prepare(
    `INSERT INTO races (season_id, circuit_id, round, name, race_date, weather, laps, distance_km, status, comment, mvp_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertResult = db.prepare(
    `INSERT INTO results (race_id, user_id, team_id, grid_position, position, points, finish_time, gap, fastest_lap, pole, dnf, dnf_reason, penalty_seconds, penalty_note, overtakes, notes)
     VALUES (@race_id, @user_id, @team_id, @grid_position, @position, @points, @finish_time, @gap, @fastest_lap, @pole, @dnf, @dnf_reason, @penalty_seconds, @penalty_note, @overtakes, @notes)`
  );
  const insertQuali = db.prepare(
    `INSERT INTO qualifying (race_id, user_id, position, best_time, gap) VALUES (?, ?, ?, ?, ?)`
  );

  const raceNames = [
    'Gran Premio del Bahrain', 'Gran Premio dell\'Arabia Saudita', 'Gran Premio d\'Australia',
    'Gran Premio del Giappone', 'Gran Premio della Cina', 'Gran Premio di Miami',
    'Gran Premio dell\'Emilia-Romagna', 'Gran Premio di Monaco', 'Gran Premio di Spagna',
    'Gran Premio del Canada', 'Gran Premio d\'Austria', 'Gran Premio di Gran Bretagna',
    'Gran Premio del Belgio', 'Gran Premio d\'Ungheria', 'Gran Premio d\'Italia',
    'Gran Premio di Singapore',
  ];
  const weathers = ['Sereno', 'Nuvoloso', 'Pioggia leggera', 'Variabile', 'Caldo'];

  // Utility: mescola array in modo deterministico-ish
  function shuffled(arr, seed) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const COMPLETED = 6; // prime 6 gare concluse, resto programmate

  for (let round = 1; round <= raceNames.length; round++) {
    const circuitId = circuitIds[(round - 1) % circuitIds.length];
    const circuit = await db.prepare('SELECT * FROM circuits WHERE id = ?').get(circuitId);
    const status = round <= COMPLETED ? 'completed' : 'scheduled';
    // Date fittizie: una gara ogni 2 settimane a partire da marzo 2025
    const date = new Date(2025, 2, 2 + (round - 1) * 14, 15, 0, 0).toISOString();

    const mvpId = round <= COMPLETED ? racingUsers[(round * 3) % racingUsers.length].id : null;

    const raceInfo = await insertRace.run(
      seasonId, circuitId, round, raceNames[round - 1], date,
      weathers[round % weathers.length], circuit.laps_default,
      circuit.length_km * circuit.laps_default,
      status,
      status === 'completed' ? 'Gara combattuta fino all\'ultima curva. Grande spettacolo!' : '',
      mvpId
    );
    const raceId = raceInfo.lastInsertRowid;

    if (status !== 'completed') continue;

    // Ordine di arrivo mescolato per varietà
    const order = shuffled(racingUsers, round * 17 + 3);
    // Qualifiche: leggermente diverse dall'arrivo
    const gridOrder = shuffled(racingUsers, round * 31 + 7);

    // Qualifiche
    for (let i = 0; i < gridOrder.length; i++) {
      const u = gridOrder[i];
      const t = 81 + i * 0.18 + (round % 3) * 0.05;
      const time = `1:${Math.floor(t).toString().padStart(2, '0')}.${Math.floor((t % 1) * 1000).toString().padStart(3, '0')}`;
      await insertQuali.run(raceId, u.id, i + 1, time, i === 0 ? '' : `+${(i * 0.18).toFixed(3)}`);
    }
    const gridMap = new Map(gridOrder.map((u, i) => [u.id, i + 1]));

    // Risultati
    const fastestLapIdx = (round * 2) % order.length; // chi fa il giro veloce
    for (let i = 0; i < order.length; i++) {
      const u = order[i];
      const position = i + 1;
      // Simula qualche DNF nelle posizioni di coda
      const dnf = i >= order.length - 2 && (round + i) % 4 === 0 ? 1 : 0;
      const pole = gridMap.get(u.id) === 1 ? 1 : 0;
      const fastest = i === fastestLapIdx && !dnf ? 1 : 0;
      const finalPos = dnf ? null : position;
      const points = calculatePoints(finalPos, !!fastest, !!dnf);
      const penalty = (round + i) % 7 === 0 ? 5 : 0;

      await insertResult.run({
        race_id: raceId,
        user_id: u.id,
        team_id: u.team,
        grid_position: gridMap.get(u.id),
        position: finalPos,
        points,
        finish_time: position === 1 && !dnf ? `1:32:${(10 + round).toString().padStart(2, '0')}.456` : null,
        gap: dnf ? 'DNF' : position === 1 ? '' : `+${(i * 3.2 + 1.1).toFixed(3)}`,
        fastest_lap: fastest,
        pole,
        dnf,
        dnf_reason: dnf ? ['Incidente', 'Problema motore', 'Foratura'][(round + i) % 3] : '',
        penalty_seconds: penalty,
        penalty_note: penalty ? 'Track limits' : '',
        overtakes: dnf ? 0 : Math.max(0, ((round * 3 + i * 5) % 12)),
        notes: pole ? 'Partito dalla pole' : '',
      });
    }
  }

  // --------------------------------------------------------
  // STATISTICHE MANUALI (esempio: sorpassi totali)
  // --------------------------------------------------------
  const setManual = db.prepare(
    `INSERT OR REPLACE INTO manual_stats (season_id, user_id, stat_key, stat_value, note) VALUES (?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < racingUsers.length; i++) {
    await setManual.run(seasonId, racingUsers[i].id, 'season_overtakes', 20 + ((i * 7) % 40), 'Totale sorpassi stagione');
  }

  // --------------------------------------------------------
  // BOT DI RISERVA che ha corso al posto dell'utente (demo)
  // --------------------------------------------------------
  const botRuns = [
    ['leclerc16', 3, 'Antonio Fuoco'],
    ['perez11', 5, 'Liam Lawson'],
  ];
  for (const [username, round, bot] of botRuns) {
    await db
      .prepare(
        `UPDATE results SET bot_driver = ?
          WHERE user_id = ? AND race_id IN (SELECT id FROM races WHERE season_id = ? AND round = ?)`
      )
      .run(bot, userIds[username], seasonId, round);
  }

  // --------------------------------------------------------
  // BACHECA (post social di esempio, con tag)
  // --------------------------------------------------------
  const insertPost = db.prepare(
    `INSERT INTO posts (author_id, body, media_url, media_type, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  const insertPostTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, user_id) VALUES (?, ?)');
  // [autore, testo, media_url, media_type, [tag usernames]]
  const posts = [
    ['maxpower', 'Che rimonta oggi! Partito 5° e chiuso davanti a tutti 🏆 GG a tutti!', null, null, ['leclerc16', 'norris4']],
    ['leclerc16', 'Pole numero 3 stagionale. In gara però dobbiamo essere più cattivi in staccata 😤', null, null, ['maxpower']],
    ['norris4', 'Bel duello nel finale, ci siamo divertiti! Alla prossima 🍿', null, null, ['piastri81']],
    ['admin', 'Ricordo a tutti: dalla prossima gara le penalità track limits salgono a 5 secondi. Occhio ai cordoli!', null, null, []],
    ['lewis44', 'Setup perfetto nel bagnato, weekend da incorniciare. Grazie al team! 💪', null, null, ['russell63']],
  ];
  for (let i = 0; i < posts.length; i++) {
    const [author, body, media, mediaType, tags] = posts[i];
    // Post cronologicamente crescenti (i più recenti per ultimi)
    const d = new Date(2025, 3, 1 + i * 2, 12 + i).toISOString();
    const info = await insertPost.run(userIds[author], body, media, mediaType, d);
    for (const tg of tags) {
      if (userIds[tg]) await insertPostTag.run(info.lastInsertRowid, userIds[tg]);
    }
  }

  console.log('✅ Seed completato!');
  console.log('   Admin  → email: admin@f1league.it  password: admin123');
  console.log('   Pilota → email: max@f1league.it    password: password123');
  console.log(`   Team: ${teams.length} | Circuiti: ${circuits.length} | Piloti: ${drivers.length} | Gare: ${raceNames.length} (${COMPLETED} concluse)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed fallito:', err);
    process.exit(1);
  });
