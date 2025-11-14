// src/services/@redis/cache/interfaces/models/client-brief.ts

// export interface ClientBrief {
//   // Client base info
//   id: string;
//   username: string;
//   name?: string;
//   surname1?: string;
//   surname2?: string;
//   email: string;
//   languageType: 'es' | 'en';
//   clientStatusType: 'UNVERIFIED' | 'VERIFIED' | 'INACTIVE';
//   phoneCode?: string;
//   phoneNumber?: string;
//   image?: string;

//   // Variables para el cliente. Tienen un mayor peso que las del admin
//   allowNotifications: boolean;
//   allowEmailNotifications: boolean;
//   allowWhatsappNotifications: boolean;
//   allowSmsNotifications: boolean;
//   allowPushNotifications: boolean;
//   // Variables para el admin de la plataforma
//   noEmailNotifications: boolean;
//   noWhatsappNotifications: boolean;
//   noSmsNotifications: boolean;
//   noPushNotifications: boolean;

//   timeZone: string;

//   // ClientWorkspace info (nested)
//   clientWorkspaces: ClientWorkspaceBrief[];
// }

// export interface ClientWorkspaceBrief {
//   id: string;
//   name: string;
//   surname1?: string;
//   surname2?: string;
//   email?: string;
//   image?: string;
//   phoneCode?: string;
//   phoneNumber?: string;
//   comments?: string;
//   idClientFk?: string;
//   idWorkspaceFk: string;
//   idCompanyFk?: string;

//   // Client reference (will be populated with full client data)
//   client?: ClientBrief;
// }




export interface ClientBrief {
  // Client base info
  id: string;
  username: string;
  name?: string;
  surname1?: string;
  surname2?: string;
  email: string;
  languageType: 'es' | 'en' | 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'zh' | 'ja' | 'ko' | 'ar' | 'hi' | 'bn';
  clientStatusType: 'UNVERIFIED' | 'VERIFIED' | 'INACTIVE';
  phoneCode?: string;
  phoneNumber?: string;
  image?: string;

  // Variables para el cliente. Tienen un mayor peso que las del admin
  allowNotifications?: boolean;
  allowEmailNotifications?: boolean;
  allowWhatsappNotifications?: boolean;
  allowSmsNotifications?: boolean;
  allowPushNotifications?: boolean;

  allowMarketingNotifications?: boolean;
  allowMarketingEmailNotifications?: boolean;
  allowMarketingWhatsappNotifications?: boolean;
  allowMarketingSmsNotifications?: boolean;
  allowMarketingPushNotifications?: boolean;


  timeZone: string;

  // ClientWorkspace info (nested)
  clientWorkspaces: ClientWorkspaceBrief[];
}

export interface ClientWorkspaceBrief {
  id: string;
  name: string;
  surname1?: string;
  surname2?: string;
  email?: string;
  image?: string;
  phoneCode?: string;
  phoneNumber?: string;
  comments?: string;
  idClientFk?: string;
  idWorkspaceFk: string;
  idCompanyFk?: string;

  // Client reference (will be populated with full client data)
  client?: ClientBrief;


  allowNotificationsFromAdmin?: boolean;
  allowEmailNotificationsFromAdmin?: boolean;
  allowWhatsappNotificationsFromAdmin?: boolean;
  allowSmsNotificationsFromAdmin?: boolean;
  allowPushNotificationsFromAdmin?: boolean;

  allowMarketingNotificationsFromAdmin?: boolean;
  allowMarketingEmailNotificationsFromAdmin?: boolean;
  allowMarketingWhatsappNotificationsFromAdmin?: boolean;
  allowMarketingSmsNotificationsFromAdmin?: boolean;
  allowMarketingPushNotificationsFromAdmin?: boolean;
}