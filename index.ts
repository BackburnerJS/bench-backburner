import * as fs from "fs-extra";
import { InitialRenderBenchmark, Runner } from "chrome-tracing";
import * as networkEmulationConditions from 'network-emulation-conditions';

let browserOpts = process.env.CHROME_BIN ? {
  type: "exact",
  executablePath: process.env.CHROME_BIN
} : {
  type: "system"
};
const LIGHTHOUSE_CPU_THROTTLE = 1;// 4.5 is default for p90

const settings = networkEmulationConditions['WIFI'];
const networkConditions = {
    offline: false,
    latency: settings.latency,
    uploadThroughput: settings.upload,
    downloadThroughput: settings.download
};
const cpuThrottleRate = LIGHTHOUSE_CPU_THROTTLE;

console.log({
    networkConditions,
    cpuThrottleRate
});

let benchmarks = [
  new InitialRenderBenchmark({
    name: "backburner",
    url: "http://localhost:8881/feed/?trace_redirect",
    markers: [// mark_app_end
      { start: "navigationStart", label: "load" },
      { start: "mark_app_end", label: "boot" },
      { start: "mark_transition_start", label: "transition" },
      { start: "mark_render_start", label: "render" },
      { start: "mark_render_end", label: "lazy-render" },
      { start: "mark_lazy_render_end", label: "after-render"}
    ],
    browser: browserOpts,
    networkConditions,
    cpuThrottleRate
  }),

  new InitialRenderBenchmark({
    name: "control",
    url: "http://localhost:8880/feed/?trace_redirect",
    markers: [// mark_app_end
      { start: "navigationStart", label: "load" },
      { start: "mark_app_end", label: "boot" },
      { start: "mark_transition_start", label: "transition" },
      { start: "mark_render_start", label: "render" },
      { start: "mark_render_end", label: "lazy-render" },
      { start: "mark_lazy_render_end", label: "after-render"}
    ],
    browser: browserOpts,
    networkConditions,
    cpuThrottleRate
  })
];

fs.emptyDir('./results')
  .then(()=> {
    let runner = new Runner(benchmarks);
    return runner.run(50);
  })
  .then((results) => {
    fs.writeFileSync('results/results.json', JSON.stringify(results, null, 2));
  })
  .catch((err) => {
    console.error(err.stack);
    process.exit(1);
  });
