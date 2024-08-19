export class BotTalkQuery {

    static readonly ADD = `INSERT INTO ngbot_talk SET ?`;
    /**
     * Devuelve el último registro relacionado con un usuario y que haya pasado
     * menos de X minutos del último mensaje escrito
     */
    static readonly GET_BY_ID_USER_FK = `SELECT * FROM ngbot_talk WHERE iduserfk = ? && timestampdiff(minute,lastmessagedate, NOW()) <= ? && finished = false ORDER BY lastmessagedate DESC LIMIT 0,1`;
    static readonly UPDATE = `UPDATE ngbot_talk SET ? WHERE id = ?`;
    static readonly IS_TIME_LIMIT = `SELECT * FROM (SELECT * FROM ngbot_talk ORDER by id DESC LIMIT 0,1) as select_interno WHERE iduserfk = ? && timestampdiff(minute,lastmessagedate, NOW()) >= ? ORDER BY lastmessagedate DESC LIMIT 0,1`;
  

}