import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Product, ProductStatus } from './entities/product.entity';

export interface ProductsQuery {
    status?: ProductStatus;
    productType?: string;
    vendor?: string;
    search?: string;
    page?: number;
    limit?: number;
}

@Injectable()
export class ProductsService {
    constructor(
        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
        @InjectQueue('product-sync') private readonly productSyncQueue: Queue,
    ) { }

    async findAll(query: ProductsQuery = {}): Promise<{ products: Product[]; total: number }> {
        const { status, productType, vendor, search, page = 1, limit = 20 } = query;

        const qb = this.productRepository
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.variants', 'variants');

        if (status) {
            qb.andWhere('product.status = :status', { status });
        }

        if (productType) {
            qb.andWhere('product.productType = :productType', { productType });
        }

        if (vendor) {
            qb.andWhere('product.vendor = :vendor', { vendor });
        }

        if (search) {
            qb.andWhere(
                '(product.title ILIKE :search OR product.handle ILIKE :search)',
                { search: `%${search}%` },
            );
        }

        qb.orderBy('product.title', 'ASC')
            .skip((page - 1) * limit)
            .take(limit);

        const [products, total] = await qb.getManyAndCount();

        return { products, total };
    }

    async findById(id: string): Promise<Product> {
        const product = await this.productRepository.findOne({
            where: { id },
            relations: ['variants'],
        });

        if (!product) {
            throw new NotFoundException('Product not found');
        }

        return product;
    }

    async findByShopifyId(shopifyId: string): Promise<Product | null> {
        return this.productRepository.findOne({
            where: { shopifyId },
            relations: ['variants'],
        });
    }

    async triggerFullSync(): Promise<{ jobId: string }> {
        const job = await this.productSyncQueue.add('full-sync', {}, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
        });

        return { jobId: job.id.toString() };
    }

    async getSyncStatus(jobId: string): Promise<any> {
        const job = await this.productSyncQueue.getJob(jobId);

        if (!job) {
            throw new NotFoundException('Sync job not found');
        }

        return {
            id: job.id,
            status: await job.getState(),
            progress: job.progress(),
            result: job.returnvalue,
            failedReason: job.failedReason,
        };
    }
}
