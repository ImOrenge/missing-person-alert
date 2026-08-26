export type PublicDataRole = "admin" | "operator" | "analyst";

export const resolvePublicDataRoles = (claims?: Record<string, unknown> | null): PublicDataRole[] => {
  if (!claims) return [];
  const roles = new Set<PublicDataRole>();
  if (claims.systemAdmin === true || claims.seniorModerator === true) roles.add("admin");
  if (roles.has("admin") || claims.agencyOperator === true) roles.add("operator");
  if (roles.has("operator") || claims.reportModerator === true) roles.add("analyst");
  return [...roles];
};

export const hasPublicDataRole = (
  claims: Record<string, unknown> | null | undefined,
  allowed: PublicDataRole[],
): boolean => resolvePublicDataRoles(claims).some((role) => allowed.includes(role));

export const getHighestPublicDataRole = (claims?: Record<string, unknown> | null): PublicDataRole | null => {
  const roles = resolvePublicDataRoles(claims);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("operator")) return "operator";
  if (roles.includes("analyst")) return "analyst";
  return null;
};
