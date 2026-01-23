import {
    Controller,
    Get,
    Post,
    Param,
    Query,
    UseGuards,
    ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ProductsService, ProductsQuery } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ADMIN_ROLES } from '../users/enums/user-role.enum';
import { ProductStatus } from './entities/product.entity';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('api/v1/products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Get()
    @ApiOperation({ summary: 'Get all products' })
    @ApiQuery({ name: 'status', enum: ProductStatus, required: false })
    @ApiQuery({ name: 'productType', required: false })
    @ApiQuery({ name: 'vendor', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    findAll(
        @Query('status') status?: ProductStatus,
        @Query('productType') productType?: string,
        @Query('vendor') vendor?: string,
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const query: ProductsQuery = {
            status,
            productType,
            vendor,
            search,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        };
        return this.productsService.findAll(query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get product by ID' })
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.productsService.findById(id);
    }

    @Post('sync')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Trigger full product sync from Shopify (admin only)' })
    @ApiResponse({ status: 201, description: 'Sync job queued' })
    triggerSync() {
        return this.productsService.triggerFullSync();
    }

    @Get('sync/:jobId')
    @Roles(...ADMIN_ROLES)
    @ApiOperation({ summary: 'Get sync job status' })
    getSyncStatus(@Param('jobId') jobId: string) {
        return this.productsService.getSyncStatus(jobId);
    }
}
