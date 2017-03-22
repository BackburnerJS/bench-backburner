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
    browser: browserOpts
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
    browser: browserOpts
  })
];
let runner = new Runner(benchmarks);
runner.run(50).then((results) => {
  let samplesCSV = "set,ms,type\n";
  results.forEach(result => {
    let set = result.set;
    result.samples.forEach(sample => {
      samplesCSV += set + "," + (sample.compile / 1000) + ",compile\n";
      samplesCSV += set + "," + (sample.js / 1000) + ",js\n";
      samplesCSV += set + "," + (sample.duration / 1000) + ",duration\n";
    });
  });
  let phasesCSV = "set,phase,ms,type\n";
  results.forEach(result => {
    let set = result.set;
    result.samples.forEach(sample => {
      sample.phaseSamples.forEach(phaseSample => {
        phasesCSV += set + "," + phaseSample.phase + "," + (phaseSample.self / 1000) + ",self\n";
        phasesCSV += set + "," + phaseSample.phase + "," + (phaseSample.cumulative / 1000) + ",cumulative\n";
      });
    });
  });
  require('fs').writeFileSync('results/samples.csv', samplesCSV);
  require('fs').writeFileSync('results/phases.csv', phasesCSV);
  require('fs').writeFileSync('results/results.json', JSON.stringify(results, null, 2));
}).catch((err) => {
  console.error(err.stack);
  process.exit(1);
});
