export enum SalonStage {
    APPROACH = 'APPROACH',
    OWNER_READY = 'OWNER_READY',
    UNDER_ACTIVATION = 'UNDER_ACTIVATION',
    ACTIVATED = 'ACTIVATED',
    CLOSED = 'CLOSED',
}

/**
 * Defines the required checklist items for each stage.
 * All items must be true before the salon can advance to the next stage.
 */
export const STAGE_CHECKLIST_ITEMS: Record<SalonStage, string[]> = {
    [SalonStage.APPROACH]: [
        'address_filled',
        'owner_details_filled',
        'services_filled',
    ],
    [SalonStage.OWNER_READY]: [
        'stylists_added',
        'photos_uploaded',
        'owner_account_activated',
    ],
    [SalonStage.UNDER_ACTIVATION]: [
        'product_demo',
        'branding_material_sent',
        'display_ready',
        'app_training_given',
    ],
    [SalonStage.ACTIVATED]: [],
    [SalonStage.CLOSED]: [],
};

/**
 * Human-readable labels for checklist items.
 */
export const CHECKLIST_LABELS: Record<string, string> = {
    address_filled: 'Address filled',
    owner_details_filled: 'Owner name & phone filled',
    services_filled: 'Services offered filled',
    stylists_added: 'Stylist details added on app',
    photos_uploaded: 'Salon photos & details uploaded',
    owner_account_activated: 'Owner account activated',
    product_demo: 'Product demo completed',
    branding_material_sent: 'Branding material sent',
    display_ready: 'Display ready',
    app_training_given: 'App downloaded & training given to stylists',
};

/**
 * Stage ordering for determining next stage.
 */
export const STAGE_ORDER: SalonStage[] = [
    SalonStage.APPROACH,
    SalonStage.OWNER_READY,
    SalonStage.UNDER_ACTIVATION,
    SalonStage.ACTIVATED,
    SalonStage.CLOSED,
];
