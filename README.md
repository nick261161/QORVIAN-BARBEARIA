# Navalha & Cia.

O sistema multi-tenant com PostgreSQL, agenda real e painéis está documentado em [plataforma/README.md](plataforma/README.md). As instruções abaixo são da vitrine demonstrativa original.

Site demonstrativo de barbearia em Next.js (App Router) e TypeScript. A marca, os profissionais, os preços e os horários são fictícios. A agenda usa o fuso de Fortaleza.

## Rodar localmente

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000`. Para gerar a versão estática em `out/`, execute `npm run build`.

## Fluxo de reserva

Escolha um serviço, um barbeiro, uma data e um horário. Adicione produtos se desejar. Use nome e telefone fictícios no formulário. A confirmação permite baixar um `.ics`, abrir o Google Agenda ou compartilhar o resumo pelo WhatsApp.

As reservas ficam no armazenamento local do navegador. O nome e o telefone são usados para simular a validação do formulário e descartados depois. Um mesmo horário pode continuar disponível em outros navegadores e dispositivos.

## Interações da página

- A galeria abre fotos do espaço, do corte e da barba pelos indicadores, botões, setas do teclado ou gesto lateral. Os carrosséis de serviços e produtos também permitem rolagem horizontal e navegação por teclado.
- O catálogo pode ser filtrado por categoria. A sacola mostra os produtos selecionados e os leva para a reserva.
- Os efeitos do cursor seguem a preferência por movimento reduzido até que o visitante escolha ativá-los ou desativá-los no botão abaixo da apresentação. A posição do ponteiro não é gravada nem enviada.
- As imagens ilustrativas dos serviços e produtos foram geradas e preparadas em WebP. As fotos mostram cortes e atendimentos em uma barbearia de madeira escura e luz quente. Os produtos aparecem sobre fundo verde-oliva em embalagens sem marca.

## Etapas para operação real

- Configurar PostgreSQL no Neon e executar a migração da agenda. A operação de reserva precisa impedir também a sobreposição de serviços com durações diferentes.
- Implementar o painel administrativo com autenticação, bloqueios de horários e feed de calendário privado. Integrar o armazenamento de imagens quando houver catálogo gerenciável.
- Configurar a identidade, os profissionais, os serviços e o WhatsApp da barbearia. Vincular um repositório privado ao projeto Vercel da conta responsável pelo site.
- Trocar a exportação estática por execução no servidor quando o banco e o painel entrarem em operação. O plano Hobby da Vercel é para uso pessoal e não comercial.
