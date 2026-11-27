export const confirmationFields=['cliente','servico','profissional','data','horario','valor','empresa','endereco'] as const;
export type ConfirmationData=Record<typeof confirmationFields[number],string>;
export const defaultConfirmation='Olá, {cliente}! Seu agendamento na {empresa} está confirmado.\n\nServiço: {servico}\nProfissional: {profissional}\nData: {data} às {horario}\nValor: {valor}\nEndereço: {endereco}';

export function renderConfirmation(template:string,fields:ConfirmationData){
  return template.replace(/\{(cliente|servico|profissional|data|horario|valor|empresa|endereco)\}/g,(_,key:keyof ConfirmationData)=>fields[key]);
}

export function whatsappLink(phone:string,template:string,fields:ConfirmationData){
  let digits=phone.replace(/\D/g,'');
  if(digits.startsWith('00'))digits=digits.slice(2);
  if([10,11].includes(digits.length))digits='55'+digits;
  if(!/^[1-9]\d{9,14}$/.test(digits))return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(renderConfirmation(template,fields))}`;
}
