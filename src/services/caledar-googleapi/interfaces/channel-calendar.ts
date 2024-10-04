export interface ChannelCalendar {
    type: "web_hook";
    address: string;
    channelId: string;
    expiration: number; // UNIX timestamp en milisegundos
    resourceId: string;
}
