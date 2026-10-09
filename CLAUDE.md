# Minho Defenders (O Cerco do Minho)

Jogo de *tower defense* no browser, passado nas praças-fortes do Alto Minho: Valença, Monção, Caminha/Âncora, Cerveira e Melgaço. O tom é histórico e humorístico: os castelhanos invadem e os portugueses defendem-se com arqueiros, besteiros, trabucos, azeite a ferver e duas heroínas lendárias.

- **Idioma:** o jogo é bilingue através de `tr('pt','en')`, e o português (de Portugal) é o principal. O utilizador escreve em português europeu, por isso as respostas e as mensagens de commit são em português.
- **Tudo num só ficheiro:** `index.html`. É HTML, CSS e JS inline, sem build nem dependências, e desenha em Canvas 2D.

## Fluxo de trabalho habitual

Depois de cada alteração pedida:
1. Fazer commit e push para o ramo `main`, com uma mensagem em português.
2. **Nunca publicar nem atualizar o artefacto do claude.ai** (https://claude.ai/artifact/BpRsw1eb1qDMCaUzEdR8tW). O utilizador pediu para deixar de o fazer.

O jogo também está alojado no GitHub Pages.

## Regras de estilo e design

- **Visual:** mapa antigo ou gravura, com papel creme `#e9dcbc`, tinta `INK='#2e2419'`, dourado `#c9971c`/`#e8c24a`, vermelho `#9b2226` e azul `#2f4a73`.
- **Sem emojis na interface.** Os ícones são SVG no mapa `ICONS`:
  - em HTML usa-se `ic('nome')`;
  - no canvas usa-se `drawIc(ctx,nome,x,y,tamanho)`;
  - nos textos flutuantes do canvas, `¤` é desenhado como moeda (nada de emojis, nem ▶ ou ✕ nos botões).
- **Bonecos em estilo *chibi*:** cabeça grande e olhos expressivos. Os ajudantes são `oval`, `head`, `torso`, `legs`, `faceEyes`, `mustache` e `morion`.
- **Movimento reduzido:** todas as animações respeitam `RM()`. `RM()` segue `OPT.anim` (Opções › Animações: `auto` segue o sistema, `on` sempre, `off` nunca); no Windows com «Mostrar animações» desligado o sistema pede movimento reduzido e, em `auto`, os bonecos ficam parados. Os testes Playwright não apanham isto sem `reducedMotion:'reduce'`.
- **Telemóvel e iPad:** sem zoom por toque duplo, e o menu com o mapa de fundo tem de caber no ecrã.
- **Comentários:** no código são curtos e em português. O código é denso, no mesmo estilo que já lá está.

## Mapa do código (secções marcadas `/* ---- NN-nome.js ---- */`)

| Secção | O que tem |
|---|---|
| 00-base, 00b-icones | `$`, `LS` (localStorage com o prefixo `cerco-`), `tr`, `ICONS`/`ic`/`drawIc` |
| 01-geometria-mapas | `LEVELS` (`defValenca`, `defMoncao`, `defAncora`, `defCerveira`, `defMelgaco`; `push` por mapa, `idle`/`leak` com frases locais). `pushBack` afasta as fortalezas do rio e faz as estradas às curvas. Também `loadLevel`, `PATHS`, `SLOTS`, `LV.gates`, `edgeGate` e `sandbars` (ínsuas) |
| 02-regras-humor | `TYPES` (torres arq/bes/tra/cal, 4 níveis, especialização no nível 3 com `br` 0/1), `FOES`, `BOSS`, `DIFFS`, `HEROES` (padeira, deuladeu), `ABIL`, `WEATHER`, `waveDef`, bênçãos e pactos, frases de humor |
| 03-som-vozes | Web Audio: `audio()`, `tone`, `noise`, `sfx(n)`, `sndMode` (0 desligado, 1 efeitos, 2 efeitos e vozes), `say()`. Volumes em `VOL` (geral, música, efeitos, vozes; sliders nas Opções, guardados em `cerco-vol`): os efeitos vão para `sfxG`, as vozes para `voxG` e a música para `musG`, todos ligados a `master`. **Música procedural** (`MUS`, `SONGS.menu`/`SONGS.game`, `setMusic(nome)` com transição cruzada, `musKick` no primeiro toque; é desligável em Opções) |
| 04-conquistas-recordes | conquistas e recordes partilhados (`db`) |
| 05-estado-combate | objeto de estado `S`, `update(dt)`, `updateHero`, `heroSpecial`, portas destrutíveis (`S.gates`), inimigos que atiram de longe (`S.eproj`) |
| 06-fundo | `drawBG()` desenha o fundo **uma vez** num canvas à parte (`bgc`): rio, casas em alçado com variantes (`house`: térrea, sobrado, granito, alpendre, palheiro, espigueiro), campos cultivados (`field`, só onde `LV.fields`, p. ex. Cerveira) sem sobreposição (`OCC`), árvores e enfeites, muralhas, igrejas pequenas |
| 07-desenho | `draw()` corre a cada frame. Desenha `drawWater` (animação do rio), `drawSlot`, `drawChurch`/`drawKeep` (torre de menagem de Cerveira)/`drawPaiol` (Âncora)/`drawHeart`, `drawGates`, inimigos (`drawChibi`, `drawRam`, `drawSiege`, `drawBombard`, `drawBoss`: as quatro lendas desenhadas e animadas no estilo chibi), heroínas (`drawPadeira`, `drawDeu`) e torres (`drawTowerBuilding` para arq e bes, que são torres a sério com o defensor no topo; `towerPlatform` + `drawTowerUnit` para o trabuco e o azeite, que **ficam como plataformas redondas de propósito**) |
| 08-zoom-acoes-interface, 08b-animacoes | zoom e arrasto (`MX`/`MY` são as margens do ecrã sem zoom; o fundo é desenhado e arrasta-se até `EX0..EX1` × `EY0..EY1`, com a folga `OVP` a cada lado e mais `TOPX` a norte), ações locais ou do parceiro, HUD, painel das habilidades no canto inferior esquerdo, mapa SVG do menu (`menuSvg`, `menuBgShow`/`menuBgLeave`) |
| 09-guardar-coop | guardar a partida e o **modo cooperativo**. No claude.ai usa a capacidade `room`, com recurso à presença para quem só pode ver. Fora do claude.ai usa PeerJS/WebRTC. `snapshot`/`applySnap` sincronizam o estado (os campos novos têm de entrar nos dois). Há ainda coop no mesmo ecrã, com J1 à esquerda e J2 à direita |
| 10-janelas | janelas (menu, opções, ajuda, fim de jogo) |
| 11-ciclo | ciclo principal |

## Mecânicas principais

- **Onde se constrói:** as torres só se constroem em lugares fixos (as bandeiras). No nível 3 escolhe-se uma de duas especializações; o nível 5 dá um efeito próprio a cada uma (`TYPES[k].L5`, `multi`/`stun` em `tstat`).
- **Gastar ouro no fim:** obras na praça (`WORKS`, tocar no coração da praça, `S.works`, `applyWork`) e treino/oferendas da heroína (`heroBuy`, `h.gift`).
- **Portas e habilidades:**
  - as portas das muralhas têm vida e os inimigos arrombam-nas;
  - "Fechar portas" atordoa quem está em terra e reconstrói as portas;
  - as habilidades só se usam depois de começar a primeira vaga.
- **Inimigos:**
  - vêm por estradas e alguns atravessam o rio a nado (os nadadores);
  - os archeiros e as bombardas atacam as portas de longe;
  - vagas avançadas: sapador (`e.under`, cava por baixo da primeira porta fechada), porta-estandarte (`armorB`), gaiteiro (`gaitB`), peregrino espião (`e.hidden`, `reveal`); elites a partir da vaga 15 (`e.elite`);
  - nas vagas 10 e 20 aparece o chefe de cada mapa (Mercador das Toalhas, Coca, Polvo da Lagarteira, Cervo Gigante, Arrenegada). Ganhar um mapa pela primeira vez desbloqueia o chefe como herói (`HEROES[k].map`, `heroLocked`, `bossSpecial`).
- **Barcos:** os inimigos (menos nadadores, a Coca, o Polvo e o Cervo) atravessam o rio em barcos (`BOATS`: batel, barca, galeota, nau), que aparecem por vaga (`from`) e com peso crescente. Cada inimigo ocupa `FSZ[t]` lugares. `launchBoat`/`seatBoat`/`updateBoats` em 05; `drawBoat` em 07. A bordo, o inimigo tem `e.ride=id` do barco e não anda sozinho.
- **Heroína:** bloqueia até 3 inimigos, move-se tocando nela e depois no mapa, e tem um poder especial. Ganha experiência (`heroXP`) até ao nível 10; nos níveis 3, 6 e 9 escolhe uma de duas melhorias (`HEROES[id].ups`, `hUp(h,k)`), no painel dela. O painel minimiza-se (`heroMin`, guardado em `cerco-hmin`) e fica só o cabeçalho (nome, nível por baixo e o botão do poder especial, `.hsp`), para se ver o mapa no telemóvel; com `body.panel-min` os poderes e o zoom continuam visíveis por cima da barra.
- **Reparar tudo:** botão nos poderes (`data-ab="fix"`, ação `fixAll`) que repara de uma vez todas as torres destruídas (`fixList`/`fixSum`) e só avança se houver ouro para o custo total, mostrado no botão.
- **Postigo:** a porta da estrada dos nadadores é destrutível como as outras; na vaga 10 rebenta e abre o terceiro caminho, mas pode voltar a ser fechada.
- **Modos:** campanha, jogo livre, infinito e cooperativo. Há três dificuldades: Turista, Castelhano e Capitão Paco.
- **Desafio do dia** (`dailyDef`, `startDaily`, `S.daily`, resultados em `cerco-daily`): a data escolhe a praça, a dificuldade, o herói (mesmo bloqueado), um pacto já assinado e uma torre proibida (`banned(k)`). Não conta para estrelas nem recordes; o resultado partilha-se (`shareDaily`).
- **Desfazer:** construir ou melhorar regista `S.undo` (`markUndo`/`undoOk`); durante 6 s de jogo, e se a torre ainda não fez dano, o botão `#undoB` (ou a tecla Z) devolve o ouro todo.
- **Progresso por mapa:** estrelas por dificuldade em `cerco-stars` (vidas no fim: ≥80% 3, ≥40% 2, senão 1; `starsOf`, `starRow`, `mapProg`) e melhor vaga do infinito em `cerco-infbest`. O fim de jogo mostra o gráfico de ouro e vidas por vaga (`S.stats.hist`, `endChart`).
- **Sem rede:** `sw.js` guarda o jogo para a app instalada (só em http/https e fora do claude.ai). Mudar de separador pausa a partida (`visibilitychange`).
- **Segredo:** três toques seguidos em Melgaço (estrela ou nome) no mapa do menu (`CHEAT`) guardam `cerco-allheroes` e desbloqueiam todos os heróis (`heroLocked`).

## Testes (Playwright com o Chromium pré-instalado)

- **Como correr:** `NODE_PATH=$(npm root -g) node script.js`. Os scripts abrem o ficheiro com `file://`.
- **Rede:** bloquear `fonts|jsdelivr` com `page.route(...abort)`, porque o proxy não deixa passar CDNs.
- **Expor o estado interno** num ficheiro de teste:
  ```sh
  sed 's|^function netSend(now){|window.__T={S:()=>S,mkFoe,SLOTS:()=>SLOTS};\nfunction netSend(now){|' index.html > test.html
  ```
- **Arrancar uma partida:** clicar em `text=Jogo livre`, depois em `#mcard button[data-m="lvl"]:has-text("Valença")`, e por fim em `.mbtns button.main`.
- **Depois de mexer no aspeto:** tirar capturas dos 4 mapas no PC e no iPhone (`devices['iPhone 13']`) e confirmar que não há `pageerror`.

## Simulador de balanceamento (`sim.js`)

Corre o jogo verdadeiro sem desenhar, com um bot a jogar: cola o bot dentro do script do `index.html` (numa cópia temporária), troca `Math.random` por um gerador com semente e chama `update(0.02)` em ciclo até a partida acabar. Não altera o `index.html`.

- **Correr:** `NODE_PATH=$(npm root -g) node sim.js --n 10` (todos os mapas, Castelhano, Padeira, todas as estratégias). Serve `playwright` ou `playwright-core` com o Chrome/Edge do sistema.
- **Opções:** `--mapas`, `--dif 0,1,2`, `--herois`, `--estr`, `--n` (sementes por combinação), `--par` (browsers em paralelo; 2 por omissão, em prioridade baixa), `--detalhe` (quem passa, por que estrada, que torres caem, em que vaga fica tudo no nível 5, dano por ouro, e por estrada a que altura do caminho morrem os inimigos, quantos chegam à primeira porta e quem os mata), `--porta` (por vaga, que parte dos inimigos chega à primeira porta da sua estrada, mortos lá ou não, e de que tipos; os `mini` nascem das torres de assalto já junto à porta e os archeiros e bombardas param antes dela de propósito), `--ondas 30` (modo infinito até essa vaga), `--curto` (só o resumo), `--csv ficheiro`.
- **Experimentar números sem mexer no jogo:** `--patch "TYPES.bes.cost=110;FOES.arqc.hp=60"`.
- **Experimentar estratégias:** `--def '{"teste":{"hero":"caca","mix":{"bes":2,"cal":1}}}' --estr teste` (os campos estão explicados no topo do `sim.js`).
- **Autoteste:** `node sim.js --teste` (a mesma semente tem de dar a mesma partida). `node sim.js --geo` mostra a estrada que cada bandeira alcança em cada caminho; com `--sugere 2` lista os sítios livres que mais apanham a estrada 2.
- **Estratégias:** `base` é o bot do duelo sem mandar tropas; `misto` é a melhor que se encontrou com os quatro tipos de torre; `portas` põe o azeite às portas e os trabucos e besteiros atrás; `so-arq`/`so-bes`/`so-tra`/`so-cal` medem cada torre sozinha.
- **Como ler:** o bot não é uma pessoa. Os números servem para comparar (mapa contra mapa, torre contra torre, antes e depois de uma alteração), não como dificuldade absoluta.
