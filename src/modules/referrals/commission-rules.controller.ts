import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, ADMIN_ROLES } from '../users/enums/user-role.enum';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { CommissionRule } from './entities/commission-rule.entity';

@ApiTags('Commission Rules')
@ApiBearerAuth()
@Controller('api/v1/commission-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommissionRulesController {
    constructor(private readonly referralsService: ReferralsService) { }

    @Post()
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Create a commission rule' })
    @ApiResponse({ status: 201, description: 'Rule created successfully' })
    create(@Body() createDto: CreateCommissionRuleDto) {
        return this.referralsService.createCommissionRule(createDto);
    }

    @Get()
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'List all commission rules' })
    findAll() {
        return this.referralsService.findAllCommissionRules();
    }

    @Get(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get commission rule by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.referralsService.findCommissionRuleById(id);
    }

    @Patch(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Update commission rule' })
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateDto: Partial<CreateCommissionRuleDto>,
    ) {
        return this.referralsService.updateCommissionRule(id, updateDto);
    }

    @Delete(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Delete commission rule' })
    remove(@Param('id', ParseUUIDPipe) id: string) {
        return this.referralsService.removeCommissionRule(id);
    }
}
