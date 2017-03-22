import HARRemix, { HAR, ServerDelegate } from "har-remix";
import * as url from "url";
import * as http from "http";
import * as fs from "fs";
import * as uglify from "uglify-js";
import optimize from "./optimize";

declare const gc: {
  (full: boolean): void
};

const HAR_FILE = "archives/feb-14-prod-feed.har";
// const BACKBURNER_DIST = `${process.env.HOME}/src/backburnerjs/backburner.js/dist/named-amd/backburner.js`;
const BACKBURNER_DIST = "vendor/backburner.js";

startServer("control",    HAR_FILE, 8880);
startServer("backburner", HAR_FILE, 8881, (key, text) => {
  if (key === "GET/sc/h/cz7h1fdj8tftv6sgh409oloni,ek2tj30p93vacrletxyjc0tcs,etp1idfhimlshkpwyzjsgv0vv") {
    let match = /\b(.)\("backburner",/.exec(text);
    let start = match.index;
    let define = match[1];
    let end = text.indexOf(`${define}("container/container"`, start);
    let result = uglify.minify(BACKBURNER_DIST, {
      mangle: true,
      compress: {
        // disable these have performance issues
        negate_iife: false,
        sequences: 30
      }
    });
    console.log("replacing backburner");
    let code = optimize(result.code);
    code = code.replace(/^define\(/, `${define}(`);
    text = text.substring(0, start) + code + text.substring(end);
  }
  return text;
});

function replaceProtocolAndDomain(text: string, host: string) {
  return text.replace(/https:\/\//g, "http://").replace(/[a-z\.\-]+\.(?:linkedin|licdn)(?:-ei)?\.com\b/g, host);
}

function key(method: string, url: url.Url) {
  if (url.pathname === '/fizzy/admin' ||
      url.pathname === '/cdo/rum/id' ||
      url.pathname === '/feed/') {
    return method + url.pathname;
  }
  return method + url.path;
}

function startServer(name: string, archivePath: string, port: number, vary?: (key: string, text: string) => string) {
  let host = `localhost:${port}`;

  function keyForArchiveEntry(entry: HAR.Entry) {
    let { request, response } = entry;
    let { status } = response;
    if (status >= 200 && status < 300 && request.method !== "OPTIONS") {
      return key(request.method, url.parse(request.url));
    }
  }

  function keyForServerRequest(request: http.IncomingMessage): string | undefined {
    return key(request.method, url.parse(request.url));
  }

  function textFor(entry: HAR.Entry, key: string, text: string): string {
    if (entry.request.method !== "GET") return text;

    // disable ads
    if (key.indexOf("GET/csp/dtag") !== -1) {
      return "<html><body></body></html>";
    }

    // kill live reload script
    if (key === "GET/ember-cli-live-reload.js") {
      return "";
    }

    // rewrite urls local
    if (key === "GET/feed/") {
      text = text.replace(/\<script[^>]*\"\/ember-cli-live-reload\.js\"[^>]*><\/script>/, "");
      text = text.replace("</body>", `<script>
      if (location.search === "?trace_redirect") {
  Ember.onLoad('application', function (app) {
    app.instanceInitializer({
      name: 'benchmark',
      initialize: function (instance) {
        instance.lookup("router:main").on("didTransition", function () {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {// mark_lazy_render_end
              requestAnimationFrame(function () {// before mark_lazy_render_end paint
                requestAnimationFrame(function () {// after mark_lazy_render_end paint
                  window.location.href = "about:blank";
                });
              });
            });
          })
        });
      }
    });
  });
}
</script></body>`);
      return replaceProtocolAndDomain(text, host);
    }

    if (vary) {
      text = vary(key, text);
    }

    return replaceProtocolAndDomain(text, host);
  }

  let harRemix = new HARRemix({ keyForArchiveEntry, keyForServerRequest, textFor });

  harRemix.loadArchive(archivePath);

  harRemix.setResponse("POST/li/track/validate", harRemix.buildResponse(200, "text/plain", undefined, false));
  let gif = new Buffer("R0lGODlhAQABAIABAP///wAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==", "base64");
  harRemix.setResponse("GET/csp/dtag?p=10", harRemix.buildResponse(200, "image/gif", gif, false));
  harRemix.setResponse("GET/csp/ansync", harRemix.buildResponse(200, "image/gif", gif, false));
  harRemix.setResponse("GET/fizzy/admin", harRemix.buildResponse(200, "text/plain", new Buffer(0), false));
  harRemix.setResponse("GET/cdo/rum/id", harRemix.buildResponse(200, "text/plain", new Buffer(0), false));

  console.log(`starting ${name}`);
  let server = harRemix.createServer();
  server.on("listening", () => {
    console.log(`${name} started at http://localhost:${port}/feed/`);
    if (typeof gc !== 'undefined') gc(true);
  });
  server.on("error", (e) => console.error(e));
  server.listen(port);
}
