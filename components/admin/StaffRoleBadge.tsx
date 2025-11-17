import React from "react";

type Props = {
  staff: {
    id: string;
    role: string;
    display_name?: string | null;
  };
};

/**
 * Badge affiché dans le header admin :
 * "Connecté en tant que [role]"
 *
 * Le style suit le thème admin sombre.
 */

export function StaffRoleBadge({ staff }: Props) {
  const roleLabel = roleToLabel(staff.role);

  return (
    <div className="flex items-center gap-2 bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded-lg text-sm text-neutral-300">
      <span className="text-neutral-400">Connecté en tant que :</span>
      <span className="font-semibold text-white">{roleLabel}</span>
    </div>
  );
}

/**
 * Conversion role → label lisible
 * (si tu veux un mapping plus complet, dis-moi)
 */
function roleToLabel(role: string): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    case "referee":
      return "Arbitre";
    case "helper":
      return "Staff Support";
    case "viewer":
      return "Lecteur";
    default:
      return role;
  }
}
