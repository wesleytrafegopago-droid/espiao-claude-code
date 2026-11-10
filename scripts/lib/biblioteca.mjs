// Lê a Biblioteca de Anúncios da Meta (sem login) e devolve os anúncios ATIVOS já organizados.
//
// Como funciona: a página da Biblioteca carrega os anúncios em JSON (dentro do HTML e nas respostas
// do GraphQL quando a gente rola). Lemos esse JSON, que traz id, página, data de início, texto,
// botão, destino e mídia. A tela (DOM) só é usada para tirar a captura de cada cartão e como
// plano B se o JSON não vier.
import fs from 'node:fs';
import path from 'node:path';
import { pausaAleatoria, dorme, epochParaISO, diasAteHoje, textoParaISO, dominioDe, log } from './util.mjs';

const BASE = 'https://www.facebook.com/ads/library/';

export function urlBusca(termo, pais = 'BR', { exata = true } = {}) {
  const q = exata ? `"${termo.replace(/"/g, '')}"` : termo;
  const p = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: pais, is_targeted_country: 'false',
    media_type: 'all', q, search_type: exata ? 'keyword_exact_phrase' : 'keyword_unordered',
  });
  return `${BASE}?${p}`;
}
export function urlPagina(pageId, pais = 'BR') {
  const p = new URLSearchParams({
    active_status: 'active', ad_type: 'all', country: pais, is_targeted_country: 'false',
    media_type: 'all', search_type: 'page', view_all_page_id: String(pageId),
  });
  return `${BASE}?${p}`;
}
export function urlAnuncio(id) { return `${BASE}?id=${id}`; }

const FORMATOS = { VIDEO: 'vídeo', IMAGE: 'imagem', CAROUSEL: 'carrossel', MULTI_IMAGES: 'carrossel', DPA: 'catálogo', DCO: 'dinâmico', MULTI_VIDEOS: 'vídeo', DCO_MULTI: 'dinâmico' };
const BOTOES_PT = {
  SHOP_NOW: 'Comprar agora', LEARN_MORE: 'Saiba mais', SIGN_UP: 'Cadastre-se', SEND_MESSAGE: 'Enviar mensagem',
  WHATSAPP_MESSAGE: 'Enviar mensagem no WhatsApp', MESSAGE_PAGE: 'Enviar mensagem', GET_OFFER: 'Obter oferta', ORDER_NOW: 'Peça agora',
  BOOK_TRAVEL: 'Reservar', DOWNLOAD: 'Baixar', INSTALL_MOBILE_APP: 'Instalar agora', WATCH_MORE: 'Assistir mais', CONTACT_US: 'Fale conosco',
  APPLY_NOW: 'Inscreva-se', SUBSCRIBE: 'Assinar', GET_QUOTE: 'Solicitar orçamento', BUY_NOW: 'Comprar', VIEW_INSTAGRAM_PROFILE: 'Ver perfil do Instagram',
  NO_BUTTON: null,
};

// Tira o link de dentro do redirecionador do Facebook e dos rastreadores mais comuns.
export function destinoLimpo(link) {
  if (!link) return null;
  let u = link;
  for (let i = 0; i < 3; i++) {
    try {
      const url = new URL(u);
      const interno = (url.hostname === 'l.facebook.com' && url.searchParams.get('u')) || url.searchParams.get('url');
      if (interno && /^https?:/i.test(decodeURIComponent(interno))) u = decodeURIComponent(interno); else break;
    } catch { break; }
  }
  return u;
}
function tipoDestino(url, botaoTipo) {
  if (!url) return /MESSAGE/.test(botaoTipo || '') ? 'mensagem direta' : 'sem link';
  const d = dominioDe(url) || '';
  if (/(^|\.)wa\.me$|whatsapp\.com$|^api\.whatsapp/.test(d)) return 'WhatsApp';
  if (/(^|\.)instagram\.com$/.test(d)) return 'perfil do Instagram';
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$|^m\.me$/.test(d)) return 'Facebook/Messenger';
  if (/play\.google|apps\.apple|apple\.com\/app/.test(url)) return 'loja de aplicativos';
  if (/^(forms\.gle|docs\.google)/.test(d) || /typeform|tally\.so/.test(d)) return 'formulário';
  return 'site/página';
}

function normalizar(a, hoje = true) {
  const s = a.snapshot || {};
  const cards = (s.cards || []).map((c) => ({
    titulo: c.title && c.title.trim() ? c.title : null, texto: c.body && c.body.trim() ? c.body : null,
    botao: c.cta_text || null, destino: destinoLimpo(c.link_url), imagem: c.original_image_url || c.resized_image_url || null,
    video: c.video_hd_url || c.video_sd_url || null,
  }));
  const img = (s.images || [])[0];
  const vid = (s.videos || [])[0];
  const primeiroCard = cards[0] || {};
  const texto = (s.body && s.body.text) || primeiroCard.texto || '';
  const link = s.link_url || primeiroCard.destino || null;
  const destino = destinoLimpo(link);
  const formato = FORMATOS[s.display_format] || (vid ? 'vídeo' : img ? 'imagem' : (s.display_format || 'desconhecido').toLowerCase());
  const inicio = epochParaISO(a.start_date);
  return {
    id: String(a.ad_archive_id),
    pagina_id: String(a.page_id || s.page_id || ''),
    pagina: a.page_name || s.page_name || null,
    pagina_url: s.page_profile_uri || null,
    pagina_seguidores: s.page_like_count ?? null,
    pagina_categorias: s.page_categories || [],
    inicio,
    dias_no_ar: inicio ? diasAteHoje(inicio) : null,
    texto: texto.replace(/\u2063/g, '').trim(),
    titulo: s.title && s.title.trim() && !/^\{\{/.test(s.title) ? s.title.trim() : null,
    descricao_link: s.link_description && s.link_description.trim() ? s.link_description.trim() : null,
    botao: s.cta_text || (BOTOES_PT[s.cta_type] ?? null),
    botao_tipo: s.cta_type || null,
    destino,
    dominio_destino: destino ? dominioDe(destino) : null,
    legenda_dominio: s.caption || null,
    tipo_destino: tipoDestino(destino, s.cta_type),
    formato,
    formato_original: s.display_format || null,
    dinamico: /\{\{.*\}\}/.test(texto) || ['DPA', 'DCO'].includes(s.display_format),
    qtd_cartoes: cards.length || null,
    cartoes: cards.slice(0, 10),
    versoes: Math.max(1, Number(a.collation_count) || 1),
    grupo_criativo: a.collation_id ? String(a.collation_id) : null,
    plataformas: (a.publisher_platform || []).map((p) => String(p).toLowerCase()),
    midia_imagem: img ? img.original_image_url || img.resized_image_url : primeiroCard.imagem || null,
    midia_video: vid ? vid.video_hd_url || vid.video_sd_url : primeiroCard.video || null,
    midia_miniatura: vid ? vid.video_preview_image_url || null : null,
    url_biblioteca: urlAnuncio(a.ad_archive_id),
    captura: null,
    fonte: 'json',
  };
}

function colherAnuncios(obj, saida, vistos) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.ad_archive_id && obj.snapshot) {
    if (!vistos.has(String(obj.ad_archive_id))) { vistos.add(String(obj.ad_archive_id)); saida.push(obj); }
    return;
  }
  for (const k in obj) colherAnuncios(obj[k], saida, vistos);
}
function acharTotal(obj, prof = 0) {
  if (!obj || typeof obj !== 'object' || prof > 40) return null;
  if (obj.search_results_connection && typeof obj.search_results_connection.count === 'number') return obj.search_results_connection.count;
  for (const k in obj) { const r = acharTotal(obj[k], prof + 1); if (r !== null) return r; }
  return null;
}
function tentaJSON(txt) {
  const r = [];
  const t = txt.replace(/^for \(;;\);/, '').trim();
  try { r.push(JSON.parse(t)); return r; } catch { /* pode vir em várias linhas */ }
  for (const linha of t.split('\n')) {
    const l = linha.trim();
    if (!l || l[0] !== '{') continue;
    try { r.push(JSON.parse(l)); } catch { /* ignora */ }
  }
  return r;
}

// Plano B: lê os cartões direto da tela (português ou inglês).
async function lerCartoesDOM(page) {
  const brutos = await page.evaluate(() => {
    const RE = /Identificação da biblioteca|Library ID/;
    const marcas = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (RE.test(w.currentNode.nodeValue)) marcas.push(w.currentNode.parentElement);
    const conta = (el) => (el.innerText.match(/Identificação da biblioteca|Library ID/g) || []).length;
    return marcas.map((m) => {
      let el = m;
      while (el.parentElement && conta(el.parentElement) === 1) el = el.parentElement;
      return {
        texto: el.innerText,
        links: [...el.querySelectorAll('a[href]')].map((a) => ({ t: (a.innerText || '').trim().slice(0, 80), href: a.href })),
        imagens: [...el.querySelectorAll('img')].map((i) => ({ src: i.src, w: i.naturalWidth })).filter((i) => i.w > 120).map((i) => i.src),
        videos: [...el.querySelectorAll('video')].map((v) => v.currentSrc || v.src || v.poster || null).filter(Boolean),
      };
    });
  });
  return brutos.map((c) => {
    const t = c.texto;
    const id = (t.match(/(?:Identificação da biblioteca|Library ID):\s*(\d+)/) || [])[1];
    const inicioTxt = (t.match(/(?:Veiculação iniciada em|Started running on)\s+([^\n]+)/) || [])[1];
    const inicio = textoParaISO(inicioTxt);
    const versoes = Number((t.match(/(\d+)\s+(?:anúncios?\s+usa[m]?|ads use)\s+(?:esse|this)/i) || [])[1] || 1);
    const linhas = t.split('\n').map((s) => s.trim()).filter((s) => s && s !== '\u200b');
    const iPat = linhas.findIndex((s) => /^(Patrocinado|Sponsored)$/.test(s));
    const pagina = iPat > 0 ? linhas[iPat - 1] : null;
    const corpo = iPat >= 0 ? linhas.slice(iPat + 1) : linhas;
    const link = c.links.map((l) => { try { const u = new URL(l.href); return u.hostname === 'l.facebook.com' ? u.searchParams.get('u') : null; } catch { return null; } }).find(Boolean);
    const pg = c.links.map((l) => l.href).find((h) => /^https:\/\/www\.facebook\.com\/(?!ads\/)[^?]+\/?$/.test(h));
    const video = /\d:\d\d \/ \d:\d\d/.test(t);
    return {
      id, pagina_id: '', pagina, pagina_url: pg || null, pagina_seguidores: null, pagina_categorias: [], inicio, dias_no_ar: inicio ? diasAteHoje(inicio) : null,
      texto: corpo.filter((s) => !/^\d:\d\d \/ \d:\d\d$/.test(s)).slice(0, 12).join('\n'), titulo: null, descricao_link: null, botao: null, botao_tipo: null,
      destino: destinoLimpo(link), dominio_destino: link ? dominioDe(destinoLimpo(link)) : null, legenda_dominio: null, tipo_destino: tipoDestino(destinoLimpo(link), ''),
      formato: video ? 'vídeo' : 'imagem', formato_original: null, dinamico: false, qtd_cartoes: null, cartoes: [], versoes, grupo_criativo: null, plataformas: [],
      midia_imagem: c.imagens[0] || null, midia_video: c.videos[0] || null, midia_miniatura: null, url_biblioteca: id ? urlAnuncio(id) : null, captura: null, fonte: 'dom',
    };
  }).filter((a) => a.id);
}

async function totalNaTela(page) {
  return page.evaluate(() => {
    const m = document.body.innerText.match(/~?\s?[\d.,]+\s*(?:mil\s*)?(?:resultados?|results?)/i);
    return m ? m[0].trim() : null;
  }).catch(() => null);
}

// Tira a foto do cartão do anúncio pelo número da biblioteca.
async function capturarCartao(page, id, arquivo) {
  const handle = await page.evaluateHandle((id) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let marca = null;
    while (w.nextNode()) {
      const v = w.currentNode.nodeValue;
      if (v.includes(id) && /Identificação da biblioteca|Library ID/.test(v)) { marca = w.currentNode.parentElement; break; }
    }
    if (!marca) return null;
    const conta = (el) => (el.innerText.match(/Identificação da biblioteca|Library ID/g) || []).length;
    let el = marca;
    while (el.parentElement && conta(el.parentElement) === 1) el = el.parentElement;
    return el;
  }, id);
  const el = handle.asElement();
  if (!el) return false;
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await dorme(1100);
  await el.screenshot({ path: arquivo });
  return true;
}

// Abre uma URL da Biblioteca, rola e devolve { total, anuncios, ... }.
//  opcoes: max (anúncios), rolagens (máx.), pausa [min,max] em ms, capturas (quantos cartões fotografar),
//          pastaCapturas, prefixoCaptura, forcarDOM
export async function lerBiblioteca(nav, url, opcoes = {}) {
  const { max = 60, rolagens = 25, pausa = [2600, 4200], capturas = 0, pastaCapturas = null, prefixoCaptura = '', forcarDOM = process.env.ESPIAO_FORCAR_DOM === '1' } = opcoes;
  const t0 = Date.now();
  const page = await nav.novaPagina();
  nav.paginasAbertas++;
  const brutos = [];
  const vistos = new Set();
  let total = null;
  let captcha = false;
  const processar = (txt) => {
    for (const j of tentaJSON(txt)) {
      const t = acharTotal(j);
      if (t !== null && total === null) total = t;
      colherAnuncios(j, brutos, vistos);
    }
  };
  page.on('response', async (resp) => {
    try {
      if (!resp.url().includes('/api/graphql')) return;
      const txt = await resp.text();
      if (txt.includes('ad_archive_id') || txt.includes('search_results_connection')) processar(txt);
    } catch { /* resposta abortada */ }
  });
  try {
    let tentativa = 0;
    while (true) {
      tentativa++;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }).catch((e) => log('aviso ao abrir:', e.message));
      await dorme(5000);
      // fecha aviso de cookies, se houver
      await page.evaluate(() => {
        for (const b of document.querySelectorAll('div[role="button"], button')) {
          if (/^(Permitir todos os cookies|Recusar cookies opcionais|Allow all cookies|Decline optional cookies)$/i.test((b.innerText || '').trim())) { b.click(); break; }
        }
      }).catch(() => {});
      const textos = await page.evaluate(() => [...document.querySelectorAll('script[type="application/json"]')].map((s) => s.textContent).filter((t) => t.includes('ad_archive_id') || t.includes('search_results_connection') || t.includes('xfb_ad_library_is_captcha_required')));
      for (const t of textos) {
        if (t.includes('"xfb_ad_library_is_captcha_required":true')) captcha = true;
        processar(t);
      }
      if (!forcarDOM && brutos.length === 0 && total !== 0) {
        const tela = await page.evaluate(() => document.body.innerText).catch(() => '');
        const temCartoes = /Identificação da biblioteca|Library ID/.test(tela);
        const semResultado = /Nenhum anúncio|No ads|0 resultados|0 results|não encontramos|didn.t find/i.test(tela);
        if (!temCartoes && !semResultado && tentativa < 2) {
          log('A Biblioteca não respondeu direito. Espero 30 s e tento de novo.');
          await dorme(30000);
          continue;
        }
      }
      break;
    }

    // rola até ter o suficiente ou até parar de chegar anúncio novo
    let ultimo = -1, parado = 0;
    for (let i = 0; i < rolagens; i++) {
      const n = forcarDOM ? await page.evaluate(() => (document.body.innerText.match(/Identificação da biblioteca|Library ID/g) || []).length) : brutos.length;
      if (n >= max) break;
      if (n === ultimo) { parado++; if (parado >= 2) break; } else parado = 0;
      ultimo = n;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await pausaAleatoria(pausa[0], pausa[1]);
    }
    if (total === null) total = await totalNaTela(page); // texto tipo "~89 resultados"
    const totalNum = typeof total === 'number' ? total : (() => { const m = String(total || '').replace(/\./g, '').match(/\d+/); return m ? Number(m[0]) : null; })();

    let anuncios = brutos.map((a) => normalizar(a));
    let fonte = 'json';
    if (forcarDOM || anuncios.length === 0) {
      anuncios = await lerCartoesDOM(page);
      fonte = 'dom';
      if (anuncios.length === 0 && !captcha && totalNum !== 0) log('Nenhum cartão lido. A Biblioteca pode ter pedido verificação ou mudou de layout.');
    }
    anuncios = anuncios.slice(0, Math.max(max, 1));

    // capturas dos cartões que mais importam (mais dias no ar)
    let fotografados = 0;
    if (capturas > 0 && pastaCapturas && anuncios.length) {
      fs.mkdirSync(pastaCapturas, { recursive: true });
      // um cartão por criativo (mesmo texto na mesma página conta uma vez), dos mais antigos para os mais novos
      const chave = (a) => {
        if (/\{\{/.test(a.texto || '')) return 'dinamico';
        const t = (a.texto || '').toLowerCase().replace(/[^a-z0-9à-ú]+/g, ' ').trim().slice(0, 90);
        return t.length >= 20 ? t : a.id;
      };
      const jaTem = new Set();
      const alvo = [...anuncios]
        .sort((a, b) => (b.dias_no_ar ?? -1) - (a.dias_no_ar ?? -1) || b.versoes - a.versoes)
        .filter((a) => { const k = chave(a); if (jaTem.has(k)) return false; jaTem.add(k); return true; })
        .slice(0, capturas);
      for (const a of alvo) {
        try {
          const arq = path.join(pastaCapturas, `${prefixoCaptura}${a.id}.png`);
          if (await capturarCartao(page, a.id, arq)) { a.captura = path.basename(arq); fotografados++; }
        } catch (e) { log('captura falhou', a.id, e.message); }
      }
    }
    return { url, total: totalNum, total_texto: typeof total === 'string' ? total : totalNum !== null ? `~${totalNum} resultados` : null, lidos: anuncios.length, fonte, captcha, capturas: fotografados, segundos: Math.round((Date.now() - t0) / 1000), anuncios };
  } finally {
    await page.close().catch(() => {});
  }
}

// Procura o id da página (Facebook) a partir da página pública dela: campo associated_page_id.
export async function idDaPaginaPeloFacebook(nav, urlFacebook) {
  const page = await nav.novaPagina();
  nav.paginasAbertas++;
  try {
    await page.goto(urlFacebook, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
    await dorme(3500);
    const html = await page.content();
    const nome = (await page.title().catch(() => '')).replace(/\s*\|\s*Facebook.*$/i, '').trim();
    for (const re of [/"associated_page_id":"(\d{6,})"/, /view_all_page_id=(\d{6,})/, /"pageID":"(\d{6,})"/, /"page_id":"(\d{6,})"/]) {
      const m = html.match(re);
      if (m) return { id: m[1], nome: nome || null };
    }
    return { id: null, nome: nome || null };
  } finally { await page.close().catch(() => {}); }
}
