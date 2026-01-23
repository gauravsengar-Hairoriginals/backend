import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
    ParseUUIDPipe,
    Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse, ApiBody } from '@nestjs/swagger';
import { DiscountsService, DiscountsQuery } from './discounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../users/enums/user-role.enum';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { DiscountStatus } from './entities/discount-code.entity';

@ApiTags('Discounts')
@ApiBearerAuth()
@Controller('api/v1/discounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DiscountsController {
    constructor(private readonly discountsService: DiscountsService) { }

    @Post()
    @Roles(...ADMIN_ROLES)
    @ApiOperation({
        summary: 'Create a discount coupon for a customer',
        description: 'Creates discount in Shopify and stores locally. Customer identified by phone number.',
    })
    @ApiBody({ type: CreateDiscountDto })
    @ApiResponse({ status: 201, description: 'Discount created successfully' })
    @ApiResponse({ status: 404, description: 'Customer not found' })
    create(@Body() createDto: CreateDiscountDto) {
        return this.discountsService.create(createDto);
    }

    @Get()
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get all discounts with filters' })
    @ApiQuery({ name: 'customerPhone', required: false })
    @ApiQuery({ name: 'status', enum: DiscountStatus, required: false })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @Query('customerPhone') customerPhone?: string,
        @Query('status') status?: DiscountStatus,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const query: DiscountsQuery = {
            customerPhone,
            status,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        };
        return this.discountsService.findAll(query);
    }

    @Get(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get discount by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.discountsService.findById(id);
    }

    @Get('code/:code')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get discount by code' })
    findByCode(@Param('code') code: string) {
        return this.discountsService.findByCode(code);
    }

    @Delete(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Disable a discount coupon' })
    @ApiResponse({ status: 200, description: 'Discount disabled' })
    disable(@Param('id', ParseUUIDPipe) id: string) {
        return this.discountsService.disable(id);
    }
}
