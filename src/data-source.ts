/**
 * Standalone TypeORM DataSource used exclusively by the TypeORM CLI
 * (migration:run, migration:generate, migration:revert, etc.).
 *
 * This must NOT be imported by the NestJS app — the app uses the
 * TypeOrmModule.forRootAsync() configuration in app.module.ts instead.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as path from 'path';

export const AppDataSource = new DataSource({
    type: 'postgres',
    host:     process.env.DATABASE_HOST     || 'localhost',
    port:     Number(process.env.DATABASE_PORT)     || 5432,
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || '103Hairoriginals',
    database: process.env.DATABASE_NAME     || 'gauravsengar',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,

    // Entities — compiled JS in dist/; TS paths used during ts-node execution
    entities: [
        path.join(__dirname, '**/*.entity{.ts,.js}'),
    ],

    // Migrations
    migrations: [
        path.join(__dirname, 'database/migrations/*{.ts,.js}'),
    ],

    // Never auto-sync from CLI — only explicit migrations
    synchronize: false,
    logging: false,
});
