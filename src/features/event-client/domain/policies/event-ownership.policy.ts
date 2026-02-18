type ParticipantIdentity = {
    idClientFk?: string | null;
    idClientWorkspaceFk?: string | null;
};

type CustomerIdentity = {
    id: string;
    idClientWorkspace: string;
};

/**
 * Regla que valida si el cliente pertenece al evento objetivo.
 */
export class EventOwnershipPolicy {
    /**
     * Devuelve true cuando el cliente aparece como participante del evento.
     */
    public static isOwner(participants: ParticipantIdentity[], customer: CustomerIdentity): boolean {
        return participants.some(
            (participant) =>
                participant.idClientFk === customer.id ||
                participant.idClientWorkspaceFk === customer.idClientWorkspace
        );
    }
}
