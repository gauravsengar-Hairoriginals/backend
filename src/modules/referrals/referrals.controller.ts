import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
    ParseUUIDPipe,
    Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ReferralsService, ReferralsQuery } from './referrals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, ADMIN_ROLES } from '../users/enums/user-role.enum';
import { CreateReferralDto } from './dto/create-referral.dto';
import { ReferralStatus } from './entities/referral.entity';

// Roles that can create referrals
const REFERRAL_ROLES = [UserRole.STYLIST, UserRole.FIELD_AGENT];

@ApiTags('Referrals')
@ApiBearerAuth()
@Controller('api/v1/referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferralsController {
    constructor(private readonly referralsService: ReferralsService) { }

    @Post()
    @Roles(...REFERRAL_ROLES)
    @ApiOperation({
        summary: 'Create a referral',
        description: 'Creates customer (if needed), generates discount coupon, and creates referral record.',
    })
    @ApiBody({ type: CreateReferralDto })
    @ApiResponse({ status: 201, description: 'Referral created successfully' })
    create(@Body() createDto: CreateReferralDto, @Request() req: any) {
        return this.referralsService.create(createDto, req.user);
    }

    @Get('my')
    @Roles(...REFERRAL_ROLES)
    @ApiOperation({ summary: 'Get my referrals (dashboard)' })
    @ApiQuery({ name: 'status', enum: ReferralStatus, required: false })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findMyReferrals(
        @Request() req: any,
        @Query('status') status?: ReferralStatus,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const query: ReferralsQuery = {
            status,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        };
        return this.referralsService.findMyReferrals(req.user.id, query);
    }

    @Post(':id/commission')
    @Roles(...ADMIN_ROLES)
    async updateCommission(
        @Param('id') id: string,
        @Body() body: { amount: number; salonAmount?: number; status?: ReferralStatus },
    ) {
        return this.referralsService.updateCommission(id, body.amount, body.salonAmount, body.status);
    }

    @Post('credit-bulk')
    @Roles(...ADMIN_ROLES)
    async bulkCredit(@Body() body: { referralIds: string[]; stylistRef?: string; salonRef?: string }) {
        return this.referralsService.bulkCredit(body.referralIds, body.stylistRef, body.salonRef);
    }

    @Get('my/stats')
    @Roles(...REFERRAL_ROLES)
    @ApiOperation({ summary: 'Get my referral stats (dashboard summary)' })
    getMyStats(@Request() req: any) {
        return this.referralsService.getMyStats(req.user.id);
    }

    @Get(':id')
    @Roles(...REFERRAL_ROLES, ...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get referral by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.referralsService.findById(id);
    }
}
