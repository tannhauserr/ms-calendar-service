export const keyCache = {
    // Usado en middleware de WEB. Antiguo pero útil todavía porque se usa las WEB PERMITIDAS
    webSecurityUser: 'webSecurityUser',
  
    // Hay que usarlo con un "_" y la fecha actual formateada en YYYT-MM-DD
    // e.g: rbc.old-pk_2000-12-31 - old private key
    ['rbc.old-pk']: 'rbc.old-pk',
}


export type KeyCacheType = keyof typeof keyCache;