export const defaults = {
  enable_online_booking: true,
  enable_multi_professionals: true,
  enable_professional_limit: true,
  enable_products_store: true,
  enable_shopping_cart: true,
  enable_commissions: true,
  enable_loyalty_club: true,
  enable_google_calendar: false,
  enable_manual_whatsapp_confirmation: true,
  enable_site_customizer: true,
  enable_client_cancellation: true,
  enable_manual_booking: true,
  enable_reports: true,
};

export type Feature = keyof typeof defaults;
export type Flags = typeof defaults;
export const featureNames = Object.keys(defaults) as Feature[];
export const featureLabels: Record<Feature, string> = {
  enable_online_booking: 'Agendamento público',
  enable_multi_professionals: 'Equipe com vários profissionais',
  enable_professional_limit: 'Limite de profissionais',
  enable_products_store: 'Catálogo de produtos',
  enable_shopping_cart: 'Carrinho e pedidos online',
  enable_commissions: 'Comissões da equipe',
  enable_loyalty_club: 'Clube fidelidade',
  enable_google_calendar: 'Integração Google Agenda',
  enable_manual_whatsapp_confirmation: 'Confirmação manual pelo WhatsApp',
  enable_site_customizer: 'Editor da vitrine',
  enable_client_cancellation: 'Cancelamento pelo cliente',
  enable_manual_booking: 'Encaixes manuais',
  enable_reports: 'Relatórios financeiros',
};

export const statuses = ['PENDENTE', 'CONFIRMADO', 'EM_ATENDIMENTO', 'CONCLUIDO', 'CANCELADO', 'NO_SHOW'] as const;
export type Status = typeof statuses[number];
export type Role = 'SUPER_ADMIN' | 'OWNER' | 'STAFF' | 'CLIENT';
export const sections = ['about', 'services', 'products', 'team', 'hours'] as const;
export const backgrounds = ['home', 'services', 'products', 'loyalty'] as const;
export type Site = {
  logo: string; primary: string; secondary: string; banner: string; headline: string; bio: string;
  address: string; whatsapp: string; instagram: string; sections: Record<typeof sections[number], boolean>;
  backgrounds: Record<typeof backgrounds[number], string>; favicon: string;
  slides:string[];address_full:string;latitude:number|null;longitude:number|null;street_view_heading:number;
};
export const defaultSite: Site = {
  logo: '', primary: '#17231c', secondary: '#d6ed99', banner: '', headline: '', bio: '', address: '', whatsapp: '', instagram: '',
  sections: { about: true, services: true, products: true, team: true, hours: true },
  backgrounds: { home: '', services: '', products: '', loyalty: '' }, favicon: '',
  slides:[],address_full:'',latitude:null,longitude:null,street_view_heading:0,
};
