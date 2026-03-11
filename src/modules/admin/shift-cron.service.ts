import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AdminService } from '../admin/admin.service';

@Injectable()
export class ShiftCronService {
    private readonly logger = new Logger(ShiftCronService.name);

    constructor(private readonly adminService: AdminService) { }

    /**
     * Auto-logout all non-international lead callers at 18:00 IST = 12:30 UTC
     * Cron: second minute hour day month weekday
     */
    @Cron('0 30 12 * * *', { timeZone: 'UTC' })
    async handleAutoLogout() {
        this.logger.log('Auto-logout cron fired: ending shifts for non-international callers');
        await this.adminService.autoEndShifts();
        this.logger.log('Auto-logout complete');
    }
}
