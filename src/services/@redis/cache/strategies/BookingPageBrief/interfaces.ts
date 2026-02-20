import { BookingPageBrief } from "../../interfaces/models/booking-brief";

export interface IRedisBookingPageBriefStrategy {
    setBookingPage(page: BookingPageBrief, ttl?: number): Promise<void>;
    getBookingPageById(idBookingPage: string): Promise<BookingPageBrief | null>;
    getBookingPagesByWorkspace(idWorkspace: string): Promise<BookingPageBrief[]>;
    getBookingPageBySlug(idWorkspace: string, slug: string): Promise<BookingPageBrief | null>;
    deleteBookingPage(idBookingPage: string, idWorkspace: string, slug?: string): Promise<void>;
}
