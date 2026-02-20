export type TemporaryHoursMapType = {
    [userId: string]: {
        [date: string]: string[][] | null; // null = día cerrado explícitamente
    };
};
