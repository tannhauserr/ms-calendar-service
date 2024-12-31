export type TemporaryHoursMapType = {
    [userId: string]: {
        [date: string]: string[][]; // Por ejemplo, 'MONDAY': [['10:00', '13:00'], ['14:00', '16:00']]
    };
};