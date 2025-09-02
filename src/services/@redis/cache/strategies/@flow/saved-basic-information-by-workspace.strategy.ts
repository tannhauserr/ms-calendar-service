import { GetCategoriesAndServicesResponse } from "../../../../../models/rabbitmq/getCateroiesAndServicesResponse";
import { IRedisSavedBasicInformationToCreateReservationByIdWorkspaceStrategy } from "../../interfaces/interfaces";
import { TokenKeys } from "../../keys/token.keys";
import { RedisCacheService } from "../../redis.service";

/**
 * Usado en MS-Chat, MS-Login y MS-Calendar
 */
export class SavedBasicInformationByWorkspaceStrategy implements IRedisSavedBasicInformationToCreateReservationByIdWorkspaceStrategy {

    private redisService = RedisCacheService.instance;

    setSavedBasicInformationToCreateReservationByIdWorkspace(idWorkspace: string, data: GetCategoriesAndServicesResponse, ttl?: number): Promise<void> {
        const key = TokenKeys.savedBasicInformationToCreateReservationByIdWorkspace(idWorkspace);
        let items = JSON.stringify(data);
        return this.redisService.set(key, items, ttl);
    }

    getSavedBasicInformationToCreateReservationByIdWorkspace(idWorkspace: string): Promise<GetCategoriesAndServicesResponse | null> {
        const key = TokenKeys.savedBasicInformationToCreateReservationByIdWorkspace(idWorkspace);
        return this.redisService.get(key).then((data) => {
            if (data) {
                return JSON.parse(data);
            }
            return null;
        });
    }

    deleteSavedBasicInformationToCreateReservationByIdWorkspace(idWorkspace: string): Promise<number> {
        const key = TokenKeys.savedBasicInformationToCreateReservationByIdWorkspace(idWorkspace);
        return this.redisService.delete(key);
    }



}