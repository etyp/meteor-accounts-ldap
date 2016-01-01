Future = Npm.require('fibers/future');

// At a minimum, set up LDAP_DEFAULTS.url and .dn according to
// your needs. url should appear as 'ldap://your.url.here'
// dn should appear in normal ldap format of comma separated attribute=value
// e.g. 'uid=someuser,cn=users,dc=somevalue'
LDAP_DEFAULTS = {
    url: false,
    port: '389',
    dn: false,
    searchDN: false,
    searchSizeLimit: 100,
    searchCredentials: false,
    createNewUser: true,
    defaultDomain: false,
    searchResultsProfileMap: false,
    base: null,
    search: '(objectclass=*)',
    ldapsCertificate: false
};
LDAP = {};

/**
 @class LDAP
 @constructor
 */
LDAP.create = function (options) {
    // Set options
    this.options = _.defaults(options, LDAP_DEFAULTS);

    // Make sure options have been set
    try {
        check(this.options.url, String);
        //check(this.options.dn, String);
    } catch (e) {
        throw new Meteor.Error('Bad Defaults', 'Options not set. Make sure to set LDAP_DEFAULTS.url and LDAP_DEFAULTS.dn!');
    }

    // Because NPM ldapjs module has some binary builds,
    // We had to create a wraper package for it and build for
    // certain architectures. The package typ:ldap-js exports
    // 'MeteorWrapperLdapjs' which is a wrapper for the npm module
    this.ldapjs = MeteorWrapperLdapjs;
};

/**
 * Attempt to bind (authenticate) ldap
 * and perform a dn search if specified
 *
 * @method ldapCheck
 *
 * @param {Object} [options]  Object with username, ldapPass and overrides for LDAP_DEFAULTS object.
 * Additionally the searchBeforeBind parameter can be specified, which is used to search for the DN
 * if not provided.
 * @param {boolean} [bindAfterFind]  Whether or not to try to login with the supplied credentials or
 * just return whether or not the user exists.
 */
LDAP.create.prototype.ldapCheck = function (options, bindAfterFind) {

    var self = this;

    options = options || {};

    if ((options.hasOwnProperty('username') && options.hasOwnProperty('ldapPass')) || !bindAfterFind) {

        var ldapAsyncFut = new Future();


        // Create ldap client
        var fullUrl = self.options.url + ':' + self.options.port;
        var client = null;

        if (self.options.url.indexOf('ldaps://') === 0) {
            client = self.ldapjs.createClient({
                url: fullUrl,
                tlsOptions: {
                    ca: [self.options.ldapsCertificate]
                }
            });
        }
        else {
            client = self.ldapjs.createClient({
                url: fullUrl
            });
        }

        var retObject = {};

        if (options.username && bindAfterFind) {
            // Slice @xyz.whatever from username if it was passed in
            // and replace it with the domain specified in defaults
            var emailSliceIndex = options.username.indexOf('@');
            var domain = self.options.defaultDomain;
            var username;

            // If user appended email domain, strip it out
            // And use the defaults.defaultDomain if set
            if (emailSliceIndex !== -1) {
                username = options.username.substring(0, emailSliceIndex);
                domain = domain || options.username.substring((emailSliceIndex + 1), options.username.length);

            } else {
                username = options.username;
            }

            retObject.username = username;
            retObject.email = domain ? username + '@' + domain : false;
        }

        var mapResultFields = function (entry) {
            var resultEntry = {};
            if (self.options.searchResultsProfileMap) {
                self.options.searchResultsProfileMap.map(function (item) {
                    resultEntry[item.profileProperty] = entry[item.resultKey];
                });
            } else resultEntry = entry;
            return resultEntry;
        };

        // If DN is provided, use it to bind
        if (self.options.dn) {

            var handleSearchProfile = function (retObject, bindAfterFind) {
                retObject.emptySearch = true;
                retObject.searchResults = [];

                // construct list of ldap attributes to fetch
                var attributes = [];
                if (self.options.searchResultsProfileMap) {
                    self.options.searchResultsProfileMap.map(function (item) {
                        attributes.push(item.resultKey);
                    });
                }

                // use base if given, else the dn for the ldap search
                var searchBase = self.options.base || self.options.dn;
                var searchOptions = {
                    scope: 'sub',
                    sizeLimit: bindAfterFind ? 1 : self.options.searchSizeLimit,
                    attributes: attributes,
                    filter: self.options.search
                };

                client.search(searchBase, searchOptions, function (err, res) {
                    var bound = false;
                    if (err) {
                        ldapAsyncFut.return({
                            error: err
                        });
                    } else {
                        res.on('searchEntry', function (entry) {
                            if (bound) return;
                            retObject.emptySearch = false;
                            if (bindAfterFind) {
                                bound = true;
                                client.bind(entry.object.dn, options.ldapPass, function (err) {
                                    try {
                                        if (err) {
                                            throw new Meteor.Error(err.code, err.message);
                                        }
                                        ldapAsyncFut.return(retObject);
                                    } catch (e) {
                                        ldapAsyncFut.return({
                                            error: e
                                        });
                                    }
                                })
                            }
                            retObject.searchResults.push(mapResultFields(entry.object));
                        });

                        res.on('end', function () {
                            if (retObject.emptySearch || !bindAfterFind) {
                                ldapAsyncFut.return(retObject);
                            }
                        });
                    }
                });
            };
            if (self.options.searchDN || bindAfterFind) {
                // Attempt to bind to ldap server with provided info
                client.bind(self.options.searchDN || self.options.dn, self.options.searchCredentials || options.ldapPass, function (err) {
                    try {
                        if (err) {
                            // Bind failure, return error
                            throw new Meteor.Error(err.code, err.message);
                        }

                        if (self.options.searchDN) {
                            handleSearchProfile(retObject, bindAfterFind);
                        } else if (self.options.searchResultsProfileMap) {
                            handleSearchProfile(retObject, false);
                        } else {
                            ldapAsyncFut.return(retObject);
                        }

                    } catch (e) {
                        ldapAsyncFut.return({
                            error: e
                        });
                    }
                });
            } else handleSearchProfile(retObject);
        }
        // DN not provided, search for DN and use result to bind
        else if (typeof self.options.searchBeforeBind !== undefined) {
            // initialize result
            retObject.emptySearch = true;
            retObject.searchResults = {};

            // compile attribute list to return
            var searchAttributes = ['dn'];
            self.options.searchResultsProfileMap.map(function (item) {
                searchAttributes.push(item.resultKey);
            });


            var filter = self.options.search;
            Object.keys(options.ldapOptions.searchBeforeBind).forEach(function (searchKey) {
                filter = '&' + filter + '(' + searchKey + '=' + options.ldapOptions.searchBeforeBind[searchKey] + ')';
            });
            var searchOptions = {
                scope: 'sub',
                sizeLimit: 1,
                filter: filter
            };

            // perform LDAP search to determine DN
            client.search(self.options.base, searchOptions, function (err, res) {
                retObject.emptySearch = true;
                res.on('searchEntry', function (entry) {
                    retObject.dn = entry.objectName;
                    retObject.username = retObject.dn;
                    retObject.emptySearch = false;
                    retObject.searchResults = mapResultFields(entry.object);

                    // use the determined DN to bind
                    client.bind(entry.objectName, options.ldapPass, function (err) {
                        try {
                            if (err) {
                                throw new Meteor.Error(err.code, err.message);
                            }
                            else {
                                ldapAsyncFut.return(retObject);
                            }
                        }
                        catch (e) {
                            ldapAsyncFut.return({
                                error: e
                            });
                        }
                    });
                });
                // If no dn is found, return as is.
                res.on('end', function (result) {
                    if (retObject.dn === undefined) {
                        ldapAsyncFut.return(retObject);
                    }
                });
            });
        }

        return ldapAsyncFut.wait();

    }
    else {
        throw new Meteor.Error(403, 'Missing LDAP Auth Parameter');
    }

}
;


// Register login handler with Meteor
// Here we create a new LDAP instance with options passed from
// Meteor.loginWithLDAP on client side
// @param {Object} loginRequest will consist of username, ldapPass, ldap, and ldapOptions
Accounts.registerLoginHandler('ldap', function (loginRequest) {
    // If 'ldap' isn't set in loginRequest object,
    // then this isn't the proper handler (return undefined)
    if (!loginRequest.ldap) {
        return undefined;
    }

    // Instantiate LDAP with options
    var userOptions = loginRequest.ldapOptions || {};
    var ldapObj = new LDAP.create(userOptions);

    // Call ldapCheck and get response
    var ldapResponse = ldapObj.ldapCheck(loginRequest, true);

    if (ldapResponse.error) {
        return {
            userId: null,
            error: ldapResponse.error
        };
    }
    else if (ldapResponse.emptySearch) {
        return {
            userId: null,
            error: new Meteor.Error(403, 'User not found in LDAP')
        };
    }
    else {
        // Set initial userId and token vals
        var userId = null;
        var stampedToken = {
            token: null
        };

        // Look to see if user already exists
        var user = Meteor.users.findOne({
            username: ldapResponse.username
        });

        // Login user if they exist
        if (user) {
            userId = user._id;

            // Create hashed token so user stays logged in
            stampedToken = Accounts._generateStampedLoginToken();
            var hashStampedToken = Accounts._hashStampedToken(stampedToken);
            // Update the user's token in mongo
            Meteor.users.update(userId, {
                $push: {
                    'services.resume.loginTokens': hashStampedToken
                }
            });
        }
        // Otherwise create user if option is set
        else if (ldapObj.options.createNewUser) {
            var userObject = {
                username: ldapResponse.username
            };
            // Set email
            if (ldapResponse.email) userObject.email = ldapResponse.email;

            // Set profile values if specified in searchResultsProfileMap
            if (ldapResponse.searchResults && ldapObj.options.searchResultsProfileMap.length > 0) {

                var profileObject = {};
                ldapObj.options.searchResultsProfileMap.map(function (item) {
                    profileObject[item.profileProperty] = ldapResponse.searchResults[0][item.profileProperty];
                });

                // Set userObject profile
                userObject.profile = profileObject;
            }

            userId = Accounts.createUser(userObject);
        } else {
            // Ldap success, but no user created
            console.log('LDAP Authentication succeeded for ' + ldapResponse.username + ', but no user exists in Meteor. Either create the user manually or set LDAP_DEFAULTS.createNewUser to true');
            return {
                userId: null,
                error: new Meteor.Error(403, 'User found in LDAP but not in application')
            };
        }

        return {
            userId: userId,
            token: stampedToken.token
        };
    }

});
