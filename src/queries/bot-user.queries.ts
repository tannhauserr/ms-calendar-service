export class BotUserQuery {

    static readonly GET_ALL = `SELECT * FROM ngbot_user`;
    static readonly GET_BY_ID = `SELECT * FROM ngbot_user WHERE id = ?`;
    static readonly GET_BY_ID_USER_PLATFORM_AND_PLATFORM = `SELECT * FROM ngbot_user WHERE iduserplatform = ? && platform = ?`;
    static readonly GET_BY_NICKNAME = `SELECT * FROM ngbot_user WHERE nickname = ?`;
    static readonly ADD = `INSERT INTO ngbot_user SET ?`;

}