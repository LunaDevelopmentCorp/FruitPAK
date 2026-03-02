"""Granular permission system for FruitPAK RBAC.

Design:
  - Each role has a set of DEFAULT permissions (defined here, not in DB).
  - Admins can grant/revoke individual permissions per user via
    `User.custom_permissions` (a JSON dict of {perm: True/False} overrides).
  - `resolve_permissions(role, custom_permissions)` computes the effective
    permission set for a given user.
  - The effective set is embedded in the JWT so most checks are token-only
    (no DB roundtrip).

Permission naming: `<resource>.<action>`
  Resources: enterprise, users, packhouse, grower, lot, pallet,
             storage, export, financials, reports
  Actions:   read, write, delete, manage
"""

from __future__ import annotations


# ── All known permissions ───────────────────────────────────

ALL_PERMISSIONS: set[str] = {
    # Platform-level (super-admin only)
    "platform.manage",        # manage all enterprises, cross-tenant access
    "platform.impersonate",   # log in as any user for troubleshooting

    # Enterprise-level
    "enterprise.manage",      # edit enterprise settings, billing
    "enterprise.delete",      # delete enterprise (superadmin)

    # User management
    "users.read",             # view user list
    "users.write",            # create / edit users
    "users.delete",           # deactivate / remove users

    # Role management
    "roles.read",             # view custom role templates
    "roles.manage",           # create / edit / delete role templates

    # Packhouse
    "packhouse.read",
    "packhouse.write",
    "packhouse.delete",

    # Grower / Supplier
    "grower.read",
    "grower.write",
    "grower.delete",

    # Batch / GRN intake
    "batch.read",
    "batch.write",
    "batch.delete",

    # Lot
    "lot.read",
    "lot.write",
    "lot.delete",

    # Pallet / Container
    "pallet.read",
    "pallet.write",
    "pallet.delete",

    # Cold storage
    "storage.read",
    "storage.write",

    # Export
    "export.read",
    "export.write",
    "export.delete",

    # Financials (strictly restricted)
    "financials.read",
    "financials.write",

    # Reports & dashboards
    "reports.read",
    "reports.export",
}


# ── Permission groups (for the UI matrix) ─────────────────────

PERMISSION_GROUPS: dict[str, list[str]] = {
    "Platform": ["platform.manage", "platform.impersonate"],
    "Enterprise": ["enterprise.manage", "enterprise.delete"],
    "Users": ["users.read", "users.write", "users.delete"],
    "Roles": ["roles.read", "roles.manage"],
    "Packhouse": ["packhouse.read", "packhouse.write", "packhouse.delete"],
    "Grower / Supplier": ["grower.read", "grower.write", "grower.delete"],
    "Batch / GRN": ["batch.read", "batch.write", "batch.delete"],
    "Lot": ["lot.read", "lot.write", "lot.delete"],
    "Pallet / Container": ["pallet.read", "pallet.write", "pallet.delete"],
    "Cold Storage": ["storage.read", "storage.write"],
    "Export": ["export.read", "export.write", "export.delete"],
    "Financials": ["financials.read", "financials.write"],
    "Reports": ["reports.read", "reports.export"],
}


# ── Role → default permissions ──────────────────────────────

ROLE_DEFAULTS: dict[str, set[str]] = {
    "platform_admin": ALL_PERMISSIONS.copy(),

    "administrator": ALL_PERMISSIONS - {"platform.manage", "platform.impersonate"},

    "supervisor": {
        "users.read",
        "packhouse.read", "packhouse.write",
        "grower.read", "grower.write",
        "batch.read", "batch.write",
        "lot.read", "lot.write",
        "pallet.read", "pallet.write",
        "storage.read", "storage.write",
        "export.read", "export.write",
        "reports.read", "reports.export",
    },

    "operator": {
        "packhouse.read",
        "grower.read",
        "batch.read", "batch.write",
        "lot.read", "lot.write",
        "pallet.read", "pallet.write",
        "storage.read",
    },
}


# ── Resolution ──────────────────────────────────────────────

def resolve_permissions(
    role: str,
    custom_role_permissions: list[str] | None = None,
    custom_overrides: dict[str, bool] | None = None,
) -> list[str]:
    """Compute effective permissions for a user.

    1. If a custom role template is assigned, use its permission set as the base.
       Otherwise, start with the built-in role's defaults.
    2. Apply custom_overrides: {perm: True} adds, {perm: False} removes.
    3. Return a sorted list (for stable JWT claims).
    """
    if custom_role_permissions is not None:
        base = {p for p in custom_role_permissions if p in ALL_PERMISSIONS}
    else:
        base = ROLE_DEFAULTS.get(role, set()).copy()

    if custom_overrides:
        for perm, granted in custom_overrides.items():
            if perm not in ALL_PERMISSIONS:
                continue  # ignore unknown permissions
            if granted:
                base.add(perm)
            else:
                base.discard(perm)

    return sorted(base)


def has_permission(user_permissions: list[str] | set[str], required: str) -> bool:
    """Check whether a permission set satisfies a requirement."""
    return required in user_permissions
