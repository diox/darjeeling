// Provides the `apps` module, a wrapper around `navigator.mozApps`
define('apps',
       ['capabilities', 'log', 'templating', 'utils'],
       function (capabilities, log, templating, utils) {
  'use strict';

  var console = log('apps');
  var gettext = templating._l;

  /*
    It's just like `navigator.apps.install` but returns a promise and handles
    success and error states.

    Usage:

      apps.install({manifest_url: '<manifest_url>''}, options);
      apps.installPackage({manifest_url: '<manifest_url>'}, options);

    The recognised `opt` attributes are as follows:

      data:
        Optional object to pass as navigator.apps.install('<manifest_url>', data);
      success:
        Optional callback for when app installation was successful
      error:
        Optional callback for when app installation resulted in error
      navigator:
        Something other than the global `navigator` (useful for testing)

    API docs:

      https://developer.mozilla.org/docs/DOM/Apps.install

  */

  function install(app, opt) {
    opt = opt || {};
    opt.data = opt.data || {};

    var mozApps = (opt.navigator || window.navigator).mozApps;

    var manifest_url;
    if (app.manifest_url) {
      manifest_url = app.manifest_url;
    }
    if (manifest_url && app.is_packaged && 'src' in opt.data) {
      manifest_url = utils.urlparams(app.manifest_url, {src: opt.data.src});
    }

    // App names should already be localised before we get here (issue #14).
    app.name = utils.translate(app.name);

    console.log('App install started: ' + app.name);

    var promise = new Promise(function (resolve, reject) {

      _install(app);

      function _install(app, reattempt) {
        var installer = app.is_packaged ? 'installPackage' : 'install';
        if (reattempt) {
          // If `navigator.mozApps.installPackage` didn't work, then
          // try `navigator.mozApps.install` on the package mini-manifest
          // once before giving up.
          installer = 'install';
        }
        console.log('Using `navigator.mozApps.' + installer + '` installer');

        // Copy app categories to the installer.
        if (!('categories' in opt.data)) {
          opt.data.categories = app.categories;
        }

        // Try to install the app.
        if (manifest_url && mozApps && mozApps[installer]) {
          var installRequest = mozApps[installer](manifest_url, opt.data);
          installRequest.onsuccess = function () {
            console.log('App installation started: ' + app.name);

            var pkg = this.result;

            if (app.is_packaged) {
              pkg.ondownloadapplied = function (event) {
                console.log('App reported as installed: ' + pkg.name);
                pkg.ondownloadapplied = null;
                pkg.ondownloaderror = null;
                resolve(installRequest.result, app);
              };
              pkg.ondownloaderror = function (event) {
                // if (!reattempt) {
                //   return _install(app, true);
                // }
                reject(gettext('App could not be downloaded',
                               'installErrorDownloading'));
              };
            } else {
              var isInstalled = setInterval(function () {
                if (installRequest.result.installState == 'installed') {
                  console.log('App reported as installed: ' + app.name);
                  clearInterval(isInstalled);
                  resolve(installRequest.result, app);
                }
              }, 100);
            }
          };
          installRequest.onerror = function () {
            if (this.error.name === 'DENIED') {
              // Don't return a message when the user cancels install.
              reject();
            } else {
              reject(gettext('App install error: {error}',
                             'installErrorGeneric',
                             {error: this.error.name || this.error}));
            }
          };
        } else {
          if (!manifest_url) {
            reject('Could not find a manifest URL in the app object');
          } else if (app.is_packaged) {
            reject('Could not find platform support to install packaged app');
          } else {
            reject('Could not find platform support to install hosted app');
          }
        }
      }
    });

    promise.then(function () {
      console.log('App installed successfully: ' + app.name);
    }, function (error) {
      console.error(error, app.name);
    });

    return promise;
  }

  return {
    install: install
  };
});