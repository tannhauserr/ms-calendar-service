export type UpdateFlow = "pure-class-edit" | "fast-path-single" | "rebuild-booking";

export type UpdateFlowContext = {
    isPureClassEdit: boolean;
    fastPathSingle: boolean;
};

export type UpdateFlowExecutors<T> = {
    runPureClassEdit: () => Promise<T>;
    runFastPathSingle: () => Promise<T>;
    runRebuildBooking: () => Promise<T>;
};
