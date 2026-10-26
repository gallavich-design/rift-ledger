// CardVariant.variantKey — the unique identity of a variant.
// Format: "<printing>|<finish>|<language>|<gradingCompany>|<grade>", where <printing> is the
// Riftcodex printing id (or "user:<id>" for variants a person creates by hand).

export interface VariantIdentity {
  sourceId: string | null;
  finish: string;
  language: string;
  gradingCompany?: string | null;
  grade?: string | null;
  fallbackId?: string;
}

export function variantKey(v: VariantIdentity): string {
  const printing = v.sourceId ?? `user:${v.fallbackId ?? ""}`;
  return [printing, v.finish, v.language, v.gradingCompany ?? "", v.grade ?? ""].join("|");
}
