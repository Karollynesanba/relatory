# GreatGo

O GreatGo foi criado para **automatizar a geracao e o envio de relatorios de campanhas de trafego pago da META Ads** para clientes.

O objetivo e substituir processos manuais e ferramentas terceirizadas, permitindo que a equipe tenha **mais controle sobre os dados, mais eficiencia operacional e maior capacidade de escala** no atendimento de clientes.

---

# Contexto

Agencias que gerenciam campanhas de trafego pago frequentemente precisam enviar **relatorios periodicos de desempenho** para seus clientes.

Esse processo normalmente envolve:

- acessar manualmente os dados das campanhas
- organizar as metricas
- montar relatorios
- enviar os resultados para os clientes

Quando o numero de clientes cresce, esse processo se torna **repetitivo, demorado e sujeito a erros**.

Esta plataforma foi criada para resolver esse problema.

---

# Proposito da Plataforma

A plataforma centraliza todo o processo de relatorios em um unico sistema que:

- coleta os dados das campanhas de anuncios
- organiza as metricas de desempenho
- gera relatorios padronizados por cliente
- envia automaticamente esses relatorios para os clientes

Com isso, o processo passa a ser **automatico, confiavel e escalavel**.

---

# Beneficios

A adocao da plataforma traz algumas vantagens importantes:

- reducao de tarefas operacionais manuais
- padronizacao dos relatorios enviados aos clientes
- maior controle sobre historico de relatorios
- maior eficiencia da equipe
- possibilidade de escalar a operacao para muitos clientes

---

# Funcionamento Geral

De forma simplificada, a plataforma funciona assim:

1. As campanhas de cada cliente sao conectadas ao sistema
2. O sistema coleta periodicamente os dados de desempenho
3. As metricas sao organizadas em um relatorio
4. O relatorio e enviado automaticamente para o cliente

Todo o processo ocorre de forma automatizada, reduzindo a necessidade de intervencao manual da equipe.

---

# Visao de Longo Prazo

Alem da automacao basica de relatorios, a plataforma pode evoluir para incluir:

- comparacoes de desempenho entre periodos
- diferentes formatos de relatorio
- integracoes com outras plataformas de anuncios
- dashboards internos de analise de performance
- personalizacao de relatorios por cliente

O objetivo final e transformar a plataforma em uma **ferramenta central de acompanhamento de desempenho de campanhas para a operacao da agencia**.

---

# Uso

Este projeto e destinado ao **uso interno da operacao da empresa**, com foco na automacao de relatorios e melhoria da eficiencia operacional.

---

# Ambiente

Use os arquivos `.env.example` e `.env.local.example` como referencia e mantenha os segredos reais apenas em `.env.local` ou no provedor de ambiente do deploy.

Para integracao META com perfis separados, use:

- `META_APP_ID_ISAQUE` e `META_APP_SECRET_ISAQUE`
- `META_APP_ID_BRAYTON` e `META_APP_SECRET_BRAYTON`

As variaveis `META_APP_ID` e `META_APP_SECRET` ficam apenas como compatibilidade com configuracoes antigas.

Padrao recomendado:

- `.env`: apenas defaults nao sensiveis
- `.env.local`: segredos locais de desenvolvimento
- `.env.example`: placeholders e documentacao dos campos esperados

Regras de seguranca:

- nunca commitar `.env`, `.env.local` ou qualquer arquivo com segredos reais
- nao reutilizar token da META, API key, senha de usuario ou qualquer credencial externa como `NEXTAUTH_SECRET`
- usar valores aleatorios e distintos para `NEXTAUTH_SECRET` e `META_TOKEN_ENCRYPTION_KEY`
- manter `SEED_USER_PASSWORD` vazio por padrao e preencher apenas quando for executar `npm run user:create`
- rotacionar imediatamente qualquer segredo que ja tenha sido exposto em arquivo local, print, log ou commit

Exemplo de setup local:

1. copie `.env.example` para `.env.local`
2. preencha as credenciais necessarias
3. gere um `NEXTAUTH_SECRET` forte
4. gere uma chave independente para `META_TOKEN_ENCRYPTION_KEY`
5. defina `ADMIN_PASSWORD` para permitir o bootstrap automatico do primeiro administrador ou deixe vazio e execute `npm run user:create`
6. suba um Redis local ou remoto e configure `REDIS_URL`

Bootstrap inicial de autenticacao:

- `ADMIN_EMAIL` e `ADMIN_PASSWORD` controlam o administrador inicial criado automaticamente no primeiro login
- se `ADMIN_PASSWORD` estiver vazio, nenhum admin e criado automaticamente
- `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` e `SEED_USER_ROLE` continuam disponiveis para o script `npm run user:create`

---

# Filas e Redis

O processamento de relatorios agora usa uma fila persistida no banco, com locks e alertas operacionais em Redis.

- `POST /api/reports` cria um relatorio `PENDING` e dispara o processamento em background
- `GET /api/reports/:id` acompanha o progresso ate o payload ficar disponivel
- `POST /api/reports/:id/send` envia manualmente um relatorio ja gerado
- o Vercel Cron chama `/api/cron/report-jobs` para processar pendencias, schedules e o disparo semanal
- falhas de geracao ficam salvas no proprio registro do relatorio

Variaveis de ambiente:

- `REDIS_URL`: conexao principal com o Redis
- `REPORT_QUEUE_PREFIX`: prefixo das chaves de fila e monitoramento no Redis
- `REPORT_PROCESS_BATCH_SIZE`: quantidade minima de relatorios processados em paralelo por ciclo do cron
- `REPORT_PROCESS_LOCK_TTL_SECONDS`: TTL do lock distribuido durante o processamento
- `REPORT_WEEKLY_CRON`: agenda semanal do disparo automatico, recomendado `0 9 * * 1` para segunda-feira as 09:00
- `REPORT_WEEKLY_TZ`: timezone usada pelo agendamento semanal
- `REPORT_WEEKLY_BATCH_SIZE`: quantidade de clientes ativos processados por lote
- `REPORT_WEEKLY_OBJECTIVE`: objetivo padrao usado no job semanal
- `REPORT_ALERTS_RETENTION`: quantidade de alertas operacionais mantidos no Redis
- `CRON_SECRET`: segredo usado pelo Vercel Cron em `/api/cron/report-jobs`
- `REPORT_SHARED_MANAGER_IDS`: lista separada por virgulas ou ponto e virgula com os `managerId` que podem visualizar relatórios compartilhados sem acesso total ao sistema

Operacao:

- alertas operacionais recentes ficam persistidos no Redis
- `GET /api/jobs/health` retorna scheduler, fila persistida e alertas recentes para administradores
- em deploy Vercel, o arquivo `vercel.json` registra uma repeticao diaria de apoio para processar a fila e checar a saude do worker
- no plano Hobby, o cron da Vercel nao garante horario exato de minuto; o worker continuo e quem faz o disparo real
- os scripts `npm run report:weekly` e `npm run report:weekly:daemon` continuam disponiveis para operacao manual/externa ou para um host sempre ligado

Windows:

- para manter o worker sempre ligado em Windows, abra o PowerShell como Administrador e instale a tarefa agendada com `npm run report:windows:daemon:install`
- esse comando registra uma tarefa no `Task Scheduler` que sobe ao iniciar o Windows e reinicia o daemon se ele cair
- para iniciar o daemon manualmente no Windows, use `npm run report:windows:daemon:run`
- para remover a tarefa agendada, use `npm run report:windows:daemon:uninstall`
- os logs do launcher ficam em `.codex-report-daemon.out.log` e `.codex-report-daemon.err.log`

---

# Evolution / WhatsApp

O envio para WhatsApp ja esta integrado via Evolution API. Para habilitar:

1. preencha `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE` no `.env.local`
2. abra `/dashboard/settings` e confira a secao `Conexao Evolution`
3. selecione ou confirme a instancia que deve ser usada
4. no cadastro do cliente, escolha o grupo correto no campo `ID do Grupo WhatsApp`
5. gere ou abra um relatorio e use a acao de envio

Observacoes importantes:

- `EVOLUTION_INSTANCE` agora funciona como fallback padrao quando o usuario ainda nao salvou uma instancia propria
- se a Evolution estiver conectada, a tela de configuracoes lista os grupos disponiveis para copiar ou selecionar
- o envio manual e automatico usa o `whatsappGroupId` salvo no cliente ou no agendamento do relatorio
