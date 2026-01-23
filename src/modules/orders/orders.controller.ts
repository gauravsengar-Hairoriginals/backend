import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
    ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse, ApiBody } from '@nestjs/swagger';
import { OrdersService, OrdersQuery } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../users/enums/user-role.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderSyncStatus, FinancialStatus, FulfillmentStatus } from './entities/order.entity';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('api/v1/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Post()
    @Roles(...ADMIN_ROLES)
    @ApiOperation({
        summary: 'Create a new order',
        description: 'Creates order locally and pushes to Shopify. Returns with shopifyId once synced.',
    })
    @ApiBody({ type: CreateOrderDto })
    @ApiResponse({ status: 201, description: 'Order created and synced to Shopify' })
    @ApiResponse({ status: 400, description: 'Customer not synced to Shopify' })
    create(@Body() createDto: CreateOrderDto) {
        return this.ordersService.create(createDto);
    }

    @Get()
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get all orders with filters' })
    @ApiQuery({ name: 'customerId', required: false })
    @ApiQuery({ name: 'syncStatus', enum: OrderSyncStatus, required: false })
    @ApiQuery({ name: 'financialStatus', enum: FinancialStatus, required: false })
    @ApiQuery({ name: 'fulfillmentStatus', enum: FulfillmentStatus, required: false })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @Query('customerId') customerId?: string,
        @Query('syncStatus') syncStatus?: OrderSyncStatus,
        @Query('financialStatus') financialStatus?: FinancialStatus,
        @Query('fulfillmentStatus') fulfillmentStatus?: FulfillmentStatus,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const query: OrdersQuery = {
            customerId,
            syncStatus,
            financialStatus,
            fulfillmentStatus,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        };
        return this.ordersService.findAll(query);
    }

    @Get(':id')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get order by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.ordersService.findById(id);
    }

    @Post(':id/retry')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Retry failed order sync' })
    @ApiResponse({ status: 200, description: 'Retry queued' })
    @ApiResponse({ status: 400, description: 'Order is not in failed state' })
    retrySync(@Param('id', ParseUUIDPipe) id: string) {
        return this.ordersService.retrySync(id);
    }
}
