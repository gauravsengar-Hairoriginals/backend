export enum UserRole {
    // Top Management
    SUPER_ADMIN = 'SUPER_ADMIN',
    CEO = 'CEO',
    CTO = 'CTO',
    COO = 'COO',

    // Department Heads
    HEAD_ONLINE_SALES = 'HEAD_ONLINE_SALES',
    HEAD_STYLIST_LOYALTY = 'HEAD_STYLIST_LOYALTY',
    HEAD_FIELD_FORCE = 'HEAD_FIELD_FORCE',
    HEAD_EXPERIENCE_CENTER = 'HEAD_EXPERIENCE_CENTER',

    // Team Leads
    SALES_TEAM_LEAD = 'SALES_TEAM_LEAD',
    VIDEO_CALLING_TEAM_LEAD = 'VIDEO_CALLING_TEAM_LEAD',
    FIELD_FORCE_TEAM_LEAD = 'FIELD_FORCE_TEAM_LEAD',
    EC_MANAGER = 'EC_MANAGER',

    // Staff
    SALES_EXECUTIVE = 'SALES_EXECUTIVE',
    VIDEO_CALLING_AGENT = 'VIDEO_CALLING_AGENT',
    FIELD_AGENT = 'FIELD_AGENT',
    EC_STAFF = 'EC_STAFF',

    // External
    STYLIST = 'STYLIST',
}

// Role hierarchy for permission checks
export const ADMIN_ROLES = [
    UserRole.SUPER_ADMIN,
    UserRole.CEO,
    UserRole.CTO,
    UserRole.COO,
];

export const HEAD_ROLES = [
    ...ADMIN_ROLES,
    UserRole.HEAD_ONLINE_SALES,
    UserRole.HEAD_STYLIST_LOYALTY,
    UserRole.HEAD_FIELD_FORCE,
    UserRole.HEAD_EXPERIENCE_CENTER,
];

export const TEAM_LEAD_ROLES = [
    ...HEAD_ROLES,
    UserRole.SALES_TEAM_LEAD,
    UserRole.VIDEO_CALLING_TEAM_LEAD,
    UserRole.FIELD_FORCE_TEAM_LEAD,
    UserRole.EC_MANAGER,
];
