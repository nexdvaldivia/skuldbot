import { PublicLeadsService } from './public-leads.service';
import { PublicLeadSource } from './dto/public-lead-intake.dto';

type RepoMock = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function createRepoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => payload),
  };
}

describe('PublicLeadsService', () => {
  it('creates lead and ticket on first intake', async () => {
    const leadRepository = createRepoMock();
    const eventRepository = createRepoMock();
    const ticketsService = {
      createFromLead: jest.fn(async () => ({ id: 'ticket-1' })),
    };

    leadRepository.findOne.mockResolvedValue(null);

    const service = new PublicLeadsService(
      leadRepository as any,
      eventRepository as any,
      ticketsService as any,
    );

    const result = await service.ingest(
      {
        tenantId: 'tenant-1',
        source: PublicLeadSource.CONTACT_FORM,
        email: 'Lead@Company.com',
        fullName: 'Lead User',
        message: 'Need pricing details',
      },
      {
        gatewayId: 'skuldbotweb',
        requestId: 'req-1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(result.deduplicated).toBe(false);
    expect(result.ticketId).toBe('ticket-1');
    expect(leadRepository.save).toHaveBeenCalledTimes(1);
    expect(eventRepository.save).toHaveBeenCalledTimes(1);
  });

  it('deduplicates by tenant + email and increments intake count', async () => {
    const leadRepository = createRepoMock();
    const eventRepository = createRepoMock();
    const ticketsService = {
      createFromLead: jest.fn(async () => ({ id: 'ticket-2' })),
    };

    leadRepository.findOne.mockResolvedValue({
      id: 'lead-existing',
      tenantId: 'tenant-1',
      email: 'lead@company.com',
      normalizedEmail: 'lead@company.com',
      fullName: 'Existing',
      company: 'Acme',
      employees: null,
      latestInquiryType: 'sales',
      latestMessage: 'existing',
      firstSource: PublicLeadSource.CONTACT_FORM,
      lastSource: PublicLeadSource.CONTACT_FORM,
      firstSourceTimestamp: new Date(),
      lastSourceTimestamp: new Date(),
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      intakeCount: 3,
      metadata: {},
    });

    const service = new PublicLeadsService(
      leadRepository as any,
      eventRepository as any,
      ticketsService as any,
    );

    const result = await service.ingest(
      {
        tenantId: 'tenant-1',
        source: PublicLeadSource.SUPPORT_REQUEST,
        email: 'lead@company.com',
        inquiryType: 'support',
        message: 'Production issue',
      },
      {
        gatewayId: 'skuldbotweb',
        requestId: 'req-2',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
    );

    expect(result.deduplicated).toBe(true);
    expect(result.intakeCount).toBe(4);
    expect(ticketsService.createFromLead).toHaveBeenCalledTimes(1);
    expect(eventRepository.save).toHaveBeenCalledTimes(1);
  });
});
