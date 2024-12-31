import { GetCategoriesAndServicesResponse } from "../../../../../models/rabbitmq/getCateroiesAndServicesResponse";
import { IRedisSavedBasicInformationToCreateReservationByIdEstablishmentStrategy } from "../../interfaces/interfaces";
import { TokenKeys } from "../../keys/token.keys";
import { RedisCacheService } from "../../redis.service";

/**
 * Usado en MS-Chat, MS-Login y MS-Calendar
 */
export class SavedBasicInformationByEstablishmentStrategy implements IRedisSavedBasicInformationToCreateReservationByIdEstablishmentStrategy {

    private redisService = RedisCacheService.instance;

    setSavedBasicInformationToCreateReservationByIdEstablishment(idEstablishment: string, data: GetCategoriesAndServicesResponse, ttl?: number): Promise<void> {
        const key = TokenKeys.savedBasicInformationToCreateReservationByIdEstablishment(idEstablishment);
        let items = JSON.stringify(data);
        return this.redisService.set(key, items, ttl);
    }

    getSavedBasicInformationToCreateReservationByIdEstablishment(idEstablishment: string): Promise<GetCategoriesAndServicesResponse | null> {
        const key = TokenKeys.savedBasicInformationToCreateReservationByIdEstablishment(idEstablishment);
        return this.redisService.get(key).then((data) => {
            if (data) {
                return JSON.parse(data);
            }
            return null;
        });
    }

    deleteSavedBasicInformationToCreateReservationByIdEstablishment(idEstablishment: string): Promise<number> {
        const key = TokenKeys.savedBasicInformationToCreateReservationByIdEstablishment(idEstablishment);
        return this.redisService.delete(key);
    }



}