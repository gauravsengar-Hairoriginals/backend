import { Controller, Post, Get, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CallLogsService } from './call-logs.service';
import { InitiateCallDto } from './dto/initiate-call.dto';

@ApiTags('Call Logs')
@Controller('api/v1/call-logs')
export class CallLogsController {
    constructor(private readonly callLogsService: CallLogsService) { }

    // ── POST /api/v1/call-logs/initiate  (protected) ─────────────────────────
    @Post('initiate')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a pending call log before dialling' })
    async initiate(@Body() dto: InitiateCallDto, @Req() req: any) {
        // Attach the authenticated user's ID as agentId if not explicitly supplied
        if (!dto.agentId && req?.user?.sub) {
            dto.agentId = req.user.sub;
        }
        return this.callLogsService.initiate(dto);
    }

    // ── GET /api/v1/call-logs/callback  (PUBLIC — called by qkonnect) ─────────
    @Get('callback')
    @ApiOperation({ summary: 'qkonnect call-completion webhook (no auth)' })
    async callback(@Query() params: Record<string, string>) {
        return this.callLogsService.handleCallback(params);
    }

    // ── GET /api/v1/call-logs/lead/:leadId  (protected — future admin UI) ─────
    @Get('lead')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Fetch call logs for a specific lead' })
    async byLead(@Query('leadId') leadId: string) {
        return this.callLogsService.findByLead(leadId);
    }
}
