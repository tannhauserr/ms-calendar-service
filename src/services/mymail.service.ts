
import nodemailer from 'nodemailer';
const NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({
    path: `.env.${NODE_ENV}`
});

export class MailService {

    private host: string;
    private port: string;
    private type: string;
    private user: string;
    private password: string;

    constructor() {
        this.host = process.env.MAIL_HOST ?? "";
        this.port = process.env.MAIL_PORT ?? "";
        this.type = process.env.MAIL_TYPE ?? "";
        this.user = process.env.MAIL_USER ?? "";
        this.password = process.env.MAIL_PASSWORD ?? "";

        this.main().catch(console.error);
    }

    // async..await is not allowed in global scope, must use a wrapper
    async main() {

        let transporter = nodemailer.createTransport({
            host: this.host,
            port: +this.port,
            secure: false, // true for 465, false for other ports
            auth: {
                user: this.user, 
                pass: this.password, 
            },
        });

        // send mail with defined transport object
        let info = await transporter.sendMail({
            from: this.user, 
            to: "segubattle@gmail.com", 
            subject: "Hello ✔", 
            text: "Hola señor, que tal?", 
            html: "<b>Hola señor</b>, <h2>que tal?</h2>", 
        });

        console.log("Message sent: %s", info.messageId);
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    }

}

