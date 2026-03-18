import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallerCategory } from '../../modules/users/enums/caller-category.enum';
import { CityRegion } from '../../modules/admin/entities/city-region.entity';

/** Map lead category string → CallerCategory that handles it */
export const LEAD_CAT_TO_CALLER_CAT: Record<string, CallerCategory> = {
    EC:      CallerCategory.EC_CALLER,
    HT:      CallerCategory.HT_CALLER,
    WEBSITE: CallerCategory.WEBSITE_CALLER,
    POPIN:   CallerCategory.POPIN_CALLER,
};

const CACHE_TTL_MS = 30_000; // 30 seconds

@Injectable()
export class LeadCategorisationService {
    private _cachedRegions: CityRegion[] | null = null;
    private _cacheExpiresAt = 0;

    constructor(
        @InjectRepository(CityRegion)
        private readonly cityRegionRepo: Repository<CityRegion>,
    ) {}

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

    /** Map a city name to its CallerRegion code (from DB, with 30s cache). */
    async cityToRegion(city?: string): Promise<string> {
        if (!city) return 'REST_OF_INDIA';
        const lower = city.toLowerCase();

        const regions = await this.getRegions();

        // Match all regions except REST_OF_INDIA first
        for (const region of regions) {
            if (region.regionCode === 'REST_OF_INDIA') continue;
            if (region.cities.some(c => lower.includes(c))) {
                return region.regionCode;
            }
        }

        return 'REST_OF_INDIA';
    }

    /** Resolve the CallerCategory that handles a given lead category string. */
    callerCategoryFor(leadCategory: string): CallerCategory | undefined {
        return LEAD_CAT_TO_CALLER_CAT[leadCategory];
    }

    private async getRegions(): Promise<CityRegion[]> {
        const now = Date.now();
        if (this._cachedRegions && now < this._cacheExpiresAt) {
            return this._cachedRegions;
        }
        this._cachedRegions = await this.cityRegionRepo.find({ where: { isActive: true } });
        this._cacheExpiresAt = now + CACHE_TTL_MS;
        return this._cachedRegions;
    }

    /** Call this after saving a city region to force cache refresh */
    invalidateCache(): void {
        this._cachedRegions = null;
        this._cacheExpiresAt = 0;
    }
}
