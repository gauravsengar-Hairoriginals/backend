import {
    Controller,
    Get,
    Patch,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
    ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse, ApiBody } from '@nestjs/swagger';
import { CustomersService, CustomersQuery } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../users/enums/user-role.enum';
import { CustomerType } from './entities/customer.entity';
import { CreateCustomerDto, CustomerScope } from './dto/create-customer.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('api/v1/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
    constructor(private readonly customersService: CustomersService) { }

    @Post()
    @Roles(...ADMIN_ROLES)
    @ApiOperation({
        summary: 'Create a new customer',
        description: 'scope=local (default) creates in HO-Backend only. scope=global creates in Shopify first, then syncs back.',
    })
    @ApiBody({ type: CreateCustomerDto })
    @ApiResponse({ status: 201, description: 'Customer created successfully' })
    @ApiResponse({ status: 409, description: 'Customer with this phone already exists' })
    create(@Body() createDto: CreateCustomerDto) {
        return this.customersService.create(createDto);
    }

    @Get()
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get all customers with filters' })
    @ApiQuery({ name: 'customerType', enum: CustomerType, required: false })
    @ApiQuery({ name: 'city', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'hasOrders', required: false, type: Boolean })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @Query('customerType') customerType?: CustomerType,
        @Query('city') city?: string,
        @Query('search') search?: string,
        @Query('hasOrders') hasOrders?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const query: CustomersQuery = {
            customerType,
            city,
            search,
            hasOrders: hasOrders ? hasOrders === 'true' : undefined,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        };
        return this.customersService.findAll(query);
    }

    @Get('stats')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get customer statistics' })
    getStats() {
        return this.customersService.getStats();
    }

    @Get(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get customer by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.customersService.findById(id);
    }

    @Get('phone/:phone')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Find customer by phone number' })
    findByPhone(@Param('phone') phone: string) {
        return this.customersService.findByPhone(phone);
    }

    @Patch(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Update customer' })
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateData: any,
    ) {
        return this.customersService.update(id, updateData);
    }

    @Patch(':id/profile')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Update customer profile (preferences)' })
    updateProfile(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() profileData: any,
    ) {
        return this.customersService.updateProfile(id, profileData);
    }

    @Post('sync')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Trigger full customer sync from Shopify' })
    @ApiResponse({ status: 201, description: 'Sync job queued' })
    triggerSync() {
        return this.customersService.triggerFullSync();
    }
}
