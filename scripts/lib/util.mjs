// Utilidades pequenas: argumentos, datas, texto.
import fs from 'node:fs';
import path from 'node:path';

export const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
export const pausaAleatoria = (min, max) => dorme(min + Math.random() * (max - min));

// Lê "--chave valor valor2 --outra x --sim" e devolve { _: [posicionais], chave: [..], sim: true }
export function lerArgs(argv) {
  const r = { _: [] };
  let atual = null;
  for (const a of argv) {
    if (a.startsWith('--')) {
      atual = a.slice(2);
      r[atual] = [];
    } else if (atual) r[atual].push(a);
    else r._.push(a);
  }
  for (const k of Object.keys(r)) {
    if (k === '_') continue;
    if (r[k].length === 0) r[k] = true;
  }
  return r;
}
export const um = (v, padrao) => (Array.isArray(v) ? v[0] : v === undefined || v === true ? padrao : v);
export const lista = (v) => (Array.isArray(v) ? v : []);

export function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'alvo';
}

export function hojeLocal() {
  const d = new Date();
  return { ano: d.getFullYear(), mes: d.getMonth() + 1, dia: d.getDate() };
}
export function hojeISO() {
  const { ano, mes, dia } = hojeLocal();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
// dias entre uma data AAAA-MM-DD e hoje (calendário, sem fuso)
export function diasAteHoje(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  const { ano, mes, dia } = hojeLocal();
  return Math.max(0, Math.round((Date.UTC(ano, mes - 1, dia) - Date.UTC(a, m - 1, d)) / 864e5));
}
// A Biblioteca mostra as datas no fuso do Pacífico. Converter igual para bater com a tela.
export function epochParaISO(seg) {
  if (!seg) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(seg * 1000));
}
const MESES = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, feb: 2, february: 2, mar: 3, marco: 3, 'março': 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4, mai: 5, maio: 5, may: 5, jun: 6, junho: 6, june: 6, jul: 7, julho: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8, set: 9, setembro: 9, sep: 9, sept: 9, september: 9,
  out: 10, outubro: 10, oct: 10, october: 10, nov: 11, novembro: 11, november: 11, dez: 12, dezembro: 12, dec: 12, december: 12,
};
// "23 de out de 2026" ou "Oct 23, 2026" -> "2026-10-23"
export function textoParaISO(t) {
  if (!t) return null;
  let m = t.match(/(\d{1,2})\s+de\s+([A-Za-zçÇ]+)\.?\s+de\s+(\d{4})/);
  if (m && MESES[m[2].toLowerCase()]) return `${m[3]}-${String(MESES[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MESES[m[1].toLowerCase()]) return `${m[3]}-${String(MESES[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

export function dominioDe(url) {
  try { return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}
// "dux.com.br" -> "dux"
export function marcaDoDominio(dom) {
  if (!dom) return null;
  const partes = dom.replace(/^www\./, '').split('.');
  const sufixos = new Set(['com', 'net', 'org', 'br', 'co', 'io', 'shop', 'store', 'app']);
  while (partes.length > 1 && sufixos.has(partes[partes.length - 1])) partes.pop();
  return partes[partes.length - 1];
}

export function salvarJSON(arquivo, dado) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(dado, null, 2));
}
export function lerJSON(arquivo) { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); }

export function limpaLinha(s, n = 200) {
  const t = String(s || '').replace(/[​⁣‎‏]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}
export function ts() { return new Date().toLocaleTimeString('pt-BR'); }
export function log(...a) { console.error(`[${ts()}]`, ...a); }
