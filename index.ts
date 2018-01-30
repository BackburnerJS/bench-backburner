import * as fs from "fs-extra";
import { InitialRenderBenchmark, Runner } from "chrome-tracing";
let browserOpts = process.env.CHROME_BIN ? {
  type: "exact",
  executablePath: process.env.CHROME_BIN
} : {
  type: "system"
};
let benchmarks = [
  new InitialRenderBenchmark({
    name: "backburner",
    url: "http://localhost:8881/feed/?trace_redirect",
    markers: [// mark_app_end
      { start: "domLoading", label: "load" },
      { start: "mark_app_end", label: "boot" },
      { start: "mark_transition_start", label: "transition" },
      { start: "mark_render_start", label: "render" },
      { start: "mark_render_end", label: "lazy-render" },
      { start: "mark_lazy_render_end", label: "after-render"}
    ],
    browser: browserOpts,
    runtimeStats: true
  }),
  new InitialRenderBenchmark({
    name: "control",
    url: "http://localhost:8880/feed/?trace_redirect",
    markers: [
      { start: "domLoading",
        label: "load" },
      { start: "mark_app_end",
        label: "boot" },
      { start: "mark_transition_start",
        label: "transition" },
      { start: "mark_render_start",
        label: "render" },
      { start: "mark_render_end",
        label: "lazy-render" },
      { start: "mark_lazy_render_end", label: "after-render"}
    ],
    browser: browserOpts,
    runtimeStats: true
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
