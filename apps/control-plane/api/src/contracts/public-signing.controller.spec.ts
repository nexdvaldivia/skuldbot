import { PublicSigningController } from './public-signing.controller';

describe('PublicSigningController', () => {
  function createController() {
    const publicSigningService = {
      getSigningPage: jest.fn(),
      requestEmailOtp: jest.fn(),
      sign: jest.fn(),
    };
    return {
      controller: new PublicSigningController(publicSigningService as unknown as never),
      mocks: { publicSigningService },
    };
  }

  it('delegates get signing page', async () => {
    const { controller, mocks } = createController();
    mocks.publicSigningService.getSigningPage.mockResolvedValue({ envelopeId: 'env-1' });
    const result = await controller.getSigningPage('token-1');
    expect(result).toEqual({ envelopeId: 'env-1' });
    expect(mocks.publicSigningService.getSigningPage).toHaveBeenCalledWith('token-1');
  });

  it('delegates email otp request with request metadata', async () => {
    const { controller, mocks } = createController();
    mocks.publicSigningService.requestEmailOtp.mockResolvedValue({ success: true });
    const result = await controller.requestEmailOtp('token-1', {
      headers: { 'user-agent': 'jest-agent' },
      ip: '127.0.0.1',
    } as unknown as never);
    expect(result).toEqual({ success: true });
    expect(mocks.publicSigningService.requestEmailOtp).toHaveBeenCalledWith(
      'token-1',
      '127.0.0.1',
      'jest-agent',
    );
  });

  it('delegates sign and injects ip/user-agent defaults', async () => {
    const { controller, mocks } = createController();
    mocks.publicSigningService.sign.mockResolvedValue({ success: true });
    const result = await controller.sign(
      'token-1',
      { signatureType: 'typed', signatureValue: 'John Doe' } as unknown as never,
      { headers: { 'user-agent': 'jest-agent' }, ip: '127.0.0.1' } as unknown as never,
    );
    expect(result).toEqual({ success: true });
    expect(mocks.publicSigningService.sign).toHaveBeenCalledWith(
      'token-1',
      expect.objectContaining({
        ipAddress: '127.0.0.1',
        userAgent: 'jest-agent',
      }),
    );
  });
});
