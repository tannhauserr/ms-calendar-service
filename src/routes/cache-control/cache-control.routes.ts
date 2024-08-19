import express from 'express';
import path from 'path';
import { CacheStaticControlMiddleware } from '../../middlewares/cach-static-control/cache-static-control.middleware';


const router = express.Router();

const ONE_DAY = 86400000; // Segundos en un día

const uploadsPath = path.join(__dirname, '../../../uploads');
router.use('/uploads', CacheStaticControlMiddleware.handleCache(ONE_DAY), express.static(uploadsPath));


module.exports = router;