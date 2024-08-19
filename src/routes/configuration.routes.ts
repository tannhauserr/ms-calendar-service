import { Router } from 'express';
import { JWTService } from '../services/jwt/jwt.service';

import { ConfigurationController } from '../controllers/configuration/configuration.controller';

const controller = new ConfigurationController();

const router = Router();



module.exports = router;