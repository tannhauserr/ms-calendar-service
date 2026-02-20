import { UserBrief } from "../../interfaces/models/user-brief";

export interface IRedisUserBriefStrategy {
    setUser(user: UserBrief, ttl?: number): Promise<void>;
    getUserById(userId: string): Promise<UserBrief | null>;
    getUserByEmail(email: string): Promise<UserBrief | null>;
    deleteUser(userId: string, email: string): Promise<void>;
}
