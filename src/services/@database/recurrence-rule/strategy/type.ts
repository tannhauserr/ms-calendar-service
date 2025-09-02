// src/services/recurrence-rule/strategy/types.ts
import { PrismaClient } from "@prisma/client";
import { EventForBackend } from "../../event/dto/EventForBackend";
import { RRule } from "rrule";

/**
 * Cantidad por defecto de repeticiones que se generan al actualizar una regla.
 * Se lee de la variable de entorno DEFAULT_RECURRENCE_COUNT (fallback a 15).
 */
export const DEFAULT_RECURRENCE_COUNT = Number.isInteger(
    Number(process.env.DEFAULT_RECURRENCE_COUNT)
)
    ? Number(process.env.DEFAULT_RECURRENCE_COUNT)
    : 15;

/**
 * Límite máximo de repeticiones permitidas al actualizar una regla.
 * Se lee de la variable de entorno MAX_RECURRENCE_COUNT (fallback a 50).
 */
export const MAX_RECURRENCE_COUNT = Number.isInteger(
    Number(process.env.MAX_RECURRENCE_COUNT)
)
    ? Number(process.env.MAX_RECURRENCE_COUNT)
    : 50;

/**
 * Valida si la cadena rrule es un RRule válido.
 */
export function isValidRRule(rrule?: string): boolean {
    if (!rrule) return false;
    try {
        RRule.parseString(rrule);
        return true;
    } catch {
        return false;
    }
}

/**
 * Intenta parsear un string a Date:
 * - Si es formato ISO, lo convierte directamente.
 * - Si es 'YYYYMMDD', construye la fecha respectiva.
 * - Si no, devuelve null.
 */
export function parseDateString(dateStr: string): Date | null {
    // ISO-like
    if (/\d{4}-\d{2}-\d{2}T/.test(dateStr) || dateStr.includes("-")) {
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    }
    // YYYYMMDD
    if (/^\d{8}$/.test(dateStr)) {
        const year = Number(dateStr.slice(0, 4));
        const month = Number(dateStr.slice(4, 6)) - 1;
        const day = Number(dateStr.slice(6, 8));
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? null : d;
    }
    // fallback genérico
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Parsea y filtra un array de rdates (ISO o YYYYMMDD) a objetos Date válidos.
 */
export function getValidRDates(rdates?: string[]): Date[] {
    if (!Array.isArray(rdates)) return [];
    return rdates
        .map(parseDateString)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Decide si, dada la recurrencia, se debe usar la estrategia de ventana
 * en lugar de la estrategia de background.
 */
export function shouldUseWindowStrategy(
    payload: EventForBackend
): boolean {
    const rule = payload.recurrenceRuleUpdate ?? payload.recurrenceRule;
    // Usar ventana solo si hay rdates válidas
    return getValidRDates(rule?.rdates).length > 0;
}

/**
 * Obtiene las fechas de recurrencia válidas:
 * - Primero valida y usa rdates
 * - Si no hay rdates válidas, y rrule es válido, genera con RRule
 * - Se limita a DEFAULT_RECURRENCE_COUNT o amountMax y MAX_RECURRENCE_COUNT
 */
export function getRecurrenceDates(
    payload: EventForBackend,
    amountMax?: number
): Date[] {
    const raw = Number(amountMax);
    const validated = Number.isInteger(raw) && raw > 0
        ? raw
        : DEFAULT_RECURRENCE_COUNT;
    const limit = Math.min(MAX_RECURRENCE_COUNT, validated);

    const rule = payload.recurrenceRuleUpdate ?? payload.recurrenceRule;
    if (!rule) return [];

    // 1) Intentar rdates
    const rdates = getValidRDates(rule.rdates);
    if (rdates.length > 0) {
        return rdates.slice(0, limit);
    }

    // 2) Fallback a rrule
    if (isValidRRule(rule.rrule)) {
        const opts: any = RRule.parseString(rule.rrule!);
        if (rule.dtstart) {
            opts.dtstart = new Date(rule.dtstart);
        }
        if (rule.tzid) {
            opts.tzid = rule.tzid;
        }
        opts.count = limit;
        return new RRule(opts).all();
    }

    return [];
}

export interface RecurrenceStrategy {
    handleImmediate(
        payload: EventForBackend,
        tx: PrismaClient
    ): Promise<string>;

    /** Reasigna / recrea el resto de instancias (futuras) */
    handleBackground(
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId?: string,
        newRuleId?: string,
        amountMax?: number
    ): Promise<void>;

    /**
     * Genera (o actualiza) las instancias dentro de un rango arbitrario,
     * usando el idRecurrenceRuleFk para enlazar cada evento.
     * 
     * @param payload      — contiene el EventForBackend y sus participantes
     * @param prisma       — cliente Prisma en tx o standalone
     * @param oldRuleId    — ID de la regla original (si aplica)
     * @param newRuleId    — ID de la regla sobre la que operar
     * @param amountMax    — opcional: límite de instancias a generar
     */
    handleWindow?(
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId?: string,
        newRuleId?: string,
        amountMax?: number
    ): Promise<void>;
}
export interface RecurrenceStrategy {
    handleImmediate(
        payload: EventForBackend,
        tx: PrismaClient
    ): Promise<string>;

    /** Reasigna / recrea el resto de instancias (futuras) */
    handleBackground(
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId?: string,
        newRuleId?: string,
        amountMax?: number
    ): Promise<void>;

    /**
     * Genera (o actualiza) las instancias dentro de un rango arbitrario,
     * usando el idRecurrenceRuleFk para enlazar cada evento.
     * 
     * @param payload      — contiene el EventForBackend y sus participantes
     * @param prisma       — cliente Prisma en tx o standalone
     * @param oldRuleId    — ID de la regla original (si aplica)
     * @param newRuleId    — ID de la regla sobre la que operar
     * @param amountMax    — opcional: límite de instancias a generar
     */
    handleWindow?(
        payload: EventForBackend,
        prisma: PrismaClient,
        oldRuleId?: string,
        newRuleId?: string,
        amountMax?: number
    ): Promise<void>;
}
