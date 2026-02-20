import { Router } from 'express';
import type { Request } from "express";
import { UploadFileController } from '../../controllers/upload-file/upload-file.controller';
import multer from "multer";
import fs from 'fs'

// const upload = multer({ dest: "uploads/" });

const uploadFileController = new UploadFileController();
const router = Router();

const storage = multer.diskStorage({
    destination: function (req: Request, _file: any, cb: (error: Error | null, destination: string) => void) {
        console.log("que es directories", req.body)
        console.log("que es directories", req.body)
        console.log("que es directories", req.body)

        if (req.body.directories) {
            let directories = JSON.parse(req.body.directories);
            const path = `${directories}`.replace(/,/g, "/");
            console.log(path)
            fs.mkdirSync('uploads/' + path, { recursive: true })
            cb(null, 'uploads/' + path)
        } else {
            console.log("que es directorie2222s", req.body)
            cb(null, 'uploads/')
        }
    },
    filename: function (_req: Request, file: any, cb: (error: Error | null, filename: string) => void) {
        // cb(null, Date.now() + path.extname(file.originalname))
        cb(null, file.originalname)

    }
})

const upload = multer({ storage: storage });

// Configura la ruta estática para los archivos en la carpeta 'uploads'

router.post('/upload-file', upload.array("file"), uploadFileController.uploadFile);

// router.get('/', userController.verifyTokenFromApiCloud);

module.exports = router;
