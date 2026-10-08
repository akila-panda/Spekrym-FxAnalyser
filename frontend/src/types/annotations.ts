import { KNOWN_ROLES, type Annotation } from "./schemas";

export type { Annotation, AnnotationKind, Tone } from "./schemas";
export { KNOWN_ROLES, TONES } from "./schemas";

export type KnownRole = (typeof KNOWN_ROLES)[number];

export function isKnownRole(role: string): role is KnownRole {
  return (KNOWN_ROLES as readonly string[]).includes(role);
}

/** Narrow the union by kind. */
export type AnnotationOf<K extends Annotation["kind"]> = Extract<Annotation, { kind: K }>;