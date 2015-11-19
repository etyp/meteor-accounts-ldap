Package.describe({
  name: 'typ:accounts-ldap',
  version: '1.0.0',
  summary: 'Accounts login handler for LDAP using ldapjs and allowing to search anonymously for the DN before binding.',
  git: 'https://github.com/typ90/meteor-accounts-ldap',
  documentation: 'README.md'
});


Package.onUse(function(api) {
    api.versionsFrom('1.0.3.1');

    api.use(['templating'], 'client');
    api.use(['typ:ldapjs@0.7.3'], 'server');

    api.use(['accounts-base', 'accounts-password'], 'server');

    api.addFiles(['ldap_client.js'], 'client');
    api.addFiles(['ldap_server.js'], 'server');

    api.export('LDAP', 'server');
    api.export('LDAP_DEFAULTS', 'server');
});