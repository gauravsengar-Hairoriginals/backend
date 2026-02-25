import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallLog, CallLogStatus } from './entities/call-log.entity';
import { InitiateCallDto } from './dto/initiate-call.dto';
import { Customer } from '../customers/entities/customer.entity';
import { LeadRecord, LeadStatus } from '../leads/entities/lead-record.entity';

@Injectable()
export class CallLogsService {
    private readonly logger = new Logger(CallLogsService.name);

    constructor(
        @InjectRepository(CallLog)
        private readonly callLogRepo: Repository<CallLog>,
        @InjectRepository(Customer)
        private readonly customerRepo: Repository<Customer>,
        @InjectRepository(LeadRecord)
        private readonly leadRepo: Repository<LeadRecord>,
    ) { }

    // ── Initiate: create a pending record when agent starts a call ─────────────
    async initiate(dto: InitiateCallDto): Promise<CallLog> {
        const record = this.callLogRepo.create({
            leadId: dto.leadId,
            customerId: dto.customerId,
            agentId: dto.agentId,
            agentNumber: dto.agentNumber,
            callerNumber: dto.callerNumber,
            status: CallLogStatus.PENDING,
        });
        return this.callLogRepo.save(record);
    }

    // ── Callback: qkonnect posts result, we find & update the pending record ───
    async handleCallback(params: Record<string, string>): Promise<{ success: boolean }> {
        // qkonnect may use different casing — normalise common variants
        const agentNumber = params['agent_number'] ?? params['agentNumber'] ?? '';
        const callerNumber = params['caller_number'] ?? params['callerNumber'] ?? '';

        if (!agentNumber || !callerNumber) {
            this.logger.warn('Callback missing agent_number or caller_number', params);
            return { success: false };
        }

        // Find the most recent pending record for this agent+caller pair
        const record = await this.callLogRepo.findOne({
            where: { agentNumber, callerNumber, status: CallLogStatus.PENDING },
            order: { createdAt: 'DESC' },
        });

        if (!record) {
            // ── Inbound IVR fallback ──────────────────────────────────────────
            // No pending outbound record found → this is an inbound call.
            // Create: Customer (if new) → LeadRecord (Inbound IVR) → CallLog.
            this.logger.log(`Inbound IVR callback: no pending log for agent=${agentNumber} caller=${callerNumber} — creating lead`);
            await this.createInboundLead(agentNumber, callerNumber, params);
            return { success: true };
        }

        // ── Update existing pending record ────────────────────────────────────
        await this.applyCallbackFields(record.id, params);
        this.logger.log(`Call log ${record.id} updated → ${this.isMissed(params) ? 'missed' : 'completed'}`);
        return { success: true };
    }

    // ── Private: create Inbound IVR lead + call log ────────────────────────────
    private async createInboundLead(
        agentNumber: string,
        callerNumber: string,
        params: Record<string, string>,
    ): Promise<void> {
        // 1. Find or create the customer by phone number
        let customer = await this.customerRepo.findOne({ where: { phone: callerNumber } });

        if (!customer) {
            customer = await this.customerRepo.save(
                this.customerRepo.create({
                    phone: callerNumber,
                    name: 'Inbound Caller',
                    firstName: 'Inbound',
                    lastName: 'Caller',
                    tags: ['lead', 'inbound-ivr'],
                    lastActivityPlatform: 'ivr',
                }),
            );
            this.logger.log(`Created new customer ${customer.id} for inbound number ${callerNumber}`);
        } else {
            // Tag the customer as inbound-ivr if not already
            if (!customer.tags?.includes('inbound-ivr')) {
                customer.tags = [...(customer.tags ?? []), 'inbound-ivr'];
                await this.customerRepo.save(customer);
            }
        }

        // 2. Check for prior lead records (isRevisit flag)
        const priorCount = await this.leadRepo.count({ where: { customerId: customer.id } });

        // 3. Create the lead record
        const lead = await this.leadRepo.save(
            this.leadRepo.create({
                customerId: customer.id,
                source: 'Inbound IVR',
                status: LeadStatus.NEW,
                isRevisit: priorCount > 0,
            }),
        );
        this.logger.log(`Created Inbound IVR lead ${lead.id} for customer ${customer.id}`);

        // 4. Create the call log with callback data already filled in
        const callAction = params['call_action'] ?? params['callAction'] ?? '';
        const parseDate = (v?: string) => (v ? new Date(v) : undefined);
        const parseNum = (v?: string) => (v != null ? parseInt(v, 10) : undefined);

        await this.callLogRepo.save(
            this.callLogRepo.create({
                leadId: lead.id,
                customerId: customer.id,
                agentNumber,
                callerNumber,
                status: this.isMissed(params) ? CallLogStatus.MISSED : CallLogStatus.COMPLETED,
                callId: params['call_id'] ?? params['callId'],
                destinationNumber: params['destination_number'] ?? params['destinationNumber'],
                lastKeyPressed: params['last_key_pressed'] ?? params['lastKeyPressed'],
                dtmfDetails: params['dtmf_details'] ?? params['dtmfDetails'],
                callStartTime: parseDate(params['call_start_time'] ?? params['callStartTime']),
                callEndTime: parseDate(params['call_end_time'] ?? params['callEndTime']),
                callPickupTime: parseDate(params['call_pickup_time'] ?? params['callPickupTime']),
                callHangupTime: parseDate(params['call_hangup_time'] ?? params['callHangupTime']),
                totalCallDuration: parseNum(params['total_call_duration'] ?? params['totalCallDuration']),
                ivrDuration: parseNum(params['ivr_duration'] ?? params['ivrDuration']),
                callTransferDuration: parseNum(params['call_transfer_duration'] ?? params['callTransferDuration']),
                callAction,
                callRecordingUrl: params['call_recording_url'] ?? params['callRecordingUrl'],
                callConferenceUid: params['call_conference_uid'] ?? params['callConferenceUid'],
            }),
        );
    }

    // ── Private: apply callback fields to an existing call_log row ─────────────
    private async applyCallbackFields(id: string, params: Record<string, string>): Promise<void> {
        const parseDate = (v?: string) => (v ? new Date(v) : undefined);
        const parseNum = (v?: string) => (v != null ? parseInt(v, 10) : undefined);
        const callAction = params['call_action'] ?? params['callAction'] ?? '';

        await this.callLogRepo.update(id, {
            status: this.isMissed(params) ? CallLogStatus.MISSED : CallLogStatus.COMPLETED,
            callId: params['call_id'] ?? params['callId'],
            destinationNumber: params['destination_number'] ?? params['destinationNumber'],
            lastKeyPressed: params['last_key_pressed'] ?? params['lastKeyPressed'],
            dtmfDetails: params['dtmf_details'] ?? params['dtmfDetails'],
            callStartTime: parseDate(params['call_start_time'] ?? params['callStartTime']),
            callEndTime: parseDate(params['call_end_time'] ?? params['callEndTime']),
            callPickupTime: parseDate(params['call_pickup_time'] ?? params['callPickupTime']),
            callHangupTime: parseDate(params['call_hangup_time'] ?? params['callHangupTime']),
            totalCallDuration: parseNum(params['total_call_duration'] ?? params['totalCallDuration']),
            ivrDuration: parseNum(params['ivr_duration'] ?? params['ivrDuration']),
            callTransferDuration: parseNum(params['call_transfer_duration'] ?? params['callTransferDuration']),
            callAction,
            callRecordingUrl: params['call_recording_url'] ?? params['callRecordingUrl'],
            callConferenceUid: params['call_conference_uid'] ?? params['callConferenceUid'],
        });
    }

    // ── Private helper ─────────────────────────────────────────────────────────
    private isMissed(params: Record<string, string>): boolean {
        const action = params['call_action'] ?? params['callAction'] ?? '';
        return action.toLowerCase().includes('missed');
    }

    // ── List call logs for a lead (for future admin view) ─────────────────────
    async findByLead(leadId: string): Promise<CallLog[]> {
        return this.callLogRepo.find({
            where: { leadId },
            order: { createdAt: 'DESC' },
            relations: ['agent', 'customer'],
        });
    }
}
