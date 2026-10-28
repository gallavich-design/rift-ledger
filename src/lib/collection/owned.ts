// Cards you already own (pulled, traded, from before) are lots without an order — like pack pulls —
// with this note, so they read "Owned since …" rather than "Bought from …".
export const ALREADY_OWNED_NOTE = "Already owned";

export const isAlreadyOwned = (lot: { orderId: string | null; packOpeningId: string | null; notes: string | null }) => !lot.orderId && !lot.packOpeningId && (lot.notes ?? "").startsWith(ALREADY_OWNED_NOTE);
