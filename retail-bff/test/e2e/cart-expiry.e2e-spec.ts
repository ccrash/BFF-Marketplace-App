import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CartExpiryService } from '../../src/cart/cart-expiry.service';

describe('Cart expiry (E2E)', () => {
  let app: INestApplication;
  let cartExpiryService: CartExpiryService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    cartExpiryService = app.get(CartExpiryService);

    // Fake timers must be activated AFTER app.init() so CartExpiryService.onModuleInit()
    // creates a real interval handle. That handle can then be properly cleared by
    // onModuleDestroy() once real timers are restored in afterEach.
    jest.useFakeTimers();
  });

  afterEach(async () => {
    // Restore real timers BEFORE app.close() so clearInterval in onModuleDestroy()
    // uses the real implementation and can clear the real interval handle.
    jest.useRealTimers();
    await app.close();
  });

  it('marks cart as EXPIRED after 2 minutes of inactivity', async () => {
    const { body: { cartId } } = await request(app.getHttpServer()).post('/cart').expect(201);

    // Advance time past the 2-minute inactivity window
    jest.setSystemTime(Date.now() + 2 * 60 * 1000 + 1000);

    // Trigger expiry check directly
    cartExpiryService.releaseExpiredCarts();

    // Cart should now return 410 Gone
    await request(app.getHttpServer()).get(`/cart/${cartId}`).expect(410);
  });

  it('releases reserved stock when cart expires', async () => {
    const { body: stockBefore } = await request(app.getHttpServer()).get('/products/prod_003');
    const availableBefore = stockBefore.stock.available;

    const { body: { cartId } } = await request(app.getHttpServer()).post('/cart').expect(201);
    await request(app.getHttpServer())
      .post(`/cart/${cartId}/items`)
      .send({ productId: 'prod_003', quantity: 5 })
      .expect(201);

    // Confirm stock was reserved
    const { body: during } = await request(app.getHttpServer()).get('/products/prod_003');
    expect(during.stock.available).toBe(availableBefore - 5);

    // Advance past expiry and trigger check
    jest.setSystemTime(Date.now() + 3 * 60 * 1000);
    cartExpiryService.releaseExpiredCarts();

    // Stock should be restored
    const { body: after } = await request(app.getHttpServer()).get('/products/prod_003');
    expect(after.stock.available).toBe(availableBefore);
  });

  it('expired cart cannot be mutated (returns 410)', async () => {
    const { body: { cartId } } = await request(app.getHttpServer()).post('/cart').expect(201);

    jest.setSystemTime(Date.now() + 3 * 60 * 1000);
    cartExpiryService.releaseExpiredCarts();

    await request(app.getHttpServer())
      .post(`/cart/${cartId}/items`)
      .send({ productId: 'prod_003', quantity: 1 })
      .expect(410);
  });
});
