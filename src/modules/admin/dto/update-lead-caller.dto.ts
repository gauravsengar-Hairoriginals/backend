import { CallerCategory } from '../../users/enums/caller-category.enum';
import { CallerRegion } from '../../users/enums/caller-region.enum';

export class UpdateLeadCallerDto {
    name?: string;
    email?: string;
    phone?: string;
    /** If provided, the caller's password will be updated to this value. */
    password?: string;
    callerCategory?: CallerCategory;
    callerRegion?: CallerRegion;
}
