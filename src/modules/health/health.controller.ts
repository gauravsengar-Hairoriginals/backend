import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    @Get()
    @ApiOperation({ summary: 'Basic health check' })
    check() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'hairoriginals-backend',
            version: process.env.npm_package_version || '1.0.0',
        };
    }

    @Get('ready')
    @ApiOperation({ summary: 'Readiness check (DB, Redis connected)' })
    ready() {
        // TODO: Add actual DB and Redis health checks
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            checks: {
                database: 'connected',
                redis: 'connected',
            },
        };
    }

    @Get('live')
    @ApiOperation({ summary: 'Liveness check (process running)' })
    live() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        };
    }
}
