'use strict'

require('localstorage-polyfill')  // exports 'localStorage' global
global.URL = require('url').URL
global.URLSearchParams = require('url').URLSearchParams

const chai = require('chai')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
const chaiAsPromised = require('chai-as-promised')

chai.use(sinonChai)
chai.use(chaiAsPromised)
chai.should()

const expect = chai.expect

const SolidAuthOIDC = require('../src/index')

describe('SolidAuthOIDC', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('login()', () => {
    let auth, providerUri

    beforeEach(() => {
      auth = new SolidAuthOIDC()
      providerUri = 'https://provider.example.com'
    })

    it('should invoke selectProvider() if provider uri is not given', () => {
      let selectProvider = sinon.stub(auth, 'selectProvider').resolves(null)

      return auth.login()
        .then(() => {
          expect(selectProvider).to.have.been.called
        })
    })

    it('should invoke selectProvider() with a given provider uri', () => {
      let selectProvider = sinon.stub(auth, 'selectProvider').resolves(null)

      return auth.login(providerUri)
        .then(() => {
          expect(selectProvider).to.have.been.calledWith(providerUri)
        })
    })

    it('should load a client for a given provider uri', () => {
      let loadOrRegisterClient = sinon.stub(auth, 'loadOrRegisterClient')
        .resolves(null)

      return auth.login(providerUri)
        .then(() => {
          expect(loadOrRegisterClient).to.have.been.calledWith(providerUri)
        })
    })

    it('should validate a loaded client for a given provider uri', () => {
      let mockClient = {}

      let loadOrRegisterClient = sinon.stub(auth, 'loadOrRegisterClient')
        .resolves(mockClient)

      let validateStub = sinon.stub(auth, 'validateOrSendAuthRequest')

      return auth.login(providerUri)
        .then(() => {
          expect(validateStub).to.have.been.calledWith(mockClient)
        })
    })
  })

  describe('logout()', () => {
    let auth

    beforeEach(() => {
      auth = new SolidAuthOIDC()
    })

    it('should clear the current user', () => {
      let clearCurrentUser = sinon.spy(auth, 'clearCurrentUser')

      return auth.logout()
        .then(() => {
          expect(clearCurrentUser).to.have.been.called
        })
    })

    it('should resolve with null if no current client exists', () => {
      expect(auth.logout()).to.eventually.equal(null)
    })

    it('should invoke logout() on the current client', () => {
      auth.currentClient = {
        logout: sinon.stub().resolves(null)
      }

      return auth.logout()
        .then(() => {
          expect(auth.currentClient.logout).to.have.been.called
        })
    })
  })

  describe('keyByState()', () => {
    it('should throw an error if no state param is passed to it', () => {
      let auth = new SolidAuthOIDC()

      expect(auth.keyByState).to.throw(/No state provided/)
    })

    it('should compose a key from the state param', () => {
      let auth = new SolidAuthOIDC()
      let key = auth.keyByState('abcd')

      expect(key).to.equal('oidc.rp.by-state.abcd')
    })
  })

  describe('providerFromCurrentUri()', () => {
    var auth
    beforeEach(() => {
      auth = new SolidAuthOIDC({ window: { location: {} } })
    })

    it('should return null when no state param present', () => {
      auth.window.location.href = 'https://client-app.example.com'
      let providerUri = auth.providerFromCurrentUri()

      expect(providerUri).to.not.exist
    })

    it('should return null if no provider was saved', () => {
      let state = 'abcd'
      auth.window.location.href = `https://client-app.example.com#state=${state}`
      let loadedProviderUri = auth.providerFromCurrentUri()

      expect(loadedProviderUri).to.not.exist
    })

    it('should load provider from current uri state param', () => {
      let providerUri = 'https://provider.example.com'
      let state = 'abcd'
      auth.saveProviderByState(state, providerUri)
      auth.window.location.href = `https://client-app.example.com#state=${state}`

      let loadedProviderUri = auth.providerFromCurrentUri()

      expect(loadedProviderUri).to.equal(providerUri)
    })
  })

  describe('provider persistence', () => {
    it('should store and load provider uri, by state', () => {
      let auth = new SolidAuthOIDC()
      let providerUri = 'https://provider.example.com'
      let state = 'abcd'
      // Check to see that provider doesn't exist initially
      expect(auth.loadProvider(state)).to.not.exist

      // Save the provider uri to local storage
      auth.saveProviderByState(state, providerUri)

      // Check that it was saved and can be loaded
      expect(auth.loadProvider(state)).to.equal(providerUri)
    })
  })

  describe('extractState()', () => {
    var auth

    beforeEach(() => {
      auth = new SolidAuthOIDC()
    })

    it('should return null when no uri is provided', () => {
      let state = auth.extractState()

      expect(state).to.not.exist
    })

    it('should return null when uri has no query or hash fragment', () => {
      let state = auth.extractState('https://example.com')

      expect(state).to.not.exist
    })

    it('should extract the state param from query fragments', () => {
      let uri = 'https://example.com?param1=value1&state=abcd'
      let state = auth.extractState(uri, 'query')

      expect(state).to.equal('abcd')

      uri = 'https://example.com?param1=value1'
      state = auth.extractState(uri, 'query')

      expect(state).to.not.exist
    })

    it('should extract the state param from hash fragments', () => {
      let uri = 'https://example.com#param1=value1&state=abcd'
      let state = auth.extractState(uri)  // 'hash' is the default second param

      expect(state).to.equal('abcd')

      uri = 'https://example.com#param1=value1'
      state = auth.extractState(uri, 'hash')

      expect(state).to.not.exist
    })
  })

  describe('selectProvider()', () => {
    it('should pass through a given providerUri', () => {
      let auth = new SolidAuthOIDC()
      let providerUri = 'https://provider.example.com'

      expect(auth.selectProvider(providerUri)).to.eventually.equal(providerUri)
    })

    it('should derive a provider from the current uri', () => {
      let auth = new SolidAuthOIDC()
      let providerUri = 'https://provider.example.com'
      auth.providerFromCurrentUri = sinon.stub().returns(providerUri)

      return auth.selectProvider()
        .then(selectedProvider => {
          expect(selectedProvider).to.equal(providerUri)
          expect(auth.providerFromCurrentUri).to.have.been.called
        })
    })

    it('should obtain provider from UI, if not present or cached', () => {
      let auth = new SolidAuthOIDC()
      let providerUri = 'https://provider.example.com'
      auth.providerFromCurrentUri = sinon.stub().returns(null)
      auth.providerFromUI = sinon.stub().resolves(providerUri)

      return auth.selectProvider()
        .then(selectedProvider => {
          expect(selectedProvider).to.equal(providerUri)
          expect(auth.providerFromUI).to.have.been.called
        })
    })
  })

  describe('client persistence', () => {
    let providerUri = 'https://provider.example.com'
    let clientConfig = { provider: { url: providerUri }}
    let mockClient = {
      provider: { url: providerUri },
      serialize: () => { return clientConfig }
    }
    var auth

    beforeEach(() => {
      auth = new SolidAuthOIDC()
    })

    describe('loadClient()', () => {
      it('should throw an error if no providerUri given', () => {
        expect(auth.loadClient()).to.be.rejected
      })

      it('should return cached client if for the same provider', () => {
        auth.currentClient = mockClient

        expect(auth.loadClient(providerUri)).to.eventually.equal(mockClient)
      })

      it('should NOT return cached client if for different provider', () => {
        let providerUri = 'https://provider.example.com'
        auth.currentClient = {
          provider: { url: 'https://another.provider.com' }
        }

        expect(auth.loadClient(providerUri)).to.eventually.not.exist
      })
    })

    it('should store and load serialized clients', () => {
      let auth = new SolidAuthOIDC()

      auth.storeClient(mockClient, providerUri)
      // Storing a client should cache it in the auth client
      expect(auth.currentClient).to.equal(mockClient)

      return auth.loadClient(providerUri)
        .then(loadedClient => {
          expect(loadedClient.provider.url).to.equal(providerUri)
        })
    })
  })

  describe('currentLocation()', () => {
    it('should return the current window uri', () => {
      let currentUri = 'https://client-app.example.com'
      let auth = new SolidAuthOIDC({ window: { location: { href: currentUri } } })

      expect(auth.currentLocation()).to.equal(currentUri)
    })
  })

  describe('validateOrSendAuthRequest()', () => {
    var auth

    beforeEach(() => {
      localStorage.clear()
      auth = new SolidAuthOIDC({ window: { location: {} } })
    })

    it('should throw an error when no client is given', () => {
      expect(auth.validateOrSendAuthRequest())
        .to.be.rejectedWith(/Could not load or register a RelyingParty client/)
    })

    it('should init user from auth response if present in current uri', () => {
      let state = 'abcd'
      auth.window.location.href = `https://client-app.example.com#state=${state}`
      let aliceWebId = 'https://alice.example.com/'
      let initUserFromResponseStub = sinon.stub().resolves(aliceWebId)
      auth.initUserFromResponse = initUserFromResponseStub
      let mockClient = {}

      return auth.validateOrSendAuthRequest(mockClient)
        .then(webId => {
          expect(webId).to.equal(aliceWebId)
          expect(initUserFromResponseStub).to.have.been.calledWith(mockClient)
        })
    })

    it('should send an auth request if no auth response in current uri', () => {
      let sendAuthRequestStub = sinon.stub().resolves(null)
      auth.sendAuthRequest = sendAuthRequestStub
      let mockClient = {}

      return auth.validateOrSendAuthRequest(mockClient)
        .then(() => {
          expect(sendAuthRequestStub).to.have.been.calledWith(mockClient)
        })
    })
  })

  describe('initUserFromResponse()', () => {
    var auth

    beforeEach(() => {
      localStorage.clear()
      auth = new SolidAuthOIDC({ window: { location: {} } })
    })

    it('should validate the auth response', () => {
      let aliceWebId = 'https://alice.example.com/'
      let authResponse = {
        params: {
          id_token: 'sample.id.token',
          access_token: 'sample.access.token'
        },
        decoded: {
          payload: { sub: aliceWebId }
        }
      }
      let validateResponseStub = sinon.stub().resolves(authResponse)
      let mockClient = {
        validateResponse: validateResponseStub
      }

      return auth.initUserFromResponse(mockClient)
        .then(webId => {
          expect(webId).to.equal(aliceWebId)
          expect(validateResponseStub).to.have.been.called
        })
    })
  })

  describe('sendAuthRequest()', () => {
    it('should compose an auth request uri, save provider, and redirect', () => {
      let auth = new SolidAuthOIDC({ window: { location: {} } })
      let state = 'abcd'
      let providerUri = 'https://provider.example.com'
      let authUri = `https://provider.example.com/authorize?state=${state}`
      let createRequestStub = sinon.stub().resolves(authUri)
      let mockClient = {
        provider: { url: providerUri },
        createRequest: createRequestStub
      }

      auth.sendAuthRequest(mockClient)
        .then(() => {
          // ensure providerUri was saved
          expect(auth.loadProvider(state)).to.equal(providerUri)
          // ensure the redirect happened
          expect(auth.currentLocation()).to.equal(authUri)
        })
    })
  })

  describe('currentUser()', () => {
    it('should return cached webId if present', () => {
      let aliceWebId = 'https://alice.example.com'
      let auth = new SolidAuthOIDC()
      auth.webId = aliceWebId

      expect(auth.currentUser()).to.eventually.equal(aliceWebId)
    })

    it('should return null if no cached webId and no current state param', () => {
      let auth = new SolidAuthOIDC({ window: { location: {} } })

      expect(auth.currentUser()).to.eventually.not.exist
    })

    it('should automatically login if current uri has state param', () => {
      let state = 'abcd'
      let providerUri = 'https://provider.example.com'
      let auth = new SolidAuthOIDC({ window: { location: {} } })
      auth.saveProviderByState(state, providerUri)

      auth.window.location.href = `https://client-app.example.com#state=${state}`
      let aliceWebId = 'https://alice.example.com/'
      let loginStub = sinon.stub().resolves(aliceWebId)
      auth.login = loginStub

      return auth.currentUser()
        .then(webId => {
          expect(webId).to.equal(aliceWebId)
          expect(loginStub).to.have.been.calledWith(providerUri)
        })
    })
  })
})