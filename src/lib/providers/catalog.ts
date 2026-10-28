// The card-data source the app syncs from: Riftcodex, plus TCGplayer for any set Riftcodex hasn't
// added yet. A fresh instance per sync, so each run sees current data.
import { riftcodex } from "./riftcodex";
import { withTcgplayerFallback } from "./tcgplayerCards";

export const catalogProvider = () => withTcgplayerFallback(riftcodex);
