type NotificationType =
    "LEAD" |
    "CONVERSATION" |
    "BAN" |
    "QUOTA_REACHED" |
    "OTHER" |
    "ADMINISTRATION"


export class NotificationWhere {
    notificationType: NotificationType = undefined;
    id?: number = undefined;
    title?: string = undefined;
    message?: string = undefined;
    email?: string = undefined;
    replyto?: string = undefined;
    cc?: string = undefined;
    bcc?: string = undefined;
    priority?: number = undefined;
    revised?: number = undefined;
    sent?: number = undefined;
    trying?: number = undefined;
    leadJson?: any = undefined;
    idUserSocialMediaFk?: number = undefined;
    createdDate?: Date = undefined;
    updatedDate?: Date = undefined;
    deletedDate?: Date = undefined;
}