---
name: espiao
description: "Acha os concorrentes de um negócio e lê os anúncios ativos deles na Biblioteca de Anúncios da Meta, sem login, ordenando por há quanto tempo cada anúncio está no ar (90 dias ou mais = provável vencedor). Gera relatório, página com as capturas e um briefing para o /ads create. Use quando a pessoa digitar /espiao <site, nome ou página do concorrente>, ou pedir: espionar concorrente, ver os anúncios do concorrente, biblioteca de anúncios da Meta, quais anúncios do concorrente estão rodando há mais tempo, anúncios vencedores do mercado, ad library, spy de anúncios."
---

# /espiao

Você lê a Biblioteca de Anúncios da Meta SEM login, com um Chrome headless de perfil temporário, e entrega o que os concorrentes estão rodando agora, ordenado por dias no ar.

Regras que não mudam:
- Nunca faça login na Meta. Nunca use o Chrome da pessoa nem a extensão Claude in Chrome nessas páginas. O script abre um Chrome separado e apaga o perfil no fim.
- Seja educado com a Meta: no máximo cerca de 12 páginas da Biblioteca por rodada (o script já trava em 12), com pausa entre rolagens. Não repita a rodada à toa.
- Dias no ar é um sinal, não é resultado. Diga isso no fechamento.
- Não escreva travessão (nem o longo nem o curto) separando frase nos textos que você produzir. Use vírgula, dois-pontos ou ponto.
- Responda em português do Brasil.

## Onde estão os scripts

A pasta desta skill (a que contém este SKILL.md) tem `scripts/espiao.mjs`. Abaixo `ESPIAO` quer dizer `node <pasta da skill>/scripts/espiao.mjs`. Normalmente: `node ~/.claude/skills/espiao/scripts/espiao.mjs`.

Rode os comandos na pasta onde a pessoa está trabalhando: a saída vai para `./espiao/<AAAA-MM-DD>-<alvo>/` dentro dela.

Antes da primeira rodada, confira se `node -v` é 18 ou maior e se existe `<pasta da skill>/node_modules`. Se não existir, rode `npm install` nessa pasta (baixa o Chrome for Testing, uns 150 MB, só na primeira vez).

## Passo a passo quando a pessoa digita `/espiao <alvo>`

Primeiro descubra o tipo de alvo:
- Site ou domínio (`loja.com.br`, `https://...`): é o site DA PESSOA. Siga o Caminho A.
- Nome de empresa, link de página do Facebook, link da Biblioteca ou id numérico: é UM concorrente. Siga o Caminho B.
- Se estiver na dúvida entre as duas coisas, pergunte em uma linha.

### Caminho A: site da pessoa, achar os concorrentes sozinho

1. Leia o site: `ESPIAO site <url>`. Entenda o nicho, o produto, a oferta e o público a partir do título, da descrição, dos títulos e do texto. Se vier o aviso de pouco texto, use o que tiver e, se faltar, pergunte à pessoa em uma frase o que ela vende.
2. Gere de 3 a 6 termos de busca em português, do jeito que um ANÚNCIO desse nicho escreveria, não do jeito que o dono do site descreve. Misture: o produto principal ("creatina monohidratada"), a categoria ("suplementos esportivos"), um benefício ou dor que apareça nos anúncios. Evite o nome da própria marca e termos amplos demais ("saúde"). Termos específicos acham mais concorrentes diretos.
3. Busque: `ESPIAO buscar --alvo <site> --termos "termo 1" "termo 2" "termo 3"`. Ele busca cada termo com frase exata (`keyword_exact_phrase`), país BR, só anúncios ativos, e imprime o ranking de anunciantes pelo número de anúncios ativos que apareceram. Já marca a página da própria pessoa (PRÓPRIA) e os marketplaces.
4. Escolha os 5 principais concorrentes com o seu julgamento, olhando o ranking: fique com quem vende o mesmo tipo de produto para o mesmo público. Tire a página da própria pessoa, marketplaces, perfis de influenciador sem loja, anunciantes de outro nicho que só apareceram por acaso, e páginas repetidas da mesma marca (fique com a que leva ao site). Se o ranking tiver menos de 5 bons, leia menos de 5 e avise. Se estiver ruim, refaça a busca com outros termos (só uma vez).
5. Leia os anúncios de cada um: `ESPIAO ler --alvo <site> --paginas <id1> <id2> <id3> <id4> <id5>`. O padrão é até 60 anúncios por página e 6 capturas por página (as dos anúncios mais antigos). Se a página tiver muito mais anúncios que o teto e a pessoa quiser a leitura completa, rode de novo só para ela com `--max 150`.
6. Gere os arquivos: `ESPIAO relatorio --alvo <site>`.
7. Siga em "Depois de gerar".

Atalho: `ESPIAO rodar --alvo <site> --termos "a" "b" "c"` faz os passos 3, 5 e 6 de uma vez com a escolha automática dos concorrentes. Prefira o passo a passo, porque a escolha pelo seu julgamento é melhor que a automática.

### Caminho B: um concorrente direto

1. `ESPIAO rodar --alvo "<nome, link da página ou id>"`. Ele acha o id da página (por nome na própria Biblioteca, ou pelo HTML da página do Facebook), lê todos os anúncios ativos (até 60, 10 capturas) e gera os arquivos.
2. Se o resultado disser `ambíguo` ou `alternativas`, confirme com a pessoa qual é a página certa e rode de novo com o id ou o link.
3. Se a pessoa também quiser comparar com o site dela, rode o Caminho A e inclua esse id em `ler`.
4. Siga em "Depois de gerar".

## Depois de gerar

A pasta `espiao/<AAAA-MM-DD>-<alvo>/` tem: `relatorio.md`, `relatorio.html`, `anuncios.json`, `capturas/` e `briefing-para-ads-create.md`.

1. Leia `relatorio.md` e `briefing-para-ads-create.md`.
2. Confira se o relatório faz sentido: concorrentes certos, anúncios com data, capturas existentes. Se algo estiver estranho, diga o que está estranho em vez de maquiar.
3. Acrescente no FIM de `relatorio.md` e de `briefing-para-ads-create.md` uma seção `## Leitura do Claude` com a sua análise em poucas linhas: o que os anúncios mais antigos têm em comum (gancho, oferta, formato, botão, destino), o que os concorrentes escalam (criativos com várias versões), o que ninguém está fazendo e vale testar, e 3 ideias de teste para a oferta DA PESSOA. Seja específico, cite concorrente e ID. Não invente número que não esteja nos dados.
4. Responda no chat, curto: quantos anúncios e concorrentes, os 5 com mais dias no ar (dias, concorrente, formato, gancho em uma linha), o caminho da pasta e o próximo passo: abrir `relatorio.html` no navegador e rodar `/ads create` com o briefing.
5. Avise os limites que valeram nesta rodada: só anúncios ativos, leitura parcial se a página tinha mais anúncios que o teto, e que dias no ar não prova venda.

## Como o script entende os dados

- Selo por dias no ar, contados da data de início do anúncio ativo até hoje: 90 dias ou mais = "provável vencedor", 30 a 89 = "teste longo", menos de 30 = "novo".
- "Versões" vem do texto da Biblioteca "N anúncios usam esse criativo e esse texto" e também da repetição do mesmo texto na mesma página. 5 versões ou mais = "escalando".
- Destino é o link de verdade (o `u=` do redirecionador `l.facebook.com`, e o `url=` de rastreadores comuns).
- A Biblioteca mostra a data no fuso do Pacífico. O script converte do mesmo jeito para bater com a tela.

## Se algo quebrar

- "puppeteer não instalado": `npm install` na pasta da skill.
- "Não achei um Chrome": `npm install` ou `ESPIAO_CHROME=/caminho/do/chrome`.
- Lidos 0 anúncios: a Biblioteca pode ter pedido verificação ou limitado o acesso a esse IP. Espere alguns minutos e tente uma vez. Se persistir, diga à pessoa. Não tente burlar nem fazer login.
- Interface em inglês ou português: o script lê o JSON da própria página, então funciona nos dois. O plano B pela tela entende "Identificação da biblioteca"/"Library ID" e "Veiculação iniciada em"/"Started running on".
- Só a Biblioteca oficial da Meta: a API `ads_archive` no Brasil só devolve anúncio político, então não serve para anúncio comercial.
- Quer só anúncios fora do Brasil: `--pais US` (ou outro código de país).
