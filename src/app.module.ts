import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';

// Config
import {
  databaseConfig,
  redisConfig,
  jwtConfig,
  shopifyConfig,
  leadsquaredConfig,
  twilioConfig,
  awsConfig,
} from './config';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HealthModule } from './modules/health/health.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ProductsModule } from './modules/products/products.module';
import { CustomersModule } from './modules/customers/customers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { SalonsModule } from './modules/salons/salons.module';
import { AdminModule } from './modules/admin/admin.module';
import { PartnerModule } from './modules/partner/partner.module';
import { FieldForceModule } from './modules/field-force/field-force.module';
import { LeadsModule } from './modules/leads/leads.module';
import { CallLogsModule } from './modules/call-logs/call-logs.module';
import { PopinModule } from './modules/popin/popin.module';
import { FacebookModule } from './modules/facebook/facebook.module';
import { ShopifyModule } from './modules/shopify/shopify.module';
import { DinggModule } from './modules/dingg/dingg.module';
import { ChannelierModule } from './modules/channelier/channelier.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, jwtConfig, shopifyConfig, leadsquaredConfig, twilioConfig, awsConfig],
      envFilePath: ['.env', '.env.local'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),

    // Redis Queue
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),

    // Task Scheduling (DINGG daily sync cron + shift auto-end)
    ScheduleModule.forRoot(),

    // Feature Modules
    AuthModule,
    UsersModule,
    HealthModule,
    ProfileModule,
    ProductsModule,
    CustomersModule,
    OrdersModule,
    DiscountsModule,
    ReferralsModule,
    SalonsModule,
    AdminModule,
    PartnerModule,
    FieldForceModule,
    LeadsModule,
    CallLogsModule,
    PopinModule,
    FacebookModule,
    ShopifyModule,
    DinggModule,
    ChannelierModule,
  ],
})
export class AppModule { }
