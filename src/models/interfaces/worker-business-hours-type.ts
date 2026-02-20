export type WorkerHoursMapType = {
    [userId: string]: {
        [weekday: string]: any[][] | null; // Por ejemplo, 'MONDAY': [['10:00', '13:00'], ['14:00', '16:00']]
    };
};
