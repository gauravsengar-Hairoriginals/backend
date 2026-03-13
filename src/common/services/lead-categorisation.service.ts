import { Injectable } from '@nestjs/common';
import { CallerRegion } from '../../modules/users/enums/caller-region.enum';
import { CallerCategory } from '../../modules/users/enums/caller-category.enum';

// ── City → Region ─────────────────────────────────────────────────────────────
const DELHI_NCR_CITIES = ['delhi', 'noida', 'gurugram', 'gurgaon', 'ghaziabad', 'faridabad', 'greater noida'];
const HYDERABAD_CITIES = ['hyderabad', 'secunderabad', 'cyberabad'];
const MUMBAI_CITIES    = ['mumbai', 'thane', 'navi mumbai', 'kalyan', 'dombivli'];

/** Map lead category string → CallerCategory that handles it */
export const LEAD_CAT_TO_CALLER_CAT: Record<string, CallerCategory> = {
    EC:      CallerCategory.EC_CALLER,
    HT:      CallerCategory.HT_CALLER,
    WEBSITE: CallerCategory.WEBSITE_CALLER,
    POPIN:   CallerCategory.POPIN_CALLER,
};

@Injectable()
export class LeadCategorisationService {
    /**
     * Derive a lead category from its source and pageType strings.
     * Returns 'EC' | 'HT' | 'POPIN' | 'WEBSITE'.
     * If `existingCategory` is already set (non-null / non-empty), returns it
     * unchanged — the categorisation logic is skipped.
     */
    deriveLeadCategory(
        source?: string,
        pageType?: string,
        existingCategory?: string | null,
    ): string {
        if (existingCategory) return existingCategory;

        const haystack = `${source ?? ''} ${pageType ?? ''}`.toLowerCase();
        if (haystack.includes('ec'))                                          return 'EC';
        if (haystack.includes('ht'))                                          return 'HT';
        if ((source ?? '').toLowerCase() === 'popins' || haystack.includes('popin')) return 'POPIN';
        return 'WEBSITE';
    }

    /** Map a city name to its CallerRegion. */
    cityToRegion(city?: string): CallerRegion {
        if (!city) return CallerRegion.REST_OF_INDIA;
        const lower = city.toLowerCase();
        if (DELHI_NCR_CITIES.some(c => lower.includes(c))) return CallerRegion.DELHI_NCR;
        if (HYDERABAD_CITIES.some(c => lower.includes(c))) return CallerRegion.HYDERABAD;
        if (MUMBAI_CITIES.some(c => lower.includes(c)))    return CallerRegion.MUMBAI;
        return CallerRegion.REST_OF_INDIA;
    }

    /** Resolve the CallerCategory that handles a given lead category string. */
    callerCategoryFor(leadCategory: string): CallerCategory | undefined {
        return LEAD_CAT_TO_CALLER_CAT[leadCategory];
    }
}
