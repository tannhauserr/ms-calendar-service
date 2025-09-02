// src/services/recurrence-rule/strategy/factory.ts

import { ThisStrategy } from './this.strategy';
import { FutureStrategy } from './future.strategy';
import { AllStrategy } from './all.strategy';
import { RecurrenceScope } from '../types';
import { RecurrenceStrategy } from './type';
import { NewStrategy } from './new.strategy';

export class RecurrenceStrategyFactory {
    static get(scope: RecurrenceScope): RecurrenceStrategy {
        switch (scope) {
            case "THIS":
                return new ThisStrategy();
            case "FUTURE":
                return new FutureStrategy();
            case "ALL":
                return new AllStrategy();
            case "NEW":
                return new NewStrategy();
            default:
                const _exhaustive: never = scope;
                throw new Error(`Scope desconocido: ${_exhaustive}`);
        }
    }
}
