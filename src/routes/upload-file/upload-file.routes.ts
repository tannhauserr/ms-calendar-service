import { Router } from 'express';
import { UploadFileController } from '../../controllers/upload-file/upload-file.controller';



const uploadFileController = new UploadFileController();
const router = Router();

var multer = require('multer');
var path = require('path')
import fs from 'fs'

// const upload = multer({ dest: "uploads/" });


var storage = multer.diskStorage({
    destination: function (req, file, cb) {
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
    filename: function (req, file, cb) {
        // cb(null, Date.now() + path.extname(file.originalname))
        cb(null, file.originalname)

    }
})

const upload = multer({ storage: storage });

// Configura la ruta estática para los archivos en la carpeta 'uploads'

router.post('/upload-file', upload.array("file"), uploadFileController.uploadFile);

// router.get('/', userController.verifyTokenFromApiCloud);

module.exports = router;