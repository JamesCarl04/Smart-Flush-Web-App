// Mock Next fonts
jest.mock('next/font/local', () => () => ({
  variable: '--font-geist-sans',
  className: 'mock-font-class',
}))

// Mock next/og ImageResponse for Node.js test environment
jest.mock('next/og', () => ({
  ImageResponse: jest.fn().mockImplementation((element, options) => ({
    element,
    options,
    headers: {
      get: (header) => (header.toLowerCase() === 'content-type' ? 'image/png' : null),
    },
  })),
}))

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      replace: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
      isFallback: false,
    }
  },
}))

// Mock Firebase
jest.mock('@/lib/firebase', () => ({
  app: {},
}))

jest.mock('@/lib/firebase-admin', () => ({
  adminApp: {},
  adminDb: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
      add: jest.fn(),
      where: jest.fn(() => ({
        get: jest.fn(),
        limit: jest.fn(() => ({
          get: jest.fn(),
        })),
      })),
    })),
  },
  adminAuth: {
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
  },
  adminMessaging: {
    sendMulticast: jest.fn(),
  },
}))

// Suppress console errors in tests unless explicitly checking them
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
        args[0].includes('Not implemented: HTMLFormElement'))
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})
