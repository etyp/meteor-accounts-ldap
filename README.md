Meteor Package accounts-ldap
============================

This is inspired by [emgee3's Accounts Ldap for meteor package](https://github.com/emgee3/meteor-accounts-ldap). emgee3's package is a proof of concept - this package is an attempt to move past proof of concept and create something production ready and tested.


Installation
------------

You can add this package through Atmosphere by typing:

`meteor add typ:accounts-ldap` from the command line.

**OR if you'd like to customize it a bit:**

Clone this repo and copy it to `/packages` in your Meteor project.


Usage
-----

#### Server Side Configuration
The package exposes a global variable called `LDAP_DEFAULTS` on the server side. You **must** specify the `LDAP_DEFAULTS.url` at a minimum. Other options for the defaults are as follows:

##### Defaults

`LDAP_DEFAULTS.port`: Default port is the ldap default of 389.

`LDAP_DEFAULTS.dn`: The ldap dn you want to authenticate on and search. **Chances are you'll want to set this when calling Meteor.loginWithLdap() from client side. See Client Side Configuration for more details**

`LDAP_DEFAULTS.createNewUser`: Boolean value with a default of `true`. This will create a new Meteor.user if the user has not yet been created with the entered ldap email/username.

`LDAP_DFAULTS.defaultDomain`: Specify the email domain to be used when creating a new user on login. Defaults to `false` - so if the user has entered xyz@site.com and `defaultDomain` is not set, then their email will be saved as xyz@site.com.

`LDAP_DEFAULTS.searchResultsProfileMap`: This can be used if there are attributes at your specified dn that you'd like to use to set properties when creating a new user's profile. 

For example, if the results had a 'cn' value of the user's name and a 'tn' value of their phone number, you'd set the `searchResultsProfileMap` to this:

```
LDAP_DEFAULTS.searchResultsProfileMap = [{
  resultKey: 'cn',
  profileProperty: 'name'
}, {
  resultKey: 'tn',
  profileProperty: 'phoneNumber'
}],

// This would create a user profile object that looks like this:
user.profile = {
    name: 'Whatever the cn value was',
    phoneNumber: 'Whatever the tn value was'
}
```

`LDAP_DEFAULTS.base`: This is the base dn used for searches if the searchResultsProfileMap is set.

#### Client Side Configuration

The package exposes a new Meteor login method `Meteor.loginWithLDAP()` which can be called from the client. The usual user and password are required. The third parameter is for custom LDAP options. You'll most likely want to pass in the customLdapOptions.dn on the options object.

An example login call might look ike this:

```
Meteor.loginWithLDAP(username, password, {
    // The dn value depends on what you want to search/auth against
    // The structure will depend on how your ldap server
    // is configured or structured.
  dn: "uid=" + username + ",cn=users,dc=whatever,dc=valuesyouneed",
    // The search value is optional. Set it if your search does not
    // work with the bind dn.
  search: "(objectclass=*)"
}, function(err) {
  if (err)
    console.log(err.reason);
});
```

Issues + Notes
-----

* The LDAP dn is specific to your Active Directory. Talk to whoever manages it to figure out what would work best.
* ***Because the package binds/authenticates with LDAP server-side, the user/password are sent to the server unencrypted. I still need to figure out a solution for this.***
* Right now Node throws a warning on meteor startup: `{ [Error: Cannot find module './build/Debug/DTraceProviderBindings'] code: 'MODULE_NOT_FOUND' }` because optional dependencies are missing. It doesn't seem to affect the ldapjs functionality, but I'm still trying to figure out how to squelch it. See [this thread](https://github.com/mcavage/node-ldapjs/issues/64). As a workaround, you can re-install the included dtrace-provider NPM package: `<project-root>/.meteor/local/build/programs/server/npm/typ_ldapjs/node_modules/ldapjs$ sudo npm install dtrace-provider`


Active Directory
-----

Using AD you can bind using domain\username. This example works for me:

```
//on the server
LDAP_DEFAULTS.base = 'OU=User,DC=your,DC=company,DC=com';

//on the client
var domain = "yourDomain";

Meteor.loginWithLDAP(user, password, 
  { dn: domain + '\\' + user, search: '(sAMAccountName=' + user + ')' } , function(err, result) { ... }
);
```


Going Forward
-----
Please feel free to fork and help improve the repo. I'm very unfamiliar with LDAP and built this package in a way that is probably really specific to my LDAP server configuration. I'm sure configurations vary for everyone, so any suggestions as to how I can make the package more agnostic are **much appreciated**.


Roadmap
-----
TODO - need to figure out what features are missing and might make sense to add...
