// Escreve relatorio.md, relatorio.html e briefing-para-ads-create.md a partir dos anúncios lidos.
import { limpaLinha } from './util.mjs';
import { LIMITE_VENCEDOR, LIMITE_TESTE, resumirPadroes, resumirConcorrente, primeiraLinha, tipoDeGancho, pct } from './analise.mjs';

// Nos textos de anúncio de terceiros, troca travessão por vírgula (o texto original fica no anuncios.json).
const semTravessao = (s) => String(s || '').replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-');
const cel = (s, n = 140) => semTravessao(limpaLinha(s, n)).replace(/\|/g, '/');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : 'sem data');
const listaDe = (pares, n = 6, total = null) => pares.slice(0, n).map(([k, v]) => `${k} (${v}${total ? `, ${pct(v, total)}%` : ''})`).join(', ') || 'nenhum';
const rotuloVersoes = (a) => (a.variacoes > 1 ? `${a.variacoes} versões${a.escalando ? ' (escalando)' : ''}` : '1');

export function montarRelatorioMD({ meta, anuncios, concorrentes }) {
  const uni = anuncios.filter((a) => a.principal);
  const top10 = uni.filter((a) => a.dias_no_ar !== null).slice(0, 10);
  const geral = resumirPadroes(uni);
  const L = [];
  L.push(`# Espião de anúncios: ${meta.alvo_nome}`);
  L.push('');
  L.push(`Gerado em ${dataBR(meta.data)} (dias no ar contados até essa data). Biblioteca de Anúncios da Meta, país ${meta.pais}, só anúncios ativos, lida sem login.`);
  L.push('');
  L.push('## Resumo');
  L.push('');
  L.push(`- Concorrentes lidos: ${concorrentes.length}${meta.site ? ` (a partir do site ${meta.site})` : ''}`);
  L.push(`- Anúncios ativos lidos: ${anuncios.length}, que são ${uni.length} criativos distintos (mesma página e mesmo texto contam uma vez nas listas e nos padrões)`);
  L.push(`- Criativos provável vencedor (${LIMITE_VENCEDOR} dias ou mais): ${geral.selos.vencedor}`);
  L.push(`- Criativos em teste longo (${LIMITE_TESTE} a ${LIMITE_VENCEDOR - 1} dias): ${geral.selos.teste_longo}`);
  L.push(`- Criativos novos (menos de ${LIMITE_TESTE} dias): ${geral.selos.novo}`);
  if (geral.selos.sem_data) L.push(`- Sem data de início legível: ${geral.selos.sem_data}`);
  L.push(`- Criativos com 5 versões ou mais (sinal de escala): ${geral.escalando}`);
  L.push(`- Mediana de dias no ar: ${geral.mediana_dias ?? 'n/d'}`);
  if (meta.termos && meta.termos.length) L.push(`- Termos buscados: ${meta.termos.map((t) => `"${t}"`).join(', ')}`);
  L.push('');
  L.push('## Top 10 há mais tempo no ar');
  L.push('');
  L.push('| # | Dias | Selo | Concorrente | Texto | Botão | Destino | Versões | Formato | ID |');
  L.push('|---|---:|---|---|---|---|---|---|---|---|');
  top10.forEach((a, i) => {
    L.push(`| ${i + 1} | ${a.dias_no_ar} | ${a.selo_texto} | ${cel(a.pagina, 40)} | ${cel(a.texto_exibicao || a.titulo, 150)} | ${cel(a.botao || 'sem botão', 30)} | ${cel(a.dominio_destino || a.tipo_destino, 40)} | ${rotuloVersoes(a)} | ${a.formato} | ${a.id} |`);
  });
  L.push('');
  L.push('Cada ID abre direto na Biblioteca: `https://www.facebook.com/ads/library/?id=<ID>`.');
  L.push('');
  L.push('## Por concorrente');
  for (const c of concorrentes) {
    const r = resumirConcorrente(c, anuncios);
    L.push('');
    L.push(`### ${c.nome}`);
    L.push('');
    L.push(`- Página: ${c.pagina_url || `id ${c.pagina_id}`} (id ${c.pagina_id})`);
    L.push(`- Anúncios ativos na Biblioteca: ${c.total ?? 'n/d'}. Lidos: ${r.lidos}, que são ${r.criativos} criativos distintos.${c.total && r.lidos < c.total ? ` Leitura parcial: ${r.lidos} de ${c.total}, o teto por página limita o que aparece (use --max para ler mais).` : ''}`);
    L.push(`- Criativos provável vencedor: ${r.selos.vencedor}, teste longo: ${r.selos.teste_longo}, novo: ${r.selos.novo}. Mediana de dias no ar: ${r.mediana_dias ?? 'n/d'}`);
    L.push(`- Formatos: ${listaDe(r.formatos, 4, r.n)}`);
    L.push(`- Botões: ${listaDe(r.botoes, 4)}. Destinos: ${listaDe(r.dominios, 3)}`);
    if (r.escalando) L.push(`- Criativos escalando (5 versões ou mais): ${r.escalando}`);
    const tops = uni.filter((a) => a.pagina_id === c.pagina_id && a.dias_no_ar !== null).slice(0, 5);
    if (tops.length) {
      L.push('');
      L.push('| Dias | Selo | Texto | Botão | Destino | Versões | Formato | ID |');
      L.push('|---:|---|---|---|---|---|---|---|');
      for (const a of tops) L.push(`| ${a.dias_no_ar} | ${a.selo_texto} | ${cel(a.texto_exibicao || a.titulo, 150)} | ${cel(a.botao || 'sem botão', 30)} | ${cel(a.dominio_destino || a.tipo_destino, 40)} | ${rotuloVersoes(a)} | ${a.formato} | ${a.id} |`);
    }
  }
  L.push('');
  L.push('## Padrões do mercado');
  L.push('');
  const longos = uni.filter((a) => a.dias_no_ar !== null && a.dias_no_ar >= LIMITE_TESTE);
  const novos = uni.filter((a) => a.dias_no_ar !== null && a.dias_no_ar < LIMITE_TESTE);
  const pl = resumirPadroes(longos);
  const pn = resumirPadroes(novos);
  L.push(`Base: ${uni.length} criativos distintos (de ${anuncios.length} anúncios), ${longos.length} com ${LIMITE_TESTE} dias ou mais, ${novos.length} novos.`);
  L.push('');
  L.push(`- Formato, todos: ${listaDe(geral.formatos, 4, geral.n)}`);
  L.push(`- Formato, quem roda há ${LIMITE_TESTE} dias ou mais: ${longos.length ? listaDe(pl.formatos, 4, pl.n) : 'sem dados'}`);
  L.push(`- Formato, anúncios novos: ${novos.length ? listaDe(pn.formatos, 4, pn.n) : 'sem dados'}`);
  L.push(`- Tipo de gancho (primeira linha do texto), todos: ${listaDe(geral.ganchos, 6, geral.n)}`);
  L.push(`- Tipo de gancho, quem roda há ${LIMITE_TESTE} dias ou mais: ${longos.length ? listaDe(pl.ganchos, 6, pl.n) : 'sem dados'}`);
  L.push(`- Oferta e prova usadas no texto, todos: ${listaDe(geral.ofertas, 8, geral.n)}`);
  L.push(`- Oferta e prova, quem roda há ${LIMITE_TESTE} dias ou mais: ${longos.length ? listaDe(pl.ofertas, 8, pl.n) : 'sem dados'}`);
  L.push(`- Botão (CTA), todos: ${listaDe(geral.botoes, 5, geral.n)}`);
  L.push(`- Destino do clique: ${listaDe(geral.destinos, 5, geral.n)}. Domínios mais usados: ${listaDe(geral.dominios, 5)}`);
  L.push(`- Plataformas: ${listaDe(geral.plataformas, 4)}`);
  L.push(`- Tamanho típico do texto: ${geral.texto_mediana_caracteres ?? 'n/d'} caracteres (mediana)`);
  L.push('');
  L.push('## Como ler este relatório');
  L.push('');
  L.push('- Dias no ar é a data de início do anúncio ativo até a data do relatório. É um sinal de que a conta continua pagando por ele, não é prova de venda nem de lucro.');
  L.push('- A Biblioteca só mostra anúncios ativos. Anúncio que a empresa pausou não aparece, então a leitura é do que está rodando agora.');
  L.push('- Quando a página tem mais anúncios que o teto lido, a lista é parcial e pode faltar algum dos mais antigos.');
  L.push('- Use como referência de estrutura e ângulo. Não copie texto nem criativo de terceiros.');
  L.push('');
  return L.join('\n');
}

export function montarBriefing({ meta, anuncios, concorrentes }) {
  const uni = anuncios.filter((a) => a.principal);
  const base = uni.filter((a) => a.dias_no_ar !== null);
  let ref = base.filter((a) => a.dias_no_ar >= LIMITE_TESTE);
  let nota = `anúncios com ${LIMITE_TESTE} dias ou mais`;
  if (ref.length < 8) { ref = base.slice(0, Math.min(base.length, Math.max(8, Math.ceil(base.length / 3)))); nota = 'os anúncios mais antigos lidos (poucos passaram de 30 dias)'; }
  const pr = resumirPadroes(ref);
  const pg = resumirPadroes(uni);
  const L = [];
  L.push(`# Briefing criativo para o /ads create: ${meta.alvo_nome}`);
  L.push('');
  L.push(`Fonte: Biblioteca de Anúncios da Meta (${meta.pais}), lida em ${dataBR(meta.data)}. ${anuncios.length} anúncios ativos de ${concorrentes.length} concorrentes (${concorrentes.map((c) => c.nome).join(', ')}).`);
  L.push(`A leitura abaixo usa ${nota} (${ref.length} criativos distintos) como "o que o mercado continua pagando".`);
  L.push('');
  L.push('## 1. O que o mercado mantém no ar');
  L.push('');
  L.push(`- Formato dominante: ${listaDe(pr.formatos, 3, pr.n)}`);
  L.push(`- Botão mais usado: ${listaDe(pr.botoes, 3, pr.n)}`);
  L.push(`- Para onde levam o clique: ${listaDe(pr.destinos, 3, pr.n)}`);
  L.push(`- Tamanho típico do texto: ${pr.texto_mediana_caracteres ?? 'n/d'} caracteres`);
  L.push(`- Criativos com muitas versões (escalando): ${pg.escalando}`);
  L.push('');
  L.push('## 2. Ganchos reais dos anúncios mais antigos');
  L.push('');
  L.push('Referência de estrutura e ângulo. Reescreva com a sua oferta e a sua voz, sem copiar a frase.');
  L.push('');
  const usados = new Set();
  let k = 0;
  for (const a of ref) {
    const g = a.texto_exibicao && a.texto_exibicao.startsWith('(anúncio dinâmico') ? '' : primeiraLinha(a.texto);
    if (!g || usados.has(g.toLowerCase())) continue;
    usados.add(g.toLowerCase());
    L.push(`${++k}. "${semTravessao(g)}" (${a.pagina}, ${a.dias_no_ar} dias, ${a.formato}, tipo: ${tipoDeGancho(a.texto)}, botão: ${a.botao || 'sem botão'})`);
    if (k >= 10) break;
  }
  if (!k) L.push('Sem texto legível nos anúncios lidos.');
  L.push('');
  L.push('## 3. Ofertas e provas que aparecem nos que duram');
  L.push('');
  L.push(`- ${listaDe(pr.ofertas, 8, pr.n)}`);
  L.push(`- Tipos de gancho mais comuns: ${listaDe(pr.ganchos, 5, pr.n)}`);
  L.push('');
  L.push('## 4. Possíveis lacunas para testar');
  L.push('');
  const todosFormatos = ['vídeo', 'imagem', 'carrossel'];
  const raros = todosFormatos.filter((f) => pct((pr.formatos.find(([k2]) => k2 === f) || [0, 0])[1], pr.n) < 15);
  if (raros.length) L.push(`- Formatos pouco usados pelos concorrentes que duram: ${raros.join(', ')}. Vale um teste.`);
  const tiposUsados = new Set(pr.ganchos.map(([k2]) => k2));
  const ausentes = ['pergunta', 'prova social', 'dor ou problema', 'número ou lista', 'como fazer ou método'].filter((t) => !tiposUsados.has(t));
  if (ausentes.length) L.push(`- Tipos de gancho que nenhum anúncio longo usa: ${ausentes.join(', ')}.`);
  const ofertasAusentes = ['garantia', 'brinde ou bônus', 'kit ou combo', 'prova social'].filter((o) => !pr.ofertas.some(([k2]) => k2 === o));
  if (ofertasAusentes.length) L.push(`- Elementos de oferta que não aparecem nos anúncios longos: ${ofertasAusentes.join(', ')}.`);
  if (!raros.length && !ausentes.length && !ofertasAusentes.length) L.push('- Os concorrentes cobrem quase todos os formatos e ganchos. A diferença vai estar na oferta e no mecanismo, não no formato.');
  L.push('');
  L.push('## 5. Pedido pronto para o /ads create');
  L.push('');
  L.push('Cole isto depois de rodar `/ads setup` (e `/ads dna` com o seu site). Se a claude-ads foi instalada como plugin, os comandos começam com `/claude-ads:ads`.');
  L.push('');
  L.push('```text');
  L.push('/ads create');
  L.push(`Use o arquivo briefing-para-ads-create.md e o relatorio.md desta pasta como referência de mercado (${meta.alvo_nome}).`);
  L.push(`Crie 5 conceitos de anúncio para Meta Ads com a MINHA oferta. Priorize o formato ${pr.formatos[0] ? pr.formatos[0][0] : 'vídeo'} e o botão ${pr.botoes[0] ? pr.botoes[0][0] : 'Saiba mais'}.`);
  L.push('Para cada conceito entregue: gancho, texto principal, título, botão, roteiro ou descrição da imagem e o que está sendo testado.');
  L.push('Use os ganchos do briefing só como estrutura. Não copie frases nem criativos dos concorrentes.');
  L.push('```');
  L.push('');
  L.push('## 6. Cuidados');
  L.push('');
  L.push('- Dias no ar é sinal, não resultado. Valide com o seu próprio teste.');
  L.push('- Não repita promessa que a política da Meta restringe (saúde, renda, antes e depois).');
  L.push('- Não use imagem, marca ou depoimento de outra empresa.');
  L.push('');
  return L.join('\n');
}

export function montarHTML({ meta, anuncios, concorrentes }) {
  const geral = resumirPadroes(anuncios.filter((a) => a.principal));
  const cartoes = anuncios.filter((a) => a.principal).map((a) => {
    const selo = a.selo;
    const img = a.captura ? `<img loading="lazy" src="capturas/${esc(a.captura)}" alt="Captura do anúncio ${esc(a.id)}">` : '<div class="semfoto">sem captura</div>';
    const txt = semTravessao(limpaLinha(a.texto_exibicao || a.titulo || '', 320));
    return `<article class="cartao ${selo}" data-selo="${selo}" data-pagina="${esc(a.pagina_id)}">
  <div class="topo"><span class="dias">${a.dias_no_ar ?? '?'}<small> dias</small></span><span class="selo ${selo}">${esc(a.selo_texto)}</span>${a.escalando ? '<span class="selo esc">escalando</span>' : ''}</div>
  ${img}
  <div class="corpo">
    <h3>${esc(a.pagina)}</h3>
    <p class="txt">${esc(txt)}</p>
    <ul>
      <li><b>Início:</b> ${dataBR(a.inicio)}</li>
      <li><b>Botão:</b> ${esc(a.botao || 'sem botão')}</li>
      <li><b>Destino:</b> ${esc(a.dominio_destino || a.tipo_destino)}</li>
      <li><b>Formato:</b> ${esc(a.formato)}, <b>versões:</b> ${a.variacoes}${a.anuncios_no_grupo > 1 ? ` (${a.anuncios_no_grupo} anúncios com o mesmo texto)` : ''}</li>
    </ul>
    <a href="${esc(a.url_biblioteca)}" target="_blank" rel="noopener">Abrir na Biblioteca (${esc(a.id)})</a>
  </div>
</article>`;
  }).join('\n');
  const chipsConc = concorrentes.map((c) => `<button data-filtro-pagina="${esc(c.pagina_id)}">${esc(c.nome)}</button>`).join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Espião: ${esc(meta.alvo_nome)}</title>
<style>
:root{--bg:#f6f4ef;--card:#fff;--tx:#1d1b18;--mu:#6b655c;--bd:#e3ded4;--ver:#1f7a3d;--tes:#a8650a;--nov:#5b6470;--esc:#7a2fb3}
@media (prefers-color-scheme:dark){:root{--bg:#15130f;--card:#201d18;--tx:#f2eee6;--mu:#a59d90;--bd:#352f27;--ver:#4cc27a;--tes:#e0a04a;--nov:#9aa4b2;--esc:#c394f0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:28px 16px 8px;max-width:1280px;margin:0 auto}h1{margin:0 0 6px;font-size:26px}.sub{color:var(--mu);margin:0 0 16px}
.num{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 14px}.num div{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:10px 14px}.num b{display:block;font-size:22px}
.filtros{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.filtros button{border:1px solid var(--bd);background:var(--card);color:var(--tx);border-radius:999px;padding:6px 12px;cursor:pointer;font:inherit}
.filtros button.on{background:var(--tx);color:var(--bg)}
main{max-width:1280px;margin:0 auto;padding:8px 16px 48px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.cartao{background:var(--card);border:1px solid var(--bd);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.topo{display:flex;align-items:center;gap:8px;padding:10px 12px}.dias{font-size:26px;font-weight:700}.dias small{font-size:12px;font-weight:500;color:var(--mu)}
.selo{margin-left:auto;font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}.selo+.selo{margin-left:0}
.selo.vencedor{color:var(--ver)}.selo.teste_longo{color:var(--tes)}.selo.novo,.selo.sem_data{color:var(--nov)}.selo.esc{color:var(--esc)}
.cartao img{width:100%;display:block;border-top:1px solid var(--bd);border-bottom:1px solid var(--bd)}.semfoto{padding:24px;text-align:center;color:var(--mu);border-top:1px solid var(--bd);border-bottom:1px solid var(--bd);font-size:13px}
.corpo{padding:10px 12px 14px}.corpo h3{margin:0 0 6px;font-size:15px}.txt{margin:0 0 8px;color:var(--mu);font-size:13px;white-space:pre-line}
ul{list-style:none;padding:0;margin:0 0 8px;font-size:13px}a{color:inherit;font-size:13px}
.nota{max-width:1280px;margin:0 auto;padding:0 16px 32px;color:var(--mu);font-size:13px}
</style>
</head>
<body>
<header>
<h1>Espião: ${esc(meta.alvo_nome)}</h1>
<p class="sub">Biblioteca de Anúncios da Meta, país ${esc(meta.pais)}, só anúncios ativos. Lido em ${dataBR(meta.data)}. Ordenado por dias no ar.</p>
<div class="num">
<div><b>${anuncios.length}</b>anúncios lidos (${geral.n} criativos distintos)</div>
<div><b>${concorrentes.length}</b>concorrentes</div>
<div><b>${geral.selos.vencedor}</b>prováveis vencedores (${LIMITE_VENCEDOR} dias ou mais)</div>
<div><b>${geral.selos.teste_longo}</b>testes longos (${LIMITE_TESTE} a ${LIMITE_VENCEDOR - 1})</div>
<div><b>${geral.selos.novo}</b>novos</div>
</div>
<div class="filtros" id="f1"><button class="on" data-filtro-selo="todos">Todos</button><button data-filtro-selo="vencedor">Provável vencedor</button><button data-filtro-selo="teste_longo">Teste longo</button><button data-filtro-selo="novo">Novo</button></div>
<div class="filtros" id="f2"><button class="on" data-filtro-pagina="todas">Todos os concorrentes</button>${chipsConc}</div>
</header>
<main id="grade">
${cartoes}
</main>
<p class="nota">Dias no ar é um sinal de que o anunciante continua pagando pelo anúncio, não é prova de venda. A Biblioteca só mostra anúncios ativos. Use como referência, não copie texto nem criativo.</p>
<script>
(function(){var selo='todos',pag='todas';function ap(){document.querySelectorAll('.cartao').forEach(function(c){var ok=(selo==='todos'||c.dataset.selo===selo)&&(pag==='todas'||c.dataset.pagina===pag);c.style.display=ok?'':'none'})}
document.querySelectorAll('[data-filtro-selo]').forEach(function(b){b.onclick=function(){selo=b.dataset.filtroSelo;document.querySelectorAll('[data-filtro-selo]').forEach(function(x){x.classList.toggle('on',x===b)});ap()}});
document.querySelectorAll('[data-filtro-pagina]').forEach(function(b){b.onclick=function(){pag=b.dataset.filtroPagina;document.querySelectorAll('[data-filtro-pagina]').forEach(function(x){x.classList.toggle('on',x===b)});ap()}});})();
</script>
</body>
</html>`;
}
