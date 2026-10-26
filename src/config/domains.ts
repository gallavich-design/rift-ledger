// One tokens file for Riftbound domain accents (spec §7). Used by chips, stripes and charts.
// Domain names come from Riftcodex /index/domains. Hues approximate the in-game domain icons.
// TODO verify: hues against official Riftbound domain iconography.

export const DOMAIN_COLORS: Record<string, { fg: string; bg: string; solid: string }> = {
  Fury: { solid: "#C8372D", fg: "#9B2219", bg: "#FBEAE8" },
  Calm: { solid: "#2E8B57", fg: "#1D6B41", bg: "#E7F4EC" },
  Mind: { solid: "#2F6BD1", fg: "#1F4FA3", bg: "#E8EFFB" },
  Body: { solid: "#D9781F", fg: "#9A520F", bg: "#FBF0E4" },
  Chaos: { solid: "#7B48C4", fg: "#5E2FA3", bg: "#F1EAFA" },
  Order: { solid: "#C9A019", fg: "#7D6205", bg: "#FAF4DE" },
  Colorless: { solid: "#8A8F98", fg: "#4A4F59", bg: "#F0F0EE" },
};

export const DOMAIN_ORDER = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order", "Colorless"];

export function domainColor(name: string) {
  return DOMAIN_COLORS[name] ?? DOMAIN_COLORS.Colorless;
}
