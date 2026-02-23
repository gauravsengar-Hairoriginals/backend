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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadRecordDto, AssignLeadDto } from './dto/create-lead.dto';
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
        @CurrentUser() user?: User,
    ) {
        return this.leadsService.findAll({ page: +(page ?? 1), limit: +(limit ?? 20), search, status, assignedToId }, user);
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
    @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
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
