import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicLeadIntakeDto, PublicLeadIntakeResult } from './dto/public-lead-intake.dto';
import { Lead, LeadIntakeEvent } from './entities/lead.entity';
import { TicketsService } from '../tickets/tickets.service';

export interface PublicLeadContext {
  gatewayId: string;
  requestId: string | null;
  sourceIp: string | null;
  userAgent: string | null;
}

@Injectable()
export class PublicLeadsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadIntakeEvent)
    private readonly leadIntakeEventRepository: Repository<LeadIntakeEvent>,
    private readonly ticketsService: TicketsService,
  ) {}

  async ingest(
    dto: PublicLeadIntakeDto,
    context: PublicLeadContext,
  ): Promise<PublicLeadIntakeResult & { ticketId: string }> {
    const email = dto.email.trim().toLowerCase();
    const normalizedEmail = email;
    const now = new Date();
    const sourceTimestamp = this.parseSourceTimestamp(dto.sourceTimestamp);
    const metadata = dto.metadata ?? {};

    let lead = await this.leadRepository.findOne({
      where: { tenantId: dto.tenantId, normalizedEmail },
    });
    let deduplicated = false;

    if (!lead) {
      lead = this.leadRepository.create({
        tenantId: dto.tenantId,
        email,
        normalizedEmail,
        fullName: dto.fullName?.trim() || null,
        company: dto.company?.trim() || null,
        employees: dto.employees?.trim() || null,
        latestInquiryType: dto.inquiryType?.trim() || null,
        latestMessage: dto.message?.trim() || null,
        firstSource: dto.source,
        lastSource: dto.source,
        firstSourceTimestamp: sourceTimestamp,
        lastSourceTimestamp: sourceTimestamp,
        firstSeenAt: now,
        lastSeenAt: now,
        intakeCount: 1,
        metadata,
      });
    } else {
      deduplicated = true;
      lead.lastSeenAt = now;
      lead.lastSource = dto.source;
      lead.lastSourceTimestamp = sourceTimestamp;
      lead.intakeCount += 1;
      lead.email = email;
      if (dto.fullName?.trim()) {
        lead.fullName = dto.fullName.trim();
      }
      if (dto.company?.trim()) {
        lead.company = dto.company.trim();
      }
      if (dto.employees?.trim()) {
        lead.employees = dto.employees.trim();
      }
      if (dto.inquiryType?.trim()) {
        lead.latestInquiryType = dto.inquiryType.trim();
      }
      if (dto.message?.trim()) {
        lead.latestMessage = dto.message.trim();
      }
      lead.metadata = {
        ...(lead.metadata ?? {}),
        ...(metadata ?? {}),
        lastGatewayId: context.gatewayId,
        lastRequestId: context.requestId,
      };
    }

    const savedLead = await this.leadRepository.save(lead);

    const ticket = await this.ticketsService.createFromLead({
      tenantId: dto.tenantId,
      leadId: savedLead.id,
      email,
      normalizedEmail,
      fullName: dto.fullName,
      company: dto.company,
      source: dto.source,
      inquiryType: dto.inquiryType,
      message: dto.message,
      metadata: {
        ...metadata,
        gatewayId: context.gatewayId,
        requestId: context.requestId,
      },
    });

    const event = this.leadIntakeEventRepository.create({
      leadId: savedLead.id,
      tenantId: dto.tenantId,
      normalizedEmail,
      source: dto.source,
      inquiryType: dto.inquiryType?.trim() || null,
      sourceTimestamp,
      gatewayId: context.gatewayId,
      requestId: context.requestId,
      sourceIp: context.sourceIp,
      userAgent: context.userAgent,
      deduplicated,
      metadata,
    });
    await this.leadIntakeEventRepository.save(event);

    return {
      leadId: savedLead.id,
      deduplicated,
      intakeCount: savedLead.intakeCount,
      receivedAt: now.toISOString(),
      ticketId: ticket.id,
    };
  }

  private parseSourceTimestamp(sourceTimestamp?: string): Date {
    if (!sourceTimestamp) {
      return new Date();
    }

    const parsed = new Date(sourceTimestamp);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid sourceTimestamp');
    }
    return parsed;
  }
}
