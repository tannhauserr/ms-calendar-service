
import { JWTService } from "../../services/jwt/jwt.service";

export class AuthController {

    public jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;
    }

    login = async (req, res) => {
        try {

            const { id, username, email, role, image } = req.user;

            const tokenPayload = {
                idUser: id,
                // username,
                email,
                role: role?.roleType || "ROLE_ERROR",
                avatar: image
            };
            const expiresIn: number = Number(process.env.EXPIRES_TOKEN_AND_JWT)// un día es 86400;
            const token = await this.jwtService.sign(tokenPayload, expiresIn);

            req.token = token;
            req.tokenPayload = tokenPayload;
            this.getTokens(req, res);
        } catch (err) {
            console.error(err)
            res.status(500).json({ message: "Hubo un error al enviar el token" });
        }
    }

    // TODO: Hay que prepararlo para WEB 
    // register = async (req, res) => {
    //     try {
    //         const { email, password } = req.body;
    //         const user = {
    //             email,
    //             password
    //         };
    //         const token = await this.jwtService.sign(user);
    //         req.token = token;
    //         this.getTokens(req, res);
    //     } catch (err) {
    //         console.error(err)
    //         res.status(500).json({ message: "Hubo un error al enviar el token" });
    //     }
    // }

    getTokens = async (req, res) => {
        try {
            const token = req.token;
            const tokenPayload = req.tokenPayload;

            // Un día es 86400
            const expiresIn: number = Number(process.env.EXPIRES_TOKEN_AND_JWT) || 86400;
            // El tiempo tiene que ser dado en segundos, por eso se multiplica por 1000
            const timeInMiliseconds = expiresIn * 1000;


            res.cookie('booking.rbc.token', token, { httpOnly: true, secure: true, maxAge: timeInMiliseconds, sameSite: 'none' });
            res.status(200).json({
                message: "Token enviado", ok: true, item: {
                    token,
                    user: tokenPayload
                }
            });
        } catch (err) {
            console.error(err)
            res.status(500).json({ message: "Hubo un error al enviar el token", ok: false });
        }
    }

}