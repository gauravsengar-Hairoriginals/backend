import {
    Controller,
    Get,
    Post,
    Param,
    Query,
    Body,
    UseGuards,
} from '@nestjs/common';
import { DinggIntegrationService, DinggBookingDto } from './dingg.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';

@Controller('api/v1/dingg')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LEAD_CALLER)
export class DinggController {
    constructor(private readonly dingg: DinggIntegrationService) {}

    /** List all services available at an EC */
    @Get(':ecId/services')
    getServices(@Param('ecId') ecId: string) {
        return this.dingg.getServices(ecId);
    }

    /**
     * Get available booking slots for an EC
     * @query from   YYYY-MM-DD (start date, default today)
     * @query to     YYYY-MM-DD (end date, default today+6)
     * @query serviceIds  comma-separated DINGG service IDs
     */
    @Get(':ecId/slots')
    getSlots(
        @Param('ecId') ecId: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('serviceIds') serviceIds?: string,
    ) {
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0];
        return this.dingg.getAvailableSlots(ecId, from ?? today, to ?? nextWeek, serviceIds);
    }

    /** Create a booking in DINGG and save to orders table */
    @Post(':ecId/book')
    createBooking(
        @Param('ecId') ecId: string,
        @Body() dto: DinggBookingDto,
    ) {
        return this.dingg.createBooking(ecId, dto);
    }

    /** Manually trigger a transaction sync for a specific date (admin only) */
    @Post('sync')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    manualSync(@Body() body: { date?: string }) {
        const date = body.date ?? new Date().toISOString().split('T')[0];
        return this.dingg.syncTransactionsForDate(date);
    }

    /** EC conversion funnel stats */
    @Get('stats')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    getStats() {
        return this.dingg.getConversionStats();
    }
}
