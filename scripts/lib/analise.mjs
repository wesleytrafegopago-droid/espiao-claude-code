// Classifica os anúncios por dias no ar e resume os padrões (formato, gancho, oferta, botão, destino).
import { limpaLinha } from './util.mjs';

export const LIMITE_VENCEDOR = 90;
export const LIMITE_TESTE = 30;

export function seloDeDias(dias) {
  if (dias === null || dias === undefined) return { chave: 'sem_data', texto: 'sem data' };
  if (dias >= LIMITE_VENCEDOR) return { chave: 'vencedor', texto: 'provável vencedor' };
  if (dias >= LIMITE_TESTE) return { chave: 'teste_longo', texto: 'teste longo' };
  return { chave: 'novo', texto: 'novo' };
}

const mediana = (v) => {
  const a = v.filter((x) => x !== null && x !== undefined).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};
const contar = (arr, fn) => {
  const o = {};
  for (const x of arr) { const k = fn(x); if (k === null || k === undefined || k === '') continue; o[k] = (o[k] || 0) + 1; }
  return o;
};
const ordenar = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);

const normTexto = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9à-ú]+/g, ' ').trim().slice(0, 90);

// Junta tudo: remove repetidos, calcula selo e agrupa o mesmo criativo (mesma página e mesmo texto).
// "principal" é o anúncio mais antigo do grupo. As listas e os padrões usam só os principais,
// para um criativo copiado 50 vezes não ocupar o relatório inteiro.
const PLACEHOLDER = /{{[^}]*}}/;
export const TEXTO_DINAMICO = '(anúncio dinâmico de catálogo: o texto muda por produto)';
export function enriquecer(anuncios) {
  const unicos = new Map();
  for (const a of anuncios) if (a.id && !unicos.has(a.id)) unicos.set(a.id, { ...a });
  const lista = [...unicos.values()];
  for (const a of lista) {
    const dinamico = PLACEHOLDER.test(a.texto || '') || (!a.texto && a.dinamico);
    a.texto_exibicao = dinamico ? TEXTO_DINAMICO : a.texto;
    const t = normTexto(a.texto_exibicao);
    a.chave_grupo = dinamico ? `${a.pagina_id || a.pagina}::dinamico::${a.formato_original || ''}` : t.length >= 20 ? `${a.pagina_id || a.pagina}::${t}` : `id::${a.id}`;
  }
  const grupos = {};
  for (const a of lista) (grupos[a.chave_grupo] = grupos[a.chave_grupo] || []).push(a);
  lista.sort((a, b) => (b.dias_no_ar ?? -1) - (a.dias_no_ar ?? -1) || (b.versoes || 1) - (a.versoes || 1));
  for (const a of lista) {
    const g = grupos[a.chave_grupo];
    a.anuncios_no_grupo = g.length;
    a.variacoes = Math.max(a.versoes || 1, g.length);
    const s = seloDeDias(a.dias_no_ar);
    a.selo = s.chave;
    a.selo_texto = s.texto;
  }
  for (const g of Object.values(grupos)) {
    g.sort((x, y) => (y.dias_no_ar ?? -1) - (x.dias_no_ar ?? -1) || (y.captura ? 1 : 0) - (x.captura ? 1 : 0));
    const v = Math.max(...g.map((x) => x.variacoes));
    g.forEach((x, i) => { x.principal = i === 0; x.variacoes = v; x.escalando = v >= 5; x.ids_do_grupo = g.map((y) => y.id); });
  }
  return lista;
}

const GANCHOS = [
  ['pergunta', /\?/],
  ['número ou lista', /^\s*top\s*\d+|\b\d+\s+(motivos|formas|dicas|passos|raz[õo]es|erros|segredos|benef[ií]cios|maneiras|coisas|sinais)/i],
  ['oferta e preço', /(R\$\s?\d|\d+\s?%|desconto|\boff\b|promo[çc][ãa]o|oferta|frete gr[aá]tis|cupom|black friday|liquida|queima)/i],
  ['urgência', /([úu]ltimas?\s+(unidades|horas|chance)|s[óo] hoje|apenas hoje|termina|acaba|tempo limitado|corre\b|garanta|n[ãa]o perca|restam|[úu]ltimo dia)/i],
  ['prova social', /(clientes|avalia[çc][õo]es|estrelas|⭐|mais vendid|milhares|milh[õo]es|aprovad|recomend|depoimento|resultados? reais?|nota\s?\d|\+\s?\d)/i],
  ['dor ou problema', /(cansad|chega de|pare de|problema|dificuldade|sofr|ainda (sofre|tem|usa)|errado|erro|n[ãa]o consegue|sem\s+\w+\s+nunca)/i],
  ['como fazer ou método', /^(como|descubra|aprenda|veja como|o segredo|o m[ée]todo|passo a passo|conhe[çc]a)/i],
  ['fala direta com a pessoa', /^(voc[êe]|vc|tu|se voc[êe])\b/i],
  ['novidade', /(\bnovo\b|\bnova\b|lan[çc]amento|chegou|acabou de chegar)/i],
];
function primeiraLinha(texto) {
  const l = String(texto || '').split('\n').map((s) => s.trim()).filter((s) => s.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]/gu, '').length > 1);
  return limpaLinha(l[0] || '', 160);
}
export function tipoDeGancho(texto) {
  const p = primeiraLinha(texto);
  if (!p) return 'sem texto';
  for (const [nome, re] of GANCHOS) if (re.test(p)) return nome;
  return 'afirmação ou outro';
}

const OFERTAS = [
  ['frete grátis', /frete gr[aá]tis/i], ['desconto ou % off', /(\d+\s?%|desconto|\boff\b)/i], ['cupom', /cupom|c[óo]digo/i],
  ['parcelamento', /(\d+\s?x\b|sem juros|parcel)/i], ['garantia', /garantia|devolu[çc][ãa]o|reembolso|satisfa[çc][ãa]o/i],
  ['brinde ou bônus', /brinde|b[ôo]nus|ganhe|de presente/i], ['kit ou combo', /\bkit\b|combo|leve \d|compre \d/i],
  ['escassez ou prazo', /([úu]ltimas? unidades|estoque|tempo limitado|s[óo] hoje|termina|[úu]ltimo dia|por tempo)/i],
  ['black friday ou data', /black friday|natal|dia d[ao]s?|11\.?11|cyber|liquida/i], ['teste ou grátis', /gr[aá]tis(?!\s*frete)|teste|experimente/i],
  ['prova social', /(clientes|avalia[çc][õo]es|estrelas|⭐|mais vendid|milhares|milh[õo]es|\d+\s?mil\b)/i],
  ['preço em reais', /R\$\s?\d/],
];

export function resumirPadroes(anuncios) {
  const n = anuncios.length;
  const textoDe = (a) => `${a.titulo || ''} ${a.texto || ''}`;
  const formatos = ordenar(contar(anuncios, (a) => a.formato));
  const botoes = ordenar(contar(anuncios, (a) => a.botao || '(sem botão)'));
  const destinos = ordenar(contar(anuncios, (a) => a.tipo_destino));
  const dominios = ordenar(contar(anuncios, (a) => a.dominio_destino)).slice(0, 8);
  const ganchos = ordenar(contar(anuncios, (a) => tipoDeGancho(a.texto)));
  const ofertas = OFERTAS.map(([nome, re]) => [nome, anuncios.filter((a) => re.test(textoDe(a))).length]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  const plataformas = ordenar(contar(anuncios.flatMap((a) => a.plataformas || []), (p) => p));
  const tamanhos = anuncios.map((a) => (a.texto || '').length).filter((x) => x > 0);
  return {
    n, formatos, botoes, destinos, dominios, ganchos, ofertas, plataformas,
    texto_mediana_caracteres: mediana(tamanhos),
    escalando: anuncios.filter((a) => a.escalando).length,
    selos: { vencedor: anuncios.filter((a) => a.selo === 'vencedor').length, teste_longo: anuncios.filter((a) => a.selo === 'teste_longo').length, novo: anuncios.filter((a) => a.selo === 'novo').length, sem_data: anuncios.filter((a) => a.selo === 'sem_data').length },
    mediana_dias: mediana(anuncios.map((a) => a.dias_no_ar)),
  };
}

export function resumirConcorrente(c, anuncios) {
  const todos = anuncios.filter((a) => a.pagina_id === c.pagina_id);
  const meus = todos.filter((a) => a.principal);
  const p = resumirPadroes(meus);
  return { ...c, lidos: todos.length, criativos: meus.length, ...p, mais_antigo: meus[0] || null };
}

export { pct, mediana, ordenar, contar, primeiraLinha };
