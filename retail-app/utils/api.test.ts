import {
  ApiError,
  getProducts,
  getProduct,
  createCart,
  getCart,
  addItemToCart,
  updateCartItem,
  removeCartItem,
  abandonCart,
  checkout,
} from './api'

const BFF_BASE = process.env.EXPO_PUBLIC_BFF_URL ?? 'http://localhost:3000'

const mockFetchOk = (data: unknown, status = 200) => {
  ;(global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    status,
    json: async () => data,
  })
}

const mockFetchError = (status: number, message = `HTTP ${status}`) => {
  ;(global as any).fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ message }),
  })
}

afterEach(() => {
  jest.resetAllMocks()
  jest.useRealTimers()
  ;(global as any).fetch = undefined
})

// ── ApiError ─────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('has correct name and status', () => {
    const err = new ApiError(404, 'Not found')
    expect(err.name).toBe('ApiError')
    expect(err.status).toBe(404)
    expect(err.message).toBe('Not found')
  })
})

// ── Products ──────────────────────────────────────────────────────────────────

describe('getProducts', () => {
  it('GETs /products and returns array', async () => {
    const data = [{ id: 'prod_001', name: 'Sony Headphones', price: 27999 }]
    mockFetchOk(data)
    const res = await getProducts()
    const [url] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${BFF_BASE}/products`)
    expect(res).toBe(data)
  })

  it('throws ApiError on non-ok response', async () => {
    mockFetchError(500, 'Internal Server Error')
    await expect(getProducts()).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Internal Server Error',
    })
  })
})

describe('getProduct', () => {
  it('GETs /products/:id', async () => {
    const data = { id: 'prod_001', name: 'Sony', price: 27999 }
    mockFetchOk(data)
    const res = await getProduct('prod_001')
    const [url] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${BFF_BASE}/products/prod_001`)
    expect(res).toBe(data)
  })

  it('throws ApiError 404 when product not found', async () => {
    mockFetchError(404, 'Not Found')
    await expect(getProduct('bad-id')).rejects.toMatchObject({ status: 404 })
  })
})

// ── Cart ──────────────────────────────────────────────────────────────────────

describe('createCart', () => {
  it('POSTs to /cart and returns cartId', async () => {
    mockFetchOk({ cartId: 'abc-123', expiresAt: '2099-01-01T00:00:00Z' })
    const res = await createCart()
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${BFF_BASE}/cart`)
    expect(opts.method).toBe('POST')
    expect(res.cartId).toBe('abc-123')
  })
})

describe('getCart', () => {
  it('GETs /cart/:cartId', async () => {
    const data = { cartId: 'abc', status: 'ACTIVE', items: [] }
    mockFetchOk(data)
    const res = await getCart('abc')
    const [url] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${BFF_BASE}/cart/abc`)
    expect(res).toBe(data)
  })

  it('throws ApiError 410 for expired cart', async () => {
    mockFetchError(410, 'Cart has expired')
    await expect(getCart('old-cart')).rejects.toMatchObject({ status: 410 })
  })
})

describe('addItemToCart', () => {
  it('POSTs to /cart/:cartId/items with productId and quantity', async () => {
    const cart = { cartId: 'abc', items: [{ productId: 'p1', quantity: 1 }] }
    mockFetchOk(cart)
    const res = await addItemToCart('abc', 'p1', 1)
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${BFF_BASE}/cart/abc/items`)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ productId: 'p1', quantity: 1 })
    expect(res).toBe(cart)
  })

  it('throws ApiError 400 on insufficient stock', async () => {
    mockFetchError(400, 'Insufficient stock')
    await expect(addItemToCart('abc', 'p1', 99)).rejects.toMatchObject({
      status: 400,
      message: 'Insufficient stock',
    })
  })
})

describe('updateCartItem', () => {
  it('PATCHes /cart/:cartId/items/:productId with quantity', async () => {
    const cart = { cartId: 'abc', items: [] }
    mockFetchOk(cart)
    await updateCartItem('abc', 'p1', 3)
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${BFF_BASE}/cart/abc/items/p1`)
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body)).toEqual({ quantity: 3 })
  })
})

describe('removeCartItem', () => {
  it('DELETEs /cart/:cartId/items/:productId', async () => {
    mockFetchOk({ cartId: 'abc', items: [] })
    await removeCartItem('abc', 'p1')
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${BFF_BASE}/cart/abc/items/p1`)
    expect(opts.method).toBe('DELETE')
  })
})

describe('abandonCart', () => {
  it('DELETEs /cart/:cartId and returns undefined for 204', async () => {
    ;(global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => { throw new Error('no body') },
    })
    const res = await abandonCart('abc')
    expect(res).toBeUndefined()
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${BFF_BASE}/cart/abc`)
    expect(opts.method).toBe('DELETE')
  })
})

describe('checkout', () => {
  it('POSTs to /checkout/:cartId and returns order summary', async () => {
    const order = { orderId: 'ord-1', cartId: 'abc', totalPaid: 27999 }
    mockFetchOk(order)
    const res = await checkout('abc')
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe(`${BFF_BASE}/checkout/abc`)
    expect(opts.method).toBe('POST')
    expect(res).toBe(order)
  })

  it('throws ApiError on failure', async () => {
    mockFetchError(410, 'Cart has expired')
    await expect(checkout('old')).rejects.toMatchObject({ status: 410 })
  })
})

// ── Network error ─────────────────────────────────────────────────────────────

describe('network errors', () => {
  it('throws ApiError with status 0 on network failure', async () => {
    ;(global as any).fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(getProducts()).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: 'Network error — check your connection',
    })
  })

  it('throws ApiError with status 0 on timeout', async () => {
    jest.useFakeTimers()
    ;(global as any).fetch = jest.fn((_url: string, opts?: RequestInit) =>
      new Promise<never>((_, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        })
      }),
    )

    // Attach the rejection handler before advancing timers to avoid unhandledRejection
    const assertion = expect(getProducts()).rejects.toMatchObject({ status: 0 })
    await jest.runAllTimersAsync()
    await assertion
  })
})
