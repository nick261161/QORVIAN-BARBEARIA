# Agenda white-label

Agenda, catálogo e painéis multi-tenant para barbearias, salões e clínicas de estética. A plataforma usa Next.js App Router, PostgreSQL e armazenamento de imagens compatível com S3.

## Prévia local

Use Node.js 22.13 ou posterior. Na pasta `plataforma`, instale as dependências e copie o arquivo de configuração.

```powershell
npm ci
Copy-Item .env.example .env
node -p "require('node:crypto').randomBytes(48).toString('hex')"
```

Use a saída do último comando como `JWT_SECRET`. Com a configuração de exemplo, mantenha `npm run db:local` aberto em um terminal. Em outro terminal, rode:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

| Área | Caminho | Telefone de demonstração |
| --- | --- | --- |
| Vitrine | `/` ou `/loja/navalha-e-cia` | Público |
| Cliente | `/login` ou `/minha-conta` | Cadastro pela vitrine |
| Empresário | `/login` e `/admin` | (85) 90000-0002 |
| Equipe | `/login` e `/admin/agenda` | (85) 90000-0003 a (85) 90000-0005 |
| Master | `/master` | (85) 90000-0001 |

A porta padrão desses comandos é 5173. As contas fictícias usam `DemoAgenda!2026`. As migrações são incrementais. O seed funciona em PostgreSQL local para desenvolvimento.

`npm run build` gera a distribuição do Next.js. `npm start` executa essa distribuição. `npm test` roda os testes com PostgreSQL real em um banco temporário.

## Como funciona

- A agenda oferece horários de início às horas cheias e às meias-horas. Ela considera toda a duração do serviço, expediente, almoço, reservas e bloqueios. O PostgreSQL também rejeita reservas sobrepostas na transação.
- O checkout valida e baixa o estoque na mesma transação. Cancelar um pedido pendente devolve as unidades uma vez. O pagamento é combinado com a loja.
- A equipe acessa os próprios agendamentos, clientes atendidos, relatórios e perfil. A troca de senha invalida sessões antigas. Relatórios pessoais e da loja podem ser exportados em PDF, Excel e CSV com os filtros selecionados.
- Em **Admin → Configurações**, o empresário edita a mensagem padrão, insere variáveis e confere uma prévia. Na agenda, **Enviar Confirmação** abre uma conversa no WhatsApp com a mensagem preenchida e confirma a reserva pendente no sistema. O envio é concluído manualmente no WhatsApp.
- O navegador comprime imagens antes de enviá-las. O servidor reencoda em WebP, remove metadados e registra a chave de armazenamento. Substituições e exclusões enfileiram a retirada das imagens sem referências. Uploads abandonados vencem após 24 horas e são limpos no cron.
- A conclusão registra a comissão vigente e credita selos ou pontos quando o clube está ativo. Alterar uma comissão preserva os valores já registrados.

## Implantação na Vercel

1. Selecione `plataforma` como diretório raiz do projeto Next.js. Use uma conexão Neon com pool em `DATABASE_URL` e a conexão direta em `DATABASE_URL_UNPOOLED` para aplicar `npm run db:migrate`. Em um banco vazio, use `npm run db:bootstrap` com `ADMIN_NAME`, `ADMIN_PHONE` e `ADMIN_PASSWORD` para criar o primeiro acesso master. [Driver Neon](https://neon.com/docs/serverless/serverless-driver) · [Pooling no Neon](https://neon.com/docs/connect/connection-pooling).
2. Defina `JWT_SECRET`, `APP_ORIGINS` com HTTPS, `DEFAULT_TENANT_SLUG` e `MEDIA_DRIVER=s3`. Configure `S3_BUCKET`, `S3_REGION` e credenciais AWS com permissões de leitura, gravação e exclusão no bucket. Para R2, informe `S3_ENDPOINT` e use região `auto`. As imagens são servidas por `/media`; o bucket pode permanecer privado. Se o banco e as fotos vierem de uma instalação local, copie os objetos para o bucket preservando as chaves antes de trocar o driver dos registros existentes.
3. Configure `CRON_SECRET` para autorizar o endpoint `/api/cron/maintenance`. O cron diário revisita a fila do Google Agenda e limpa imagens abandonadas. A aplicação tenta sincronizar cada reserva logo após a alteração. Para retentativas frequentes em uma implantação comercial, ajuste o cron em uma conta Pro ou Enterprise. [Limites do Vercel Cron](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).

### Google Agenda

1. Habilite Calendar API no Google Cloud, configure a tela de consentimento e crie um cliente OAuth do tipo aplicativo web. Cadastre a URI exata `https://seu-dominio/api/google-calendar/callback`. Para a prévia use `http://127.0.0.1:5173/api/google-calendar/callback`. [OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server).
2. Defina `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` e `GOOGLE_TOKEN_ENCRYPTION_KEY` conforme o `.env.example`. Mantenha a chave de criptografia estável para preservar conexões existentes. A aplicação pede identidade por e-mail e acesso a eventos de calendários pertencentes ao profissional. [Escopos da Calendar API](https://developers.google.com/workspace/calendar/api/auth).
3. Ative a flag **Integração Google Agenda** no painel master. Cada funcionário autoriza a própria conta em **Admin → Meu perfil**. O sistema sincroniza agendamentos futuros no calendário principal, incluindo alterações de horário e cancelamentos. Os eventos usam o fuso da loja e lembretes nativos de 60 e 15 minutos.

O funcionário pode desconectar a conta no painel. Eventos já gravados permanecem no calendário e podem ser removidos pelo titular. Alterações feitas diretamente no Google Agenda não alteram a reserva. Falhas do provedor são tratadas fora da transação da reserva. A suíte local usa um calendário simulado.

## Código

- `src/app` contém páginas e Route Handlers do Next.js.
- `src/lib` contém banco, autenticação, mídia e a adaptação HTTP dos controladores compartilhados.
- `src/services` contém agenda, disponibilidade, comissões, fidelidade, relatórios e sincronização com o Google Agenda.
- `src/components` e `src/contexts` concentram a interface reaproveitável.
- `database` contém schema e seed. `backend` mantém os controladores de domínio e serve de apoio à suíte de regressão.

