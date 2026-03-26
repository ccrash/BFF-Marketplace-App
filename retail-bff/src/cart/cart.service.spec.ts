import { NotFoundException, GoneException, ConflictException } from '@nestjs/common';
import { CartService, CART_INACTIVITY_MS } from './cart.service';
import { StockService } from '../stock/stock.service';
import { ProductsService } from '../products/products.service';
import { DiscountsService } from '../discounts/discounts.service';
import { DiscountEngineService } from '../discounts/discount-engine.service';

function makeStockService(): jest.Mocked<StockService> {
  return {
    reserve: jest.fn(),
    adjustReservation: jest.fn(),
    releaseAllReservations: jest.fn(),
    commitReservations: jest.fn(),
    getStockLevel: jest.fn().mockReturnValue({ available: 100, reserved: 0, sold: 0, productId: 'prod_001' }),
    getCartReservations: jest.fn().mockReturnValue(new Map()),
    getAllStockLevels: jest.fn(),
  } as any;
}

function makeProductsService(): jest.Mocked<ProductsService> {
  return {
    getProduct: jest.fn().mockReturnValue({
      id: 'prod_001',
      name: 'Sony Headphones',
      price: 27999,
      category: 'electronics',
      sku: 'SNY-001',
      description: '',
      imageUrl: '',
    }),
    findAll: jest.fn(),
    findOne: jest.fn(),
  } as any;
}

function makeDiscountsService(): jest.Mocked<DiscountsService> {
  return {
    getActiveDiscounts: jest.fn().mockReturnValue([]),
    findAll: jest.fn(),
    findOne: jest.fn(),
  } as any;
}

function makeDiscountEngine(): jest.Mocked<DiscountEngineService> {
  return {
    applyAll: jest.fn().mockReturnValue({ appliedDiscounts: [], discountTotal: 0 }),
  } as any;
}

describe('CartService', () => {
  let cartService: CartService;
  let stockService: jest.Mocked<StockService>;
  let productsService: jest.Mocked<ProductsService>;

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    stockService = makeStockService();
    productsService = makeProductsService();
    cartService = new CartService(
      stockService,
      productsService,
      makeDiscountsService(),
      makeDiscountEngine(),
    );
  });

  describe('createCart', () => {
    it('returns a cartId and expiresAt', () => {
      const before = new Date();
      const result = cartService.createCart();
      expect(result.cartId).toBeDefined();
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime() + CART_INACTIVITY_MS - 50,
      );
    });

    it('each call returns a unique cartId', () => {
      const { cartId: id1 } = cartService.createCart();
      const { cartId: id2 } = cartService.createCart();
      expect(id1).not.toBe(id2);
    });
  });

  describe('addItem', () => {
    it('calls stockService.reserve with correct args', () => {
      const { cartId } = cartService.createCart();
      cartService.addItem(cartId, 'prod_001', 2);
      expect(stockService.reserve).toHaveBeenCalledWith(cartId, 'prod_001', 2);
    });

    it('updates expiresAt on activity', () => {
      const { cartId, expiresAt: originalExpiry } = cartService.createCart();
      // Advance mock time slightly
      jest.useFakeTimers();
      jest.advanceTimersByTime(5000);
      cartService.addItem(cartId, 'prod_001', 1);
      const view = cartService.getCartView(cartId);
      expect(view.expiresAt.getTime()).toBeGreaterThan(originalExpiry.getTime());
    });

    it('increments quantity for existing item', () => {
      const { cartId } = cartService.createCart();
      cartService.addItem(cartId, 'prod_001', 1);
      cartService.addItem(cartId, 'prod_001', 2);
      const view = cartService.getCartView(cartId);
      expect(view.items[0].quantity).toBe(3);
      expect(stockService.adjustReservation).toHaveBeenCalledWith(cartId, 'prod_001', 3);
    });
  });

  describe('removeItem', () => {
    it('calls adjustReservation with qty 0', () => {
      const { cartId } = cartService.createCart();
      cartService.addItem(cartId, 'prod_001', 3);
      cartService.removeItem(cartId, 'prod_001');
      expect(stockService.adjustReservation).toHaveBeenCalledWith(cartId, 'prod_001', 0);
    });

    it('throws NotFoundException when item not in cart', () => {
      const { cartId } = cartService.createCart();
      expect(() => cartService.removeItem(cartId, 'prod_999')).toThrow(NotFoundException);
    });
  });

  describe('updateItem', () => {
    it('delegates to removeItem when quantity is 0', () => {
      const { cartId } = cartService.createCart();
      cartService.addItem(cartId, 'prod_001', 3);
      cartService.updateItem(cartId, 'prod_001', 0);
      expect(stockService.adjustReservation).toHaveBeenCalledWith(cartId, 'prod_001', 0);
    });
  });

  describe('cart status guards', () => {
    it('throws NotFoundException for unknown cart', () => {
      expect(() => cartService.getCartView('nonexistent')).toThrow(NotFoundException);
    });

    it('throws GoneException for expired cart', () => {
      const { cartId } = cartService.createCart();
      cartService.markExpired(cartId);
      expect(() => cartService.getCartView(cartId)).toThrow(GoneException);
    });

    it('throws ConflictException for checked-out cart', () => {
      const { cartId } = cartService.createCart();
      cartService.markCheckedOut(cartId);
      expect(() => cartService.getCartView(cartId)).toThrow(ConflictException);
    });
  });

  describe('getExpiredCarts', () => {
    it('returns carts past expiresAt', () => {
      const { cartId } = cartService.createCart();
      const future = new Date(Date.now() + CART_INACTIVITY_MS + 1000);
      const expired = cartService.getExpiredCarts(future);
      expect(expired.some((c) => c.id === cartId)).toBe(true);
    });

    it('does not return carts that have not yet expired', () => {
      const { cartId } = cartService.createCart();
      const justNow = new Date();
      const expired = cartService.getExpiredCarts(justNow);
      expect(expired.some((c) => c.id === cartId)).toBe(false);
    });

    it('does not return already-expired carts', () => {
      const { cartId } = cartService.createCart();
      cartService.markExpired(cartId);
      const future = new Date(Date.now() + 999999);
      const expired = cartService.getExpiredCarts(future);
      expect(expired.some((c) => c.id === cartId)).toBe(false);
    });
  });
});
