/*
 The MIT License (MIT)

 Copyright (c) 2016-17 Solid

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.

 If you would like to know more about the solid Solid project, please see
 https://github.com/solid/solid
 */
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var RelyingParty = require('@trust/oidc-rp');
var PoPToken = require('@trust/oidc-rp/lib/PoPToken');
var providerSelectPopupSource = require('./provider-select-popup');

// URI parameter types
var HASH = 'hash';
var QUERY = 'query';

// AuthenticationRequest sending methods
var REDIRECT = 'redirect';

var ClientAuthOIDC = function () {
  /**
   * @constructor
   * @param [options={}]
   * @param [options.window=Window] Optionally inject global browser window
   * @param [options.store=localStorage] Optionally inject localStorage
   */
  function ClientAuthOIDC() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, ClientAuthOIDC);

    this.window = options.window || global.window;
    this.store = options.store || global.localStorage;

    this.currentClient = null;
    this.providerUri = null;
    this.webId = null;
    this.idToken = null;
    this.accessToken = null;
    this.method = REDIRECT; // only redirect is currently supported
  }

  _createClass(ClientAuthOIDC, [{
    key: 'initEventListeners',
    value: function initEventListeners(window) {
      window.addEventListener('message', this.onMessage.bind(this));
    }

    /**
     * Returns the current window's URI
     *
     * @return {string|null}
     */

  }, {
    key: 'currentLocation',
    value: function currentLocation() {
      var window = this.window;

      if (!window || !window.location) {
        return null;
      }

      return window.location.href;
    }

    /**
     * @return {Promise<string>} Resolves to current user's WebID URI
     */

  }, {
    key: 'currentUser',
    value: function currentUser() {
      if (this.webId) {
        return Promise.resolve(this.webId);
      }

      // Attempt to find a provider based on the 'state' param of the current URI
      var providerUri = this.providerFromCurrentUri();

      if (providerUri) {
        return this.login(providerUri);
      } else {
        return Promise.resolve(null);
      }
    }

    /**
     * Returns the 'end session' api endpoint of the current RP client's provider
     * (e.g. 'https://example.com/logout'), if one is available.
     *
     * @return {string|null}
     */

  }, {
    key: 'providerEndSessionEndpoint',
    value: function providerEndSessionEndpoint() {
      var rp = this.currentClient;

      if (!rp || !rp.provider || !rp.provider.configuration) {
        return null;
      }

      var config = rp.provider.configuration;

      if (!config.end_session_endpoint) {
        return null;
      }

      return config.end_session_endpoint;
    }

    /**
     * Extracts and returns the `state` query or hash fragment param from a uri
     *
     * @param uri {string}
     * @param uriType {string} 'hash' or 'query'
     *
     * @return {string|null} Value of the `state` query or hash fragment param
     */

  }, {
    key: 'extractState',
    value: function extractState(uri) {
      var uriType = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : HASH;

      if (!uri) {
        return null;
      }
      var uriObj = new URL(uri);
      var state = void 0;

      if (uriType === HASH) {
        var hash = uriObj.hash || '#';
        var params = new URLSearchParams(hash.substr(1));
        state = params.get('state');
      }

      if (uriType === QUERY) {
        state = uriObj.searchParams.get('state');
      }

      return state;
    }
  }, {
    key: 'keyByProvider',
    value: function keyByProvider(providerUri) {
      return 'oidc.rp.by-provider.' + providerUri;
    }
  }, {
    key: 'keyByState',
    value: function keyByState(state) {
      if (!state) {
        throw new TypeError('No state provided to keyByState()');
      }
      return 'oidc.rp.by-state.' + state;
    }

    /**
     * @param providerUri {string}
     *
     * @return {Promise<RelyingParty>}
     */

  }, {
    key: 'loadOrRegisterClient',
    value: function loadOrRegisterClient(providerUri) {
      var _this = this;

      this.currentClient = null;

      return this.loadClient(providerUri).then(function (loadedClient) {
        if (loadedClient) {
          _this.currentClient = loadedClient;
          return loadedClient;
        } else {
          _this.currentClient = null;
          return _this.registerClient(providerUri);
        }
      });
    }

    /**
     * @param providerUri {string}
     * @return {Promise<RelyingParty>}
     */

  }, {
    key: 'loadClient',
    value: function loadClient(providerUri) {
      if (!providerUri) {
        var error = new Error('Cannot load or register client, providerURI missing');
        return Promise.reject(error);
      }
      if (this.currentClient && this.currentClient.provider.url === providerUri) {
        // Client is cached, return it
        return Promise.resolve(this.currentClient);
      }

      // Check for client config stored locally
      var key = this.keyByProvider(providerUri);
      var clientConfig = this.store.getItem(key);

      if (clientConfig) {
        clientConfig = JSON.parse(clientConfig);
        return RelyingParty.from(clientConfig);
      } else {
        return Promise.resolve(null);
      }
    }

    /**
     * Loads a provider's URI from store, given a `state` uri param.
     * @param state {string}
     * @return {string}
     */

  }, {
    key: 'loadProvider',
    value: function loadProvider(state) {
      var key = this.keyByState(state);
      var providerUri = this.store.getItem(key);
      return providerUri;
    }

    /**
     * Resolves to the WebID URI of the current user. Intended to be triggered
     * when the user initiates login explicitly (such as by pressing a Login
     * button, etc).
     *
     * @param [providerUri] {string} Provider URI, result of a Provider Selection
     *   operation (that the app developer has provided). If `null`, the
     *   `selectProvider()` step will kick off its own UI for Provider Selection.
     *
     * @return {Promise<string>} Resolves to the logged in user's WebID URI
     */

  }, {
    key: 'login',
    value: function login(providerUri) {
      var _this2 = this;

      this.clearCurrentUser();

      return Promise.resolve(providerUri).then(function (providerUri) {
        return _this2.selectProvider(providerUri);
      }).then(function (selectedProviderUri) {
        if (selectedProviderUri) {
          return _this2.loadOrRegisterClient(selectedProviderUri);
        }
      }).then(function (client) {
        if (client) {
          return _this2.validateOrSendAuthRequest(client);
        }
      });
    }
  }, {
    key: 'clearCurrentUser',
    value: function clearCurrentUser() {
      this.webId = null;
      this.accessToken = null;
      this.idToken = null;
    }

    /**
     * Clears the current user and tokens, and does a url redirect to the
     * current RP client's provider's 'end session' endpoint.
     * A redirect is done (instead of an ajax 'get') to enable the provider to
     * clear any http-only session cookies.
     */

  }, {
    key: 'logout',
    value: function logout() {
      this.clearCurrentUser();

      var logoutEndpoint = this.providerEndSessionEndpoint();

      if (!logoutEndpoint) {
        return;
      }

      var logoutUrl = new URL(logoutEndpoint);

      logoutUrl.searchParams.set('returnToUrl', this.currentLocation());

      this.redirectTo(logoutUrl.toString());
    }

    /**
     * Resolves to the URI of an OIDC identity provider, from one of the following:
     *
     * 1. If a `providerUri` was passed in by the app developer (perhaps they
     *   developed a custom 'Select Provider' UI), that value is returned.
     * 2. The current `this.providerUri` cached on this auth client, if present
     * 3. The `state` parameter of the current window URI (in case the user has
     *   gone through the login workflow and this page is the redirect back).
     * 3. Lastly, if none of the above worked, the clients opens its own
     *   'Select Provider' UI popup window, and sets up an event listener (for
     *   when a user makes a selection.
     *
     * @param [providerUri] {string} If the provider URI is already known to the
     *   app developer, just pass it through, no need to take further action.
     * @return {Promise<string>}
     */

  }, {
    key: 'selectProvider',
    value: function selectProvider(providerUri) {
      if (providerUri) {
        return Promise.resolve(providerUri);
      }

      // Attempt to find a provider based on the 'state' param of the current URI
      providerUri = this.providerFromCurrentUri();
      if (providerUri) {
        return Promise.resolve(providerUri);
      }

      // Lastly, kick off a Select Provider popup window workflow
      return this.providerFromUI();
    }

    /**
     * Parses the current URI's `state` hash param and attempts to load a
     * previously saved providerUri from it. If no `state` param is present, or if
     * no providerUri has been saved, returns `null`.
     *
     * @return {string|null} Provider URI, if present
     */

  }, {
    key: 'providerFromCurrentUri',
    value: function providerFromCurrentUri() {
      var currentUri = this.currentLocation();
      var stateParam = this.extractState(currentUri, HASH);

      if (stateParam) {
        return this.loadProvider(stateParam);
      } else {
        return null;
      }
    }
  }, {
    key: 'providerFromUI',
    value: function providerFromUI() {
      console.log('Getting provider from default popup UI');
      this.initEventListeners(this.window);

      if (this.selectProviderWindow) {
        // Popup has already been opened
        this.selectProviderWindow.focus();
      } else {
        // Open a new Provider Select popup window
        this.selectProviderWindow = this.window.open('', 'selectProviderWindow', 'menubar=no,resizable=yes,width=300,height=300');

        this.selectProviderWindow.document.write(providerSelectPopupSource);
        this.selectProviderWindow.document.close();
      }
    }

    /**
     * Tests whether the current URI is the result of an AuthenticationRequest
     * return redirect.
     * @return {boolean}
     */

  }, {
    key: 'currentUriHasAuthResponse',
    value: function currentUriHasAuthResponse() {
      var currentUri = this.currentLocation();
      var stateParam = this.extractState(currentUri, HASH);

      return !!stateParam;
    }

    /**
     * Redirects the current window to the given uri.
     * @param uri {string}
     */

  }, {
    key: 'redirectTo',
    value: function redirectTo(uri) {
      this.window.location.href = uri;

      return false;
    }

    /**
     * @private
     * @param client {RelyingParty}
     * @throws {Error}
     * @return {Promise<null>}
     */

  }, {
    key: 'sendAuthRequest',
    value: function sendAuthRequest(client) {
      var _this3 = this;

      var options = {};
      var providerUri = client.provider.url;

      return client.createRequest(options, this.store).then(function (authUri) {
        var state = _this3.extractState(authUri, QUERY);
        if (!state) {
          throw new Error('Invalid authentication request uri');
        }
        _this3.saveProviderByState(state, providerUri);
        if (_this3.method === REDIRECT) {
          return _this3.redirectTo(authUri);
        }
      });
    }

    /**
     * @param client {RelyingParty}
     * @throws {Error}
     * @return {Promise<null|string>} Resolves to either an AuthenticationRequest
     *   being sent (`null`), or to the webId of the current user (extracted
     *   from the authentication response).
     */

  }, {
    key: 'validateOrSendAuthRequest',
    value: function validateOrSendAuthRequest(client) {
      if (!client) {
        var error = new Error('Could not load or register a RelyingParty client');
        return Promise.reject(error);
      }

      if (this.currentUriHasAuthResponse()) {
        return this.initUserFromResponse(client);
      }

      return this.sendAuthRequest(client);
    }
  }, {
    key: 'issuePoPTokenFor',
    value: function issuePoPTokenFor(uri, session) {
      return PoPToken.issueFor(uri, session);
    }

    /**
     * Validates the auth response in the current uri, initializes the current
     * user's ID Token and Access token, and returns the user's WebID
     *
     * @param client {RelyingParty}
     *
     * @throws {Error}
     *
     * @returns {Promise<string>} Current user's web id
     */

  }, {
    key: 'initUserFromResponse',
    value: function initUserFromResponse(client) {
      var _this4 = this;

      return client.validateResponse(this.currentLocation(), this.store).then(function (response) {
        _this4.idToken = response.idToken;
        _this4.accessToken = response.accessToken;
        _this4.session = response;

        _this4.clearAuthResponseFromUrl();

        return _this4.extractAndValidateWebId(response.decoded);
      }).catch(function (error) {
        _this4.clearAuthResponseFromUrl();
        if (error.message === 'Cannot resolve signing key for ID Token.') {
          console.log('ID Token found, but could not validate. Provider likely has changed their public keys. Please retry login.');
          return null;
        } else {
          throw error;
        }
      });
    }

    /**
     * @param idToken {IDToken}
     *
     * @throws {Error}
     *
     * @return {string}
     */

  }, {
    key: 'extractAndValidateWebId',
    value: function extractAndValidateWebId(idToken) {
      var webId = idToken.payload.sub;
      this.webId = webId;
      return webId;
    }

    /**
     * Removes authentication response data (access token, id token etc) from
     * the current url's hash fragment.
     */

  }, {
    key: 'clearAuthResponseFromUrl',
    value: function clearAuthResponseFromUrl() {
      var clearedUrl = this.currentLocationNoHash();

      this.replaceCurrentUrl(clearedUrl);
    }
  }, {
    key: 'currentLocationNoHash',
    value: function currentLocationNoHash() {
      var currentLocation = this.currentLocation();
      if (!currentLocation) {
        return null;
      }

      var currentUrl = new URL(this.currentLocation());
      currentUrl.hash = ''; // remove the hash fragment
      var clearedUrl = currentUrl.toString();

      return clearedUrl;
    }
  }, {
    key: 'replaceCurrentUrl',
    value: function replaceCurrentUrl(newUrl) {
      var history = this.window.history;

      if (!history) {
        return;
      }

      history.replaceState(history.state, history.title, newUrl);
    }

    /**
     * @param providerUri {string}
     * @param [options={}]
     * @param [options.redirectUri] {string} Defaults to window.location.href
     * @param [options.scope='openid profile'] {string}
     * @throws {TypeError} If providerUri is missing
     * @return {Promise<RelyingParty>} Registered RelyingParty client instance
     */

  }, {
    key: 'registerClient',
    value: function registerClient(providerUri) {
      var _this5 = this;

      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      return this.registerPublicClient(providerUri, options).then(function (registeredClient) {
        _this5.storeClient(registeredClient, providerUri);
        return registeredClient;
      });
    }

    /**
     * @private
     * @param providerUri {string}
     * @param [options={}]
     * @param [options.redirectUri] {string} Defaults to window.location.href
     * @param [options.scope='openid profile'] {string}
     * @throws {TypeError} If providerUri is missing
     * @return {Promise<RelyingParty>} Registered RelyingParty client instance
     */

  }, {
    key: 'registerPublicClient',
    value: function registerPublicClient(providerUri) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      console.log('Registering public client...');
      if (!providerUri) {
        throw new TypeError('Cannot registerClient auth client, missing providerUri');
      }
      var redirectUri = options.redirectUri || this.currentLocation();
      this.redirectUri = redirectUri;
      var registration = {
        issuer: providerUri,
        grant_types: ['implicit'],
        redirect_uris: [redirectUri],
        response_types: ['id_token token'],
        scope: options.scope || 'openid profile'
      };
      var rpOptions = {
        defaults: {
          authenticate: {
            redirect_uri: redirectUri,
            response_type: 'id_token token'
          }
        },
        store: this.store
      };
      return RelyingParty.register(providerUri, registration, rpOptions);
    }
  }, {
    key: 'onMessage',
    value: function onMessage(event) {
      console.log('Auth client received event: ', event);
      if (!event || !event.data) {
        return;
      }
      switch (event.data.event_type) {
        case 'providerSelected':
          var providerUri = event.data.value;
          console.log('Provider selected: ', providerUri);
          this.login(providerUri);
          this.selectProviderWindow.close();
          break;
        default:
          console.error('onMessage - unknown event type: ', event);
          break;
      }
    }

    /**
     * @param state {string}
     * @param providerUri {string}
     * @throws {Error}
     */

  }, {
    key: 'saveProviderByState',
    value: function saveProviderByState(state, providerUri) {
      if (!state) {
        throw new Error('Cannot save providerUri - state not provided');
      }
      var key = this.keyByState(state);
      this.store.setItem(key, providerUri);
    }

    /**
     * Stores a RelyingParty client for a given provider in the local store.
     * @param client {RelyingParty}
     * @param providerUri {string}
     */

  }, {
    key: 'storeClient',
    value: function storeClient(client, providerUri) {
      this.currentClient = client;
      this.store.setItem(this.keyByProvider(providerUri), client.serialize());
    }
  }]);

  return ClientAuthOIDC;
}();

module.exports = ClientAuthOIDC;