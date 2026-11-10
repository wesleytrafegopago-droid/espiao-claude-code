#!/usr/bin/env node
// espiao: acha concorrentes e lê os anúncios ativos deles na Biblioteca de Anúncios da Meta, sem login.
//
// Comandos (o SKILL.md explica quando usar cada um):
//   site <url>                                  lê o site da pessoa (título, textos, links sociais)
//   buscar --alvo <site> --termos t1 t2 t3      busca na Biblioteca e ranqueia os anunciantes
//   resolver <nome|site|página|id>              acha o id da página do anunciante
//   ler --alvo <x> --paginas id1 id2 ...        lê todos os anúncios ativos de cada página
//   relatorio --alvo <x>                        gera relatorio.md, relatorio.html, anuncios.json e o briefing
//   rodar --alvo <site|nome> [--termos ...]     faz tudo de uma vez (escolha automática dos concorrentes)
import fs from 'node:fs';
import path from 'node:path';
import { lerArgs, um, lista, slug, hojeISO, salvarJSON, lerJSON, dominioDe, marcaDoDominio, pausaAleatoria, log, limpaLinha } from './lib/util.mjs';
import { abrirNavegador } from './lib/navegador.mjs';
import { lerBiblioteca, urlBusca, urlPagina, idDaPaginaPeloFacebook } from './lib/biblioteca.mjs';
import { enriquecer, resumirPadroes } from './lib/analise.mjs';
import { montarRelatorioMD, montarBriefing, montarHTML } from './lib/relatorios.mjs';

const args = lerArgs(process.argv.slice(2));
const comando = args._[0];
const PAIS = String(um(args.pais, 'BR')).toUpperCase();
const LIMITE_PAGINAS = Number(um(args['limite-paginas'], 12));
const MARKETPLACES = /(mercado\s?livre|mercadolibre|amazon|shopee|magazine\s?luiza|magalu|americanas|aliexpress|olx|casas\s?bahia|kabum|shein|temu|carrefour|ponto frio|submarino|netshoes|centauro|dafiti|zattini|leroy)/i;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const agora = () => Date.now();
const seg = (t0) => Math.round((agora() - t0) / 1000);

function dirDoAlvo(alvoTexto) {
  if (um(args.saida)) return path.resolve(um(args.saida));
  const dom = dominioDe(alvoTexto);
  const nome = dom && /\./.test(String(alvoTexto)) ? marcaDoDominio(dom) : alvoTexto;
  return path.resolve(process.cwd(), 'espiao', `${hojeISO()}-${slug(nome)}`);
}
function registrar(dir, passo, dado) {
  const arq = path.join(dir, '_dados', 'execucao.json');
  let atual = [];
  try { atual = lerJSON(arq); } catch { /* primeira vez */ }
  atual.push({ passo, quando: new Date().toISOString(), ...dado });
  salvarJSON(arq, atual);
}
function checaLimite(nav) {
  if (nav.paginasAbertas >= LIMITE_PAGINAS) throw new Error(`Cheguei no limite de ${LIMITE_PAGINAS} páginas abertas da Biblioteca nesta rodada (use --limite-paginas para mudar).`);
}

// ---------------------------------------------------------------- site
async function cmdSite(url) {
  if (!url) throw new Error('Uso: site <url>');
  const u = /^https?:/i.test(url) ? url : `https://${url}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  let html = '';
  let finalUrl = u;
  try {
    const r = await fetch(u, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; espiao-skill/1.0)', 'accept-language': 'pt-BR,pt;q=0.9' } });
    finalUrl = r.url || u;
    html = await r.text();
  } finally { clearTimeout(timer); }
  const pega = (re) => (html.match(re) || [])[1] || null;
  const decod = (s) => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  const meta = (nome) => decod(pega(new RegExp(`<meta[^>]+(?:name|property)=["']${nome}["'][^>]*content=["']([^"']*)["']`, 'i')) || pega(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${nome}["']`, 'i')));
  const titulos = [...html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => limpaLinha(decod(m[2].replace(/<[^>]+>/g, ' ')), 140)).filter((t) => t.length > 2).slice(0, 30);
  const sem = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const texto = limpaLinha(decod(sem), 3500);
  const redes = [...new Set([...html.matchAll(/https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com)\/[A-Za-z0-9_.\-\/]+/g)].map((m) => m[0].replace(/[\/.]$/, '')))].slice(0, 12);
  const dom = dominioDe(finalUrl);
  const saida = {
    url: finalUrl, dominio: dom, marca: marcaDoDominio(dom),
    titulo: limpaLinha(decod(pega(/<title[^>]*>([\s\S]*?)<\/title>/i)), 200) || null,
    descricao: meta('description') || meta('og:description'), og_titulo: meta('og:title'), og_site: meta('og:site_name'),
    palavras_chave: meta('keywords'), titulos, texto,
    redes_sociais: redes,
    aviso: texto.length < 300 ? 'Pouco texto no HTML. O site deve montar o conteúdo com JavaScript. Use o título, a descrição e o que a pessoa contar sobre o negócio.' : null,
  };
  console.log(JSON.stringify(saida, null, 2));
}

// ---------------------------------------------------------------- buscar
async function buscarNaBiblioteca(nav, termos, { site, max, dir }) {
  const dom = site ? dominioDe(site) : null;
  const marca = norm(marcaDoDominio(dom) || '');
  const paginas = new Map();
  const termosInfo = [];
  const todos = [];
  for (let i = 0; i < termos.length; i++) {
    checaLimite(nav);
    const t = termos[i];
    log(`Busca ${i + 1}/${termos.length}: "${t}"`);
    const r = await lerBiblioteca(nav, urlBusca(t, PAIS), { max, rolagens: 6 });
    termosInfo.push({ termo: t, total: r.total, lidos: r.lidos, segundos: r.segundos, fonte: r.fonte });
    log(`  ${r.total_texto || 'sem total'}, lidos ${r.lidos} em ${r.segundos}s`);
    for (const a of r.anuncios) {
      todos.push(a);
      const id = a.pagina_id || `nome:${a.pagina}`;
      if (!paginas.has(id)) paginas.set(id, { pagina_id: a.pagina_id || null, nome: a.pagina, pagina_url: a.pagina_url, seguidores: a.pagina_seguidores, categorias: a.pagina_categorias, anuncios: new Set(), termos: new Set(), dominios: {}, versoes_soma: 0 });
      const p = paginas.get(id);
      if (!p.anuncios.has(a.id)) { p.anuncios.add(a.id); p.versoes_soma += a.versoes || 1; }
      p.termos.add(t);
      if (a.dominio_destino) p.dominios[a.dominio_destino] = (p.dominios[a.dominio_destino] || 0) + 1;
    }
    if (i < termos.length - 1) await pausaAleatoria(5000, 9000);
  }
  const candidatos = [...paginas.values()].map((p) => {
    const doms = Object.entries(p.dominios).sort((a, b) => b[1] - a[1]);
    const propria = !!((dom && p.dominios[dom]) || (marca.length >= 4 && norm(p.nome).includes(marca)));
    return {
      pagina_id: p.pagina_id, nome: p.nome, pagina_url: p.pagina_url, seguidores: p.seguidores, categorias: p.categorias,
      anuncios_na_busca: p.anuncios.size, versoes_somadas: p.versoes_soma, termos: [...p.termos], dominios_destino: doms.slice(0, 4).map(([d, n]) => `${d} (${n})`),
      propria, marketplace: MARKETPLACES.test(p.nome || '') || doms.some(([d]) => MARKETPLACES.test(d)),
    };
  }).sort((a, b) => b.anuncios_na_busca - a.anuncios_na_busca || b.termos.length - a.termos.length);
  return { candidatos, termosInfo, anuncios: todos };
}

function escolherAutomatico(candidatos, n) {
  // Escolha automática: quem aparece em mais termos e leva o clique para um site próprio sobe na fila.
  // (O Claude revisa essa lista com o próprio julgamento antes de ler.)
  const social = /^(instagram|facebook|fb|wa|api\.whatsapp|whatsapp|m|linktr)\.|^fb\.me$|^wa\.me$/;
  const pontos = (c) => c.anuncios_na_busca + 2 * (c.termos.length - 1) + (c.dominios_destino.some((d) => !social.test(d.split(' ')[0])) ? 2 : 0);
  const elegiveis = candidatos.filter((c) => c.pagina_id && !c.propria && !c.marketplace);
  return [...elegiveis].sort((a, b) => pontos(b) - pontos(a)).slice(0, n);
}

function mostrarCandidatos(c) {
  console.log('\nRanking de anunciantes na busca (anúncios ativos que apareceram):');
  c.slice(0, 15).forEach((x, i) => console.log(`${String(i + 1).padStart(2)}. ${x.nome} | id ${x.pagina_id} | ${x.anuncios_na_busca} anúncios | ${x.termos.length} termos | ${x.dominios_destino.slice(0, 2).join(', ') || 'sem destino'}${x.propria ? ' | PRÓPRIA' : ''}${x.marketplace ? ' | marketplace' : ''}`));
}

async function cmdBuscar() {
  const termos = lista(args.termos).map((t) => t.trim()).filter(Boolean);
  if (!termos.length) throw new Error('Uso: buscar --alvo <site> --termos "termo 1" "termo 2" "termo 3"');
  const alvo = um(args.alvo) || um(args.site);
  const dir = dirDoAlvo(alvo || termos[0]);
  const nav = await abrirNavegador();
  const t0 = agora();
  try {
    const r = await buscarNaBiblioteca(nav, termos, { site: um(args.site) || alvo, max: Number(um(args.max, 40)), dir });
    salvarJSON(path.join(dir, '_dados', 'candidatos.json'), { alvo, site: um(args.site) || alvo, pais: PAIS, termos: r.termosInfo, candidatos: r.candidatos });
    registrar(dir, 'buscar', { termos: termos.length, segundos: seg(t0), paginas_abertas: nav.paginasAbertas, anuncios_vistos: r.anuncios.length });
    mostrarCandidatos(r.candidatos);
    console.log(`\nSugestão automática (sem própria e sem marketplace): ${escolherAutomatico(r.candidatos, 5).map((c) => `${c.nome} (${c.pagina_id})`).join('; ') || 'nenhuma'}`);
    console.log(`Pasta: ${dir}\nPáginas da Biblioteca abertas: ${nav.paginasAbertas}. Tempo: ${seg(t0)}s.`);
  } finally { await nav.fechar(); }
}

// ---------------------------------------------------------------- resolver
async function resolverAlvo(nav, alvo, dirParaSalvar) {
  const t = String(alvo).trim();
  if (/^\d{6,}$/.test(t)) return { id: t, nome: null, metodo: 'id informado' };
  let m = t.match(/view_all_page_id=(\d{6,})/);
  if (m) return { id: m[1], nome: null, metodo: 'link da Biblioteca' };
  if (/facebook\.com\/ads\/library\/?\?.*\bid=\d+/.test(t) || /facebook\.com\//i.test(t)) {
    checaLimite(nav);
    const r = await idDaPaginaPeloFacebook(nav, /^https?:/i.test(t) ? t : `https://${t}`);
    if (r.id) return { id: r.id, nome: r.nome, metodo: 'HTML da página do Facebook' };
    throw new Error(`Não achei o id da página em ${t}. Abra a Biblioteca, clique no nome do anunciante e use o número que aparece em view_all_page_id.`);
  }
  // nome, site ou perfil do Instagram: procura na Biblioteca
  let termo = t;
  let dom = null;
  if (/instagram\.com\//i.test(t)) termo = t.split('instagram.com/')[1].split(/[/?]/)[0];
  else if (/\./.test(t) && !/\s/.test(t)) { dom = dominioDe(t); termo = marcaDoDominio(dom); }
  checaLimite(nav);
  const r = await lerBiblioteca(nav, urlBusca(termo, PAIS), { max: 40, rolagens: 3 });
  const porPagina = new Map();
  for (const a of r.anuncios) {
    const k = a.pagina_id;
    if (!k) continue;
    if (!porPagina.has(k)) porPagina.set(k, { id: k, nome: a.pagina, n: 0, doms: {} });
    const p = porPagina.get(k);
    p.n++;
    if (a.dominio_destino) p.doms[a.dominio_destino] = (p.doms[a.dominio_destino] || 0) + 1;
  }
  const alvoN = norm(termo);
  const pontuados = [...porPagina.values()].map((p) => {
    const nn = norm(p.nome);
    let pts = 0;
    if (dom && p.doms[dom]) pts += 6;
    if (nn === alvoN) pts += 4; else if (nn.startsWith(alvoN)) pts += 3; else if (nn.includes(alvoN)) pts += 2;
    return { ...p, pts };
  }).filter((p) => p.pts > 0).sort((a, b) => b.pts - a.pts || b.n - a.n);
  if (!pontuados.length) throw new Error(`Não achei uma página chamada "${t}" entre os anúncios ativos de "${termo}". Dê o link da página do Facebook ou o id.`);
  const [a, b] = pontuados;
  return { id: a.id, nome: a.nome, metodo: dom ? 'domínio nos anúncios' : 'nome na busca', ambiguo: !!(b && b.pts === a.pts), alternativas: pontuados.slice(1, 4).map((p) => `${p.nome} (${p.id})`) };
}

async function cmdResolver() {
  const alvo = args._[1];
  if (!alvo) throw new Error('Uso: resolver <nome | site | link da página | id>');
  const nav = await abrirNavegador();
  try {
    const r = await resolverAlvo(nav, alvo);
    console.log(JSON.stringify(r, null, 2));
  } finally { await nav.fechar(); }
}

// ---------------------------------------------------------------- ler
async function lerPaginas(nav, paginas, dir, { max, capturas }) {
  const saida = [];
  for (let i = 0; i < paginas.length; i++) {
    checaLimite(nav);
    const p = paginas[i];
    log(`Lendo ${i + 1}/${paginas.length}: ${p.nome || ''} (id ${p.id})`);
    const r = await lerBiblioteca(nav, urlPagina(p.id, PAIS), { max, capturas, pastaCapturas: path.join(dir, 'capturas'), rolagens: 30 });
    const nome = p.nome || (r.anuncios[0] && r.anuncios[0].pagina) || `página ${p.id}`;
    for (const a of r.anuncios) { if (!a.pagina_id) a.pagina_id = String(p.id); }
    const dado = { pagina_id: String(p.id), nome, pagina_url: (r.anuncios[0] && r.anuncios[0].pagina_url) || null, url_biblioteca: r.url, total: r.total, total_texto: r.total_texto, lidos: r.lidos, fonte: r.fonte, capturas: r.capturas, segundos: r.segundos, lido_em: new Date().toISOString(), anuncios: r.anuncios };
    salvarJSON(path.join(dir, '_dados', `pagina-${p.id}.json`), dado);
    log(`  ${nome}: ${r.total_texto || 'sem total'}, lidos ${r.lidos}, capturas ${r.capturas}, ${r.segundos}s`);
    saida.push(dado);
    if (i < paginas.length - 1) await pausaAleatoria(6000, 10000);
  }
  return saida;
}

async function cmdLer() {
  const alvo = um(args.alvo);
  const ids = lista(args.paginas);
  if (!ids.length) throw new Error('Uso: ler --alvo <x> --paginas <id|nome|link> [mais ids]');
  const dir = dirDoAlvo(alvo || ids[0]);
  const nav = await abrirNavegador();
  const t0 = agora();
  try {
    const paginas = [];
    for (const x of ids) {
      const [idTxt, nomeTxt] = String(x).includes('::') ? String(x).split('::') : [x, null];
      const r = await resolverAlvo(nav, idTxt, dir);
      paginas.push({ id: r.id, nome: nomeTxt || r.nome });
    }
    const lidos = await lerPaginas(nav, paginas, dir, { max: Number(um(args.max, 60)), capturas: Number(um(args.capturas, paginas.length > 1 ? 6 : 10)) });
    registrar(dir, 'ler', { paginas: lidos.length, anuncios: lidos.reduce((s, x) => s + x.lidos, 0), segundos: seg(t0), paginas_abertas: nav.paginasAbertas });
    console.log(`Lidos ${lidos.reduce((s, x) => s + x.lidos, 0)} anúncios de ${lidos.length} páginas em ${seg(t0)}s. Páginas da Biblioteca abertas: ${nav.paginasAbertas}. Pasta: ${dir}`);
  } finally { await nav.fechar(); }
}

// ---------------------------------------------------------------- relatório
function gerarSaidas(dir, { alvo, site }) {
  const dados = path.join(dir, '_dados');
  const arqs = fs.existsSync(dados) ? fs.readdirSync(dados).filter((f) => /^pagina-\d+\.json$/.test(f)) : [];
  if (!arqs.length) throw new Error(`Nenhuma página lida em ${dados}. Rode "ler" antes.`);
  const paginas = arqs.map((f) => lerJSON(path.join(dados, f)));
  const anuncios = enriquecer(paginas.flatMap((p) => p.anuncios));
  const concorrentes = paginas.map((p) => ({ pagina_id: p.pagina_id, nome: p.nome, pagina_url: p.pagina_url, total: p.total, total_texto: p.total_texto, lidos: p.lidos, url_biblioteca: p.url_biblioteca, fonte: p.fonte }))
    .sort((a, b) => anuncios.filter((x) => x.pagina_id === b.pagina_id).length - anuncios.filter((x) => x.pagina_id === a.pagina_id).length);
  let termos = [];
  try { termos = lerJSON(path.join(dados, 'candidatos.json')).termos.map((t) => t.termo); } catch { /* leitura direta de concorrente */ }
  const nomeAlvo = site ? (marcaDoDominio(dominioDe(site)) && /\./.test(site) ? dominioDe(site) : alvo) : (alvo || concorrentes[0].nome);
  const meta = { alvo_nome: nomeAlvo, site: site && /\./.test(site) ? dominioDe(site) : null, pais: PAIS, data: hojeISO(), termos };
  const ctx = { meta, anuncios, concorrentes };
  fs.writeFileSync(path.join(dir, 'relatorio.md'), montarRelatorioMD(ctx));
  fs.writeFileSync(path.join(dir, 'relatorio.html'), montarHTML(ctx));
  fs.writeFileSync(path.join(dir, 'briefing-para-ads-create.md'), montarBriefing(ctx));
  salvarJSON(path.join(dir, 'anuncios.json'), {
    gerado_em: new Date().toISOString(), data: meta.data, alvo: meta.alvo_nome, site: meta.site, pais: PAIS, termos,
    regras: { provavel_vencedor_dias: 90, teste_longo_dias: 30 }, concorrentes, total_anuncios: anuncios.length, criativos_distintos: anuncios.filter((a) => a.principal).length,
    resumo_criativos_distintos: resumirPadroes(anuncios.filter((a) => a.principal)), anuncios,
  });
  return { anuncios, concorrentes, meta };
}
async function cmdRelatorio() {
  const alvo = um(args.alvo);
  const dir = dirDoAlvo(alvo || '');
  const r = gerarSaidas(dir, { alvo, site: um(args.site) });
  console.log(`Relatório pronto em ${dir}: ${r.anuncios.length} anúncios, ${r.concorrentes.length} concorrentes.`);
  top5(r.anuncios);
}
function top5(anuncios) {
  console.log('\nOs 5 com mais dias no ar:');
  anuncios.filter((a) => a.principal && a.dias_no_ar !== null).slice(0, 5).forEach((a, i) => console.log(`${i + 1}. ${a.dias_no_ar} dias | ${a.pagina} | ${a.formato} | ${a.botao || 'sem botão'} | ${a.variacoes} ${a.variacoes === 1 ? 'versão' : 'versões'} | ${a.id} | ${limpaLinha(a.texto_exibicao, 90)}`));
}

// ---------------------------------------------------------------- rodar (tudo)
async function cmdRodar() {
  const alvo = um(args.alvo) || args._[1];
  if (!alvo) throw new Error('Uso: rodar --alvo <site ou nome do concorrente> [--termos "a" "b" "c"] [--concorrentes id ...]');
  const ehSite = /\.[a-z]{2,}/i.test(alvo) && !/facebook\.com|instagram\.com/i.test(alvo) && !/\s/.test(alvo) && !args.direto;
  const dir = dirDoAlvo(alvo);
  const nav = await abrirNavegador();
  const t0 = agora();
  try {
    let escolhidos;
    if (lista(args.concorrentes).length) {
      escolhidos = [];
      for (const x of lista(args.concorrentes)) { const r = await resolverAlvo(nav, x); escolhidos.push({ id: r.id, nome: r.nome }); }
    } else if (ehSite && !args.direto) {
      const termos = lista(args.termos).map((t) => t.trim()).filter(Boolean);
      if (!termos.length) throw new Error('Para rodar a partir de um site, passe --termos "..." (3 a 6 termos que descrevem o que o site vende). O Claude monta esses termos lendo o site com o comando "site".');
      const b = await buscarNaBiblioteca(nav, termos, { site: alvo, max: Number(um(args.max, 40)), dir });
      salvarJSON(path.join(dir, '_dados', 'candidatos.json'), { alvo, site: alvo, pais: PAIS, termos: b.termosInfo, candidatos: b.candidatos });
      mostrarCandidatos(b.candidatos);
      escolhidos = escolherAutomatico(b.candidatos, Number(um(args['max-concorrentes'], 5))).map((c) => ({ id: c.pagina_id, nome: c.nome }));
      if (!escolhidos.length) throw new Error('A busca não achou concorrentes. Tente outros termos.');
      await pausaAleatoria(5000, 8000);
    } else {
      const r = await resolverAlvo(nav, alvo);
      log(`Concorrente: ${r.nome || ''} (id ${r.id}) por ${r.metodo}${r.ambiguo ? '. ATENÇÃO: nome ambíguo, alternativas: ' + r.alternativas.join('; ') : ''}`);
      escolhidos = [{ id: r.id, nome: r.nome }];
    }
    const lidos = await lerPaginas(nav, escolhidos, dir, { max: Number(um(args.max, 60)), capturas: Number(um(args.capturas, escolhidos.length > 1 ? 6 : 10)) });
    const r = gerarSaidas(dir, { alvo, site: ehSite ? alvo : undefined });
    registrar(dir, 'rodar', { paginas: lidos.length, anuncios: r.anuncios.length, segundos: seg(t0), paginas_abertas: nav.paginasAbertas });
    console.log(`\nPronto em ${seg(t0)}s. ${r.anuncios.length} anúncios de ${r.concorrentes.length} concorrentes. Páginas da Biblioteca abertas: ${nav.paginasAbertas}.\nPasta: ${dir}`);
    top5(r.anuncios);
  } finally { await nav.fechar(); }
}

// ---------------------------------------------------------------- main
const AJUDA = `espiao: lê a Biblioteca de Anúncios da Meta sem login.
  node scripts/espiao.mjs site <url>
  node scripts/espiao.mjs buscar --alvo <site> --termos "t1" "t2" "t3" [--pais BR] [--max 40]
  node scripts/espiao.mjs resolver <nome | site | link da página | id>
  node scripts/espiao.mjs ler --alvo <x> --paginas <id|nome|link> ... [--max 60] [--capturas 6]
  node scripts/espiao.mjs relatorio --alvo <x> [--site <site>]
  node scripts/espiao.mjs rodar --alvo <site | nome> [--termos "t1" "t2"] [--concorrentes <id|nome> ...]
Opções gerais: --pais BR, --saida <pasta>, --limite-paginas 12`;

try {
  if (comando === 'site') await cmdSite(args._[1]);
  else if (comando === 'buscar') await cmdBuscar();
  else if (comando === 'resolver') await cmdResolver();
  else if (comando === 'ler') await cmdLer();
  else if (comando === 'relatorio') await cmdRelatorio();
  else if (comando === 'rodar') await cmdRodar();
  else { console.log(AJUDA); process.exit(comando ? 1 : 0); }
} catch (e) {
  console.error(`Erro: ${e.message}`);
  process.exit(1);
}
