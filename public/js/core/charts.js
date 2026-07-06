/* =============================================================
   charts.js — Wrapper su Chart.js con tema scuro F1.
   Fornisce factory pronte per i grafici del portale.
   Chart.js è caricato via CDN (window.Chart).
   ============================================================= */

const RED = '#e10600';
const GRID = 'rgba(255,255,255,0.06)';
const TICK = '#8a8a99';
const FONT = "'Titillium Web', sans-serif";

/** Applica i default globali al tema scuro (una volta sola). */
let themed = false;
export function applyChartTheme() {
  if (themed || !window.Chart) return;
  const C = window.Chart;
  C.defaults.color = TICK;
  C.defaults.font.family = FONT;
  C.defaults.borderColor = GRID;
  C.defaults.plugins.legend.labels.usePointStyle = true;
  C.defaults.plugins.legend.labels.boxWidth = 8;
  C.defaults.plugins.tooltip.backgroundColor = 'rgba(16,16,20,0.96)';
  C.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
  C.defaults.plugins.tooltip.borderWidth = 1;
  C.defaults.plugins.tooltip.padding = 10;
  C.defaults.plugins.tooltip.titleColor = '#fff';
  C.defaults.plugins.tooltip.cornerRadius = 8;
  C.defaults.maintainAspectRatio = false;
  themed = true;
}

const baseScales = () => ({
  x: { grid: { color: GRID, drawBorder: false }, ticks: { color: TICK } },
  y: { grid: { color: GRID, drawBorder: false }, ticks: { color: TICK }, beginAtZero: true },
});

/** Grafico linee progressione punti. data = {labels, datasets:[{label,color,data}]} */
export function lineChart(canvas, data, opts = {}) {
  applyChartTheme();
  return new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: (data.datasets || []).map((d) => ({
        label: d.label,
        data: d.data,
        borderColor: d.color || RED,
        backgroundColor: (d.color || RED) + '22',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: opts.fill ?? false,
      })),
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: opts.legend ?? true, position: 'bottom' } },
      scales: baseScales(),
      ...opts.chart,
    },
  });
}

/** Grafico a barre. data = {labels, values, color?} oppure datasets multipli. */
export function barChart(canvas, data, opts = {}) {
  applyChartTheme();
  const datasets = data.datasets || [{
    label: opts.label || '',
    data: data.values,
    backgroundColor: data.colors || data.color || RED,
    borderRadius: 6,
    maxBarThickness: 46,
  }];
  return new window.Chart(canvas, {
    type: opts.horizontal ? 'bar' : 'bar',
    data: { labels: data.labels, datasets },
    options: {
      indexAxis: opts.horizontal ? 'y' : 'x',
      responsive: true,
      plugins: { legend: { display: opts.legend ?? false, position: 'bottom' } },
      scales: baseScales(),
      ...opts.chart,
    },
  });
}

/** Radar per confronto piloti. datasets:[{label,color,data}], labels[] */
export function radarChart(canvas, data) {
  applyChartTheme();
  return new window.Chart(canvas, {
    type: 'radar',
    data: {
      labels: data.labels,
      datasets: (data.datasets || []).map((d) => ({
        label: d.label,
        data: d.data,
        borderColor: d.color || RED,
        backgroundColor: (d.color || RED) + '33',
        borderWidth: 2,
        pointBackgroundColor: d.color || RED,
      })),
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        r: {
          angleLines: { color: GRID },
          grid: { color: GRID },
          pointLabels: { color: '#c7c7d1', font: { size: 12 } },
          ticks: { color: TICK, backdropColor: 'transparent' },
        },
      },
    },
  });
}

/** Doughnut. data = {labels, values, colors} */
export function doughnutChart(canvas, data, opts = {}) {
  applyChartTheme();
  return new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.values,
        backgroundColor: data.colors || [RED, '#3671C6', '#27F4D2', '#FF8000', '#229971'],
        borderColor: '#0a0a0c',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      cutout: opts.cutout || '62%',
      plugins: { legend: { position: 'right' } },
    },
  });
}

/** Palette per assegnare colori ai piloti in modo stabile. */
export const PALETTE = [
  '#e10600', '#3671C6', '#27F4D2', '#FF8000', '#229971',
  '#0093CC', '#64C4FF', '#6692FF', '#52E252', '#B6BABD',
  '#ffd54a', '#ff7b76',
];
export const colorFor = (i) => PALETTE[i % PALETTE.length];
