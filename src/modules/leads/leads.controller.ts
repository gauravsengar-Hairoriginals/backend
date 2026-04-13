import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    ParseUUIDPipe,
    ForbiddenException,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadRecordDto, AssignLeadDto, BulkAssignLeadDto } from './dto/create-lead.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { User } from '../users/entities/user.entity';

@ApiTags('leads')
@Controller('api/v1/leads')
export class LeadsController {
    constructor(private readonly leadsService: LeadsService) { }

    // ── Public: anyone can submit a lead (landing pages, QR codes etc.) ──────
    @Post()
    create(@Body() dto: CreateLeadDto) {
        return this.leadsService.create(dto);
    }

    // ── Get Tab Counts ────────────────────────────────────────────────────────
    @Get('counts')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LEAD_CALLER)
    getCounts(
        @Query('assignedToId') assignedToId?: string,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
        @CurrentUser() user?: User,
    ) {
        return this.leadsService.getTabCounts(user, { assignedToId, fromDate, toDate });
    }

    // ── Admin + Lead Callers: list leads (callers see only their own) ─────────
    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(
        UserRole.SUPER_ADMIN,
        UserRole.ADMIN,
        UserRole.LEAD_CALLER,
    )
    findAll(
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('status') status?: string,
        @Query('assignedToId') assignedToId?: string,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
        @Query('name') name?: string,
        @Query('phone') phone?: string,
        @Query('city') city?: string,
        @Query('source') source?: string,
        @Query('campaign') campaign?: string,
        @Query('assignedTo') assignedTo?: string,
        @Query('leadCategory') leadCategory?: string,
        @Query('tab') tab?: 'all' | 'fresh' | 'reminder' | 'revisit' | 'converted' | 'dropped',
        @Query('deduplicateByPhone') deduplicateByPhone?: string,
        @Query('isHighPriority') isHighPriority?: string,
        @Query('isUnassigned') isUnassigned?: string,
        @Query('agingDays') agingDays?: number,
        @Query('agingSort') agingSort?: 'asc' | 'desc',
        @CurrentUser() user?: User,
    ) {
        return this.leadsService.findAll({
            page: +(page ?? 1),
            limit: +(limit ?? 20),
            search, status, assignedToId, fromDate, toDate,
            name, phone, city, source, campaign, assignedTo, leadCategory, tab,
            deduplicateByPhone: deduplicateByPhone === 'true',
            isHighPriority: isHighPriority === 'true' ? true : undefined,
            isUnassigned: isUnassigned === 'true' ? true : undefined,
            agingDays: agingDays ? +agingDays : undefined,
            agingSort: agingSort || undefined,
        }, user);
    }

    // ── Admin: aging dashboard ────────────────────────────────────────────────
    @Get('aging-dashboard')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    getAgingDashboard() {
        return this.leadsService.getAgingDashboard();
    }

    // ── Admin: caller aging dashboard ─────────────────────────────────────────
    @Get('caller-aging-dashboard')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    getCallerAgingDashboard() {
        return this.leadsService.getCallerAgingDashboard();
    }

    // ── Admin: source aging dashboard ─────────────────────────────────────────
    @Get('source-aging-dashboard')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    getSourceAgingDashboard() {
        return this.leadsService.getSourceAgingDashboard();
    }

    // ── Admin: auto-assign preview (dry-run, no DB changes) ──────────────────
    @Get('auto-assign/preview')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    autoAssignPreview(@Query('onlineOnly') onlineOnly?: string) {
        // ?onlineOnly=false → include offline callers; default = true (on-shift only)
        const onlyOnline = onlineOnly === undefined ? true : onlineOnly !== 'false';
        return this.leadsService.autoAssignPreview(onlyOnline);
    }

    // ── Admin: auto-assign commit (writes to DB) ──────────────────────────────
    @Post('auto-assign')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    autoAssign(@Body('onlineOnly') onlineOnly?: boolean) {
        // body: { onlineOnly: false } → include offline callers; default = true
        const onlyOnline = onlineOnly === undefined ? true : Boolean(onlineOnly);
        return this.leadsService.autoAssign(onlyOnline);
    }

    // ── Admin: bulk-assign all Inbound IVR / qkonnect leads to last agent ────
    @Post('bulk-assign-qkonnect')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    bulkAssignQkonnect() {
        return this.leadsService.bulkAssignQkonnectLeads();
    }

    // ── Admin: bulk assign leads to a caller ──────────────────────────────────
    @Patch('bulk-assign')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LEAD_CALLER)
    bulkAssign(@Body() dto: BulkAssignLeadDto) {
        return this.leadsService.bulkAssign(dto.leadIds, dto.callerId);
    }

    // ── Admin: import LeadSquared Excel dump ──────────────────────────────────
    @Post('import/leadsquared')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @UseInterceptors(FileInterceptor('file'))
    importLeadSquared(
        @UploadedFile() file: Express.Multer.File,
        @Body('targetStatus') targetStatus: string,
    ) {
        if (!file) throw new BadRequestException('No file uploaded');
        if (!targetStatus) throw new BadRequestException('targetStatus is required');
        return this.leadsService.importFromLeadSquared(file.buffer, targetStatus);
    }

    // ── Admin: import generic CSV (admin export format) ───────────────────────
    @Post('import/generic-csv')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @UseInterceptors(FileInterceptor('file'))
    importGenericCsv(@UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file uploaded');
        return this.leadsService.importFromGenericCsv(file.buffer);
    }

    // ── Admin: delete leads by phone numbers from Excel ───────────────────────
    @Post('delete-by-phone-excel')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    @UseInterceptors(FileInterceptor('file'))
    deleteByPhoneExcel(@UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file uploaded');
        return this.leadsService.deleteByPhoneNumbers(file.buffer);
    }

    // ── Admin: update a lead record's calling/tracking fields ─────────────────
    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LEAD_CALLER)
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateLeadRecordDto,
        @CurrentUser() user: User,
    ) {
        return this.leadsService.update(id, dto, user);
    }

    // ── Admin: assign a lead to a specific lead caller ────────────────────────
    @Patch(':id/assign')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LEAD_CALLER)
    assign(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AssignLeadDto,
    ) {
        return this.leadsService.assignLead(id, dto);
    }

    // ── Admin: mark lead as converted (became a paying customer) ─────────────
    @Patch(':id/convert')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    convert(@Param('id', ParseUUIDPipe) id: string) {
        return this.leadsService.convertLead(id);
    }

    // ── Get lead history ──────────────────────────────────────────────────
    @Get(':id/history')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LEAD_CALLER)
    getHistory(@Param('id', ParseUUIDPipe) id: string) {
        return this.leadsService.getHistory(id);
    }

    // ── Admin: delete single lead record ──────────────────────────────────────
    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
    deleteOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.leadsService.deleteOne(id);
    }

    // ── SUPER_ADMIN only: bulk delete all lead records ────────────────────────
    @Delete()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    deleteAll(@Query('confirm') confirm: string) {
        if (confirm !== 'true') {
            throw new ForbiddenException('Pass ?confirm=true to bulk-delete all leads');
        }
        return this.leadsService.deleteAll();
    }
}
