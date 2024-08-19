import { Request, Response, NextFunction } from "express";

export class PromotionMiddleware {

    /**
     * Controla que la promoción sea válida en el tiempo. Si es antigua no se puede borrar.
     * Es para propósitos de historial.
     * @param req 
     * @param res 
     * @param next 
     * @returns 
     */
    static controlPromotionUnaviable_UPDATE_PAGE = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { promotion } = req.body;

            if (!promotion) {
                return res.status(200).json({
                    message: "Promotion is required"
                });
            }

            const { validFromDate, validUntilDate } = promotion;

            if (!validFromDate || !validUntilDate) {
                return res.status(200).json({
                    message: "validFromDate and validUntilDate are required"
                });
            }

            const currentDate = new Date();
            const fromDate = new Date(promotion.validFromDate);
            const untilDate = new Date(promotion.validUntilDate);

            if (currentDate > untilDate) {
                return res.status(200).json({
                    message: "Promotion is unaviable"
                });
            }
            next();
        } catch (e) {
            res.status(500).send({
                message: 'A error has occurred while trying to store the identity',
                error: e instanceof Error ? e.message : 'Unknown error'
            });
        }


    }

}