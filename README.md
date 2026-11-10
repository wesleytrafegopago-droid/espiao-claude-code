# /espiao

Skill do Claude Code que lê a Biblioteca de Anúncios da Meta **sem login** e mostra o que os seus concorrentes estão rodando agora, ordenado por há quanto tempo cada anúncio está no ar.

Você digita `/espiao seusite.com.br`. Ela lê o seu site, entende o que você vende, acha os concorrentes sozinha, puxa cada anúncio ativo deles e separa os que estão no ar há mais tempo. Quem paga 90 dias de anúncio normalmente está vendendo.

## O que ela entrega

Uma pasta `espiao/<AAAA-MM-DD>-<alvo>/` dentro da pasta onde você rodou:

| Arquivo | O que é |
|---|---|
| `relatorio.md` | Top 10 geral por dias no ar (texto, botão, destino, concorrente), seção por concorrente e os padrões de formato, gancho, oferta e botão |
| `relatorio.html` | Os mesmos anúncios em cartões com a captura da Biblioteca e o selo de dias. Abre no navegador, com filtro por selo e por concorrente |
| `anuncios.json` | Todos os dados, um objeto por anúncio |
| `capturas/` | A imagem do cartão de cada anúncio principal |
| `briefing-para-ads-create.md` | Um briefing criativo do que o mercado mantém no ar, para você usar depois no `/ads create` da claude-ads |

Dados por anúncio: id da Biblioteca, página, data de início, **dias no ar** (até hoje), texto, título, botão, destino do clique, tipo de mídia, número de versões ("N anúncios usam esse criativo e esse texto"), plataformas e a captura.

Selos:

- **provável vencedor**: 90 dias ou mais no ar
- **teste longo**: de 30 a 89 dias
- **novo**: menos de 30 dias
- **escalando**: 5 versões ou mais do mesmo criativo

Anúncios com o mesmo texto na mesma página contam como um criativo nas listas e nos padrões, para um anúncio copiado 50 vezes não ocupar o relatório inteiro.

## Instalação

Precisa de **Node 18 ou mais novo**, de **git** e do **Claude Code**.

```bash
git clone https://github.com/wesleytrafegopago-droid/espiao-claude-code ~/.claude/skills/espiao
cd ~/.claude/skills/espiao
npm install
```

No Windows (PowerShell):

```powershell
git clone https://github.com/wesleytrafegopago-droid/espiao-claude-code "$HOME\.claude\skills\espiao"
cd "$HOME\.claude\skills\espiao"
npm install
```

O `npm install` baixa o Chrome for Testing (algumas centenas de MB, só na primeira vez). Se você já tem o Chrome e prefere usar ele:

```bash
PUPPETEER_SKIP_DOWNLOAD=1 npm install
export ESPIAO_CHROME="/caminho/do/chrome"   # só se a skill não achar sozinha
```

A skill procura nesta ordem: `ESPIAO_CHROME`, o Chrome for Testing do `npm install`, e o Chrome (ou Edge) instalado no Windows, macOS ou Linux.

Abra o Claude Code e confira que o `/espiao` aparece na lista de comandos.

## Uso

```text
/espiao seusite.com.br
/espiao "Nome do concorrente"
/espiao https://www.facebook.com/pagina-do-concorrente
```

- Com o **seu site**: ela lê o site, monta de 3 a 6 termos de busca, busca na Biblioteca (Brasil, só anúncios ativos, todos os tipos, frase exata), ranqueia os anunciantes pelo número de anúncios ativos que aparecem, escolhe os 5 principais concorrentes (tirando a sua própria página e os marketplaces) e lê até 60 anúncios ativos de cada um.
- Com **um concorrente** (nome, link da página do Facebook, link da Biblioteca ou id numérico): lê direto os anúncios dele.

Para outro país, peça no comando: `/espiao seusite.com, país US`.

### Sem o Claude, direto no terminal

```bash
node scripts/espiao.mjs site https://seusite.com.br
node scripts/espiao.mjs buscar --alvo seusite.com.br --termos "whey protein" "creatina" "suplementos alimentares"
node scripts/espiao.mjs ler --alvo seusite.com.br --paginas 123456789 987654321 --max 60 --capturas 6
node scripts/espiao.mjs relatorio --alvo seusite.com.br --site seusite.com.br
node scripts/espiao.mjs rodar --alvo "Nome do concorrente"
```

Opções: `--pais BR`, `--saida <pasta>`, `--max <anúncios por página>`, `--capturas <por página>`, `--limite-paginas 12`.

## Como funciona

1. Abre um **Chrome headless com perfil temporário** (apagado no fim). Nunca usa o seu Chrome, nunca faz login, nunca usa cookies seus.
2. Abre a Biblioteca (`facebook.com/ads/library`), rola com pausas de 2,6 a 4,2 segundos e lê o JSON que a própria página carrega (id, página, início, texto, botão, destino, mídia). Se esse JSON não vier, lê os cartões pela tela, em português ou inglês ("Identificação da biblioteca" ou "Library ID", "Veiculação iniciada em" ou "Started running on").
3. Todos os anúncios de uma página saem de `view_all_page_id=<id>`. O id vem do próprio anúncio, do HTML da página do Facebook (`associated_page_id`) ou de uma busca pelo nome.
4. Busca por palavra usa `keyword_exact_phrase` (frase exata), porque a busca solta traz muito ruído.
5. Tira uma captura de cada cartão dos anúncios mais antigos.
6. Calcula os dias: data de início do anúncio ativo até hoje. A Biblioteca mostra a data no fuso do Pacífico, e a skill converte igual para bater com a tela.

Ritmo: no máximo 12 páginas da Biblioteca por rodada (trava no código) e pausa entre rolagens e entre páginas. Um caso típico abre de 6 a 9.

## Limites (leia antes de confiar)

- **Só anúncios ativos.** A Biblioteca não mostra o que a empresa já pausou. Para anúncio comercial fora da União Europeia ela não guarda histórico.
- **Dias no ar é um sinal, não é resultado.** Significa que o anunciante continua pagando pelo anúncio. Não prova venda nem lucro. Pode ser anúncio de marca, de remarketing ou esquecido ligado.
- **Leitura parcial.** O padrão é 60 anúncios por página. Se o concorrente tem 300, a Biblioteca não devolve em ordem de data, então os mais antigos podem ficar de fora. O relatório avisa ("leitura parcial") e você pode subir com `--max 150`.
- **O ranking dos concorrentes é uma amostra.** A busca devolve só os primeiros anúncios de cada termo. Por isso o Claude revisa a lista antes de ler e escolhe quem realmente vende o que você vende. Marketplaces, influenciadores sem loja e a sua própria página saem.
- **A API oficial `ads_archive` não serve** no Brasil: só devolve anúncio político.
- **A Meta muda a página sem avisar.** Se o formato do JSON mudar, a leitura pela tela entra no lugar, mas pode vir com menos campos (sem botão, por exemplo). Se a Biblioteca pedir verificação ou limitar o seu IP, espere e tente depois. A skill não tenta contornar nem faz login.
- **A interface em inglês** é tratada na leitura pela tela, mas só foi testada com a Biblioteca em português. A leitura principal pelo JSON não depende do idioma.
- Anúncio de catálogo/dinâmico vem sem texto fixo ("{{product.brand}}"). Aparece como anúncio dinâmico.

## Uso responsável

Você está lendo uma página pública, sem login, em ritmo baixo, para pesquisa de mercado. Use como referência de estrutura e ângulo. Não copie texto, imagem, vídeo, marca ou depoimento de terceiros. Confira os termos da Meta antes de usar o resultado de outra forma, e não rode em volume.

## Próximo passo

Depois do `/espiao`, use o `briefing-para-ads-create.md` no `/ads create` da skill [claude-ads](https://github.com/AgriciDaniel/claude-ads) para gerar texto e imagem com a sua oferta.

## Licença

MIT. Veja `LICENSE`. Copyright (c) 2026 Wesley Porto.
