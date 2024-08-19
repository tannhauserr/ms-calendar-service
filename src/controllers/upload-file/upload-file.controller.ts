import { Response } from "../../models/messages/response";
import { JWTService } from "../../services/jwt/jwt.service";


var multer = require('multer');
var path = require('path')


export class UploadFileController {

    public jwtService: JWTService;

    constructor() {
        this.jwtService = JWTService.instance;

    }

    public uploadFile = async (req: any, res: any, next: any) => {
        try {
            // console.log(req)
            const body = req.body;
            const files = req.files;
            const token = req.token;

            console.log("what is body?", body);
            console.log("Files is...", files);

            // var storage = multer.diskStorage({
            //     destination: function (req, file, cb) {
            //         cb(null, 'uploads/')
            //     },
            //     filename: function (req, file, cb) {
            //         cb(null, Date.now() + path.extname(file.originalname)) //Appending extension
            //     }
            // })

            // var upload = multer({ storage: storage })

            res.status(200).json(Response.build("Archivo subido satisfactoriamente", 200, true, files));


        } catch (err) {
            res.status(200).json(Response.build(err as any, 404, false));
        }
    }

}