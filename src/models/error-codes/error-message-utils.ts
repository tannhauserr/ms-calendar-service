export const withCatalogMessage = (catalogMessage: string, detail?: string): string => {
    const base = (catalogMessage ?? "").trim();
    const extra = (detail ?? "").trim();

    if (!base) return extra;
    if (!extra) return base;
    return `${base} ${extra}`;
};
