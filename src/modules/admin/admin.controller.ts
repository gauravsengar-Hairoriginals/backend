import { Controller, Get, Post, Body, UseGuards, Query, Param, Delete } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateLeadCallerDto } from './dto/update-lead-caller.dto';
import { User } from '../../modules/users/entities/user.entity';
import { CurrentUser } from '../../modules/auth/decorators/current-user.decorator';

@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Get('dashboard')
    async getDashboardStats(@CurrentUser() user: User) {
        return this.adminService.getDashboardStats(user);
    }

    // Only SUPER_ADMIN can create new admins
    @Post('users')
    @Roles(UserRole.SUPER_ADMIN)
    async createAdmin(@Body() createAdminDto: CreateAdminDto) {
        return this.adminService.createAdmin(createAdminDto);
    }

    // Only SUPER_ADMIN can list admins
    @Get('users')
    @Roles(UserRole.SUPER_ADMIN)
    async listAdmins() {
        return this.adminService.listAdmins();
    }

    // Toggle admin active status
    @Post('users/:id/toggle-status')
    @Roles(UserRole.SUPER_ADMIN)
    async toggleAdminStatus(@Param('id') id: string) {
        return this.adminService.toggleAdminStatus(id);
    }

    // Reset admin password
    @Post('users/:id/reset-password')
    @Roles(UserRole.SUPER_ADMIN)
    async resetAdminPassword(@Param('id') id: string) {
        return this.adminService.resetAdminPassword(id);
    }

    // Update admin permissions
    @Post('users/:id/permissions')
    @Roles(UserRole.SUPER_ADMIN)
    async updateAdminPermissions(@Param('id') id: string, @Body() body: { permissions: string[] }) {
        return this.adminService.updateAdminPermissions(id, body.permissions);
    }

    // Stylist Management
    @Get('stylists')
    @RequirePermissions('MANAGE_STYLISTS')
    async listStylists(@Query('search') search?: string, @Query('status') status?: string) {
        return this.adminService.listStylists(search, status);
    }

    @Post('stylists/:id/status')
    @RequirePermissions('MANAGE_STYLISTS')
    async updateStylistStatus(
        @Param('id') id: string,
        @Body() body: { isApproved: boolean }
    ) {
        return this.adminService.updateStylistStatus(id, body.isApproved);
    }

    @Get('stylists/:id/referrals')
    @RequirePermissions('MANAGE_STYLISTS')
    async getStylistReferrals(@Param('id') id: string) {
        return this.adminService.getStylistReferrals(id);
    }

    @Post('stylists/:id/level')
    @RequirePermissions('MANAGE_STYLISTS')
    async updateStylistLevel(
        @Param('id') id: string,
        @Body() body: { level: string }
    ) {
        return this.adminService.updateStylistLevel(id, body.level);
    }

    // Salon Management
    @Get('salons')
    @RequirePermissions('MANAGE_SALONS')
    async listSalons(@Query('search') search?: string) {
        return this.adminService.listSalons(search);
    }

    @Post('salons')
    @RequirePermissions('MANAGE_SALONS')
    async createSalon(@Body() body: any) {
        return this.adminService.createSalon(body);
    }

    @Post('salons/:id/level')
    @RequirePermissions('MANAGE_SALONS')
    async updateSalonLevel(
        @Param('id') id: string,
        @Body() body: { level: string }
    ) {
        return this.adminService.updateSalonLevel(id, body.level);
    }

    // Referral Management
    @Get('referrals')
    @RequirePermissions('APPROVE_PAYOUTS')
    async listReferrals(
        @Query('status') status?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('salonPhone') salonPhone?: string,
        @Query('code') code?: string,
        @Query('stylistPhone') stylistPhone?: string
    ) {
        return this.adminService.listReferrals(status, page, limit, salonPhone, code, stylistPhone);
    }

    @Post('referrals/credit-bulk')
    @RequirePermissions('APPROVE_PAYOUTS')
    async bulkCreditReferrals(@Body() body: { referralIds: string[] }) {
        return this.adminService.bulkCreditReferrals(body.referralIds);
    }

    @Post('referrals/:id/commission')
    @RequirePermissions('APPROVE_PAYOUTS')
    async updateCommission(
        @Param('id') id: string,
        @Body() body: { amount: number }
    ) {
        return this.adminService.updateCommission(id, body.amount);
    }

    @Post('discounts/:id/status')
    @RequirePermissions('MANAGE_SALONS') // Using MANAGE_SALONS as a proxy for managing stylist coupons
    async updateDiscountStatus(
        @Param('id') id: string,
        @Body() body: { status: string }
    ) {
        return this.adminService.updateDiscountStatus(id, body.status);
    }

    // ── Lead Caller Management ──────────────────────────────────────────
    @Post('lead-callers')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async createLeadCaller(@Body() body: { name: string; email: string; phone: string; password?: string }) {
        return this.adminService.createLeadCaller(body);
    }

    @Get('lead-callers')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async listLeadCallers(@Query('search') search?: string) {
        return this.adminService.listLeadCallers(search);
    }

    @Post('lead-callers/:id/status')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async toggleLeadCallerStatus(
        @Param('id') id: string,
        @Body() body: { isActive: boolean },
    ) {
        return this.adminService.toggleLeadCallerStatus(id, body.isActive);
    }

    @Post('lead-callers/:id/reset-password')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async resetLeadCallerPassword(
        @Param('id') id: string,
        @Body() body: { newPassword: string },
    ) {
        return this.adminService.resetLeadCallerPassword(id, body.newPassword);
    }

    @Post('lead-callers/:id/update')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async updateLeadCaller(
        @Param('id') id: string,
        @Body() body: UpdateLeadCallerDto,
    ) {
        return this.adminService.updateLeadCaller(id, body);
    }

    @Post('lead-callers/:id/shift/start')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LEAD_CALLER)
    async startShift(@Param('id') id: string) {
        return this.adminService.startShift(id);
    }

    @Post('lead-callers/:id/shift/end')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LEAD_CALLER)
    async endShift(@Param('id') id: string) {
        return this.adminService.endShift(id);
    }

    // ── Experience Centers Management ───────────────────────────────────

    @Post('experience-centers')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async createExperienceCenter(@Body() body: any) {
        return this.adminService.createExperienceCenter(body);
    }

    @Get('experience-centers')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LEAD_CALLER)
    async listExperienceCenters(
        @Query('search') search?: string,
        @Query('isActive') isActive?: string,
    ) {
        const isActiveBool = isActive !== undefined ? isActive === 'true' : undefined;
        return this.adminService.listExperienceCenters(search, isActiveBool);
    }

    @Post('experience-centers/:id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async updateExperienceCenter(
        @Param('id') id: string,
        @Body() body: any,
    ) {
        return this.adminService.updateExperienceCenter(id, body);
    }

    @Post('experience-centers/:id/status')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async toggleExperienceCenterStatus(
        @Param('id') id: string,
        @Body() body: { isActive: boolean },
    ) {
        return this.adminService.toggleExperienceCenterStatus(id, body.isActive);
    }

    // ── City Regions Management ───────────────────────────────────────

    @Get('city-regions')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async listCityRegions() {
        return this.adminService.listCityRegions();
    }

    @Post('city-regions')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async createCityRegion(@Body() body: { regionCode: string; regionName: string; cities?: string[] }) {
        return this.adminService.createCityRegion(body);
    }

    @Post('city-regions/:id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async updateCityRegion(
        @Param('id') id: string,
        @Body() body: { regionName?: string; cities?: string[]; isActive?: boolean },
    ) {
        return this.adminService.updateCityRegion(id, body);
    }

    @Delete('city-regions/:id')
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    async deleteCityRegion(@Param('id') id: string) {
        return this.adminService.deleteCityRegion(id);
    }
}

